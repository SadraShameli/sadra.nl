import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    readNumber,
    readRebuyLagDays,
    rebuyLagDaysArgument,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type AccountState,
    type DayPolicy,
    fraction,
    isEvalDpEligible,
    type Plan,
    RenewalCycleObjective,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';
import {
    RateSearchStatus,
    solveAverageRewardPolicy,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    type FundedDpPayoutCapGap,
    FundedDpPayoutCapGapKind,
    fundedDpPayoutCapGaps,
} from '~/lib/prop-calculator/core/FundedDpPayoutCapGaps';
import { isFundedDpEligible } from '~/lib/prop-calculator/core/FundedStateValue';

export function fundedIneligibilityMessage(plan: Plan): string {
    return `${plan.label}: funded phase is not DP-eligible (intraday-trailing drawdown, a terminating or peak-share-dependent funded daily loss limit, no drawdown lock / ReleaseFloor payout effect, or a payout cap keyed on cumulative qualifying days (QualifyingDaysMilestonePayoutCap)).`;
}

export function payoutCountRuleWarning(plan: Plan): null | string {
    const gaps = fundedDpPayoutCapGaps(plan);
    if (gaps.length === 0) return null;
    const described = gaps.map(describeFundedDpPayoutCapGap).join('; ');
    return `${plan.label}: ${described}.`;
}

function describeFundedDpPayoutCapGap(gap: FundedDpPayoutCapGap): string {
    switch (gap.kind) {
        case FundedDpPayoutCapGapKind.LifetimeDollarCapIgnored: {
            return `has a lifetime payout-dollar cap of ${formatCurrency(gap.maxLifetimePayoutDollars)} (maxLifetimePayoutDollars) that this DP ignores entirely -- it never restores FundedCycleTracker.cumulativePayout from any state, so it is optimistic about payouts past that total`;
        }
        case FundedDpPayoutCapGapKind.PayoutCountTierBeyondRegimeCap: {
            return `has a payout-count-tiered payout cap tier starting at payout #${gap.fromPayoutIndex + 1}, beyond this DP's payout-count regime cap of ${gap.payoutRegimeCap} -- payout counts past the cap saturate at the cap bucket inside it, so that tier is not modeled exactly`;
        }
    }
}

function sampleRisks(dayPolicy: DayPolicy, state: AccountState): number[] {
    const slots = dayPolicy.ladder.length;
    return Array.from({ length: slots }, (_, index) =>
        Math.round(dayPolicy.computeRisk?.(state, index, 0, 0) ?? 0),
    );
}

export default defineCommand({
    args: {
        ...planArguments,
        'eval-days': {
            default: '40',
            description:
                'Maximum evaluation days before timeout. The DP’s eval state space grows directly with this (one full day-dimension per value tracked), so raising it well past how long the plan realistically takes to pass will make the solve dramatically slower -- 150 (a normal --eval-days default elsewhere in this CLI) is impractically slow here even after the DP performance fix. Check cli prop ladder’s own expected-days-to-funded figure for this plan first and set this a bit above that.',
            type: 'string',
        },
        'funded-days': {
            default: '252',
            description:
                'Funded-phase horizon for the empirical validation run. Also sets the DP’s mean horizon: the funded value function treats horizon end as a memoryless hazard of 1/this-many-days per funded day.',
            type: 'string',
        },
        iterations: {
            default: '8',
            description:
                'Max rate-search solves (each is one eval plus one funded solve). Stops early once the average-reward rate converges.',
            type: 'string',
        },
        ...rebuyLagDaysArgument,
        rr: {
            default: '2',
            description: 'Reward to risk ratio',
            type: 'string',
        },
        seed: {
            default: '42',
            description: 'RNG seed for the empirical validation run',
            type: 'string',
        },
        trials: {
            default: '4000',
            description: 'Monte Carlo trials for the empirical validation run',
            type: 'string',
        },
        winrate: {
            default: '0.4',
            description: 'Win rate (0-1)',
            type: 'string',
        },
    },
    meta: {
        description:
            'Solve the average-reward eval+funded value-iteration DP for one plan (--firm, --variant): a state-dependent risk policy (risk depends on current balance/profit/day, not a fixed ladder) that maximizes expected net cash per month per account slot, replacement priced in via --rebuy-lag-days, cross-checked against a real simulate() run.',
        name: 'dp',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const plan = planResolver.resolveOne(context.args);
            if (plan.isInstantFunded) {
                ui.warn(
                    `${plan.label} is instant-funded -- there is no eval phase for the DP to solve. Use a fixed funded-phase policy sweep instead (cli prop optimize funded).`,
                );
                return;
            }
            if (!isEvalDpEligible(plan)) {
                ui.warn(
                    `${plan.label}: eval phase is not DP-eligible (intraday-trailing drawdown, or an eval daily loss limit that depends on peak-day-close profit).`,
                );
                return;
            }
            if (!isFundedDpEligible(plan)) {
                ui.warn(fundedIneligibilityMessage(plan));
                return;
            }
            const payoutWarning = payoutCountRuleWarning(plan);
            if (payoutWarning !== null) {
                ui.warn(payoutWarning);
            }

            const winrate = readNumber(context.args.winrate, 'winrate');
            const rrRatio = readNumber(context.args.rr, 'rr');
            const maxEvalDays = readNumber(
                context.args['eval-days'],
                'eval-days',
            );
            const fundedHorizonDays = readNumber(
                context.args['funded-days'],
                'funded-days',
            );
            const trials = readNumber(context.args.trials, 'trials');
            const seed = readNumber(context.args.seed, 'seed');
            const maxSolves = readNumber(context.args.iterations, 'iterations');
            const rebuyLagDays = readRebuyLagDays(
                context.args['rebuy-lag-days'],
            );

            const objective = new RenewalCycleObjective({
                fundedHorizonDays,
                maxEvalDays,
                plan,
                rebuyLagDays,
            });

            spinner = ui
                .spinner(`solving average-reward DP for ${plan.label}`)
                .start();
            const started = performance.now();
            const solution = solveAverageRewardPolicy({
                maxSolves,
                objective,
                rrRatio,
                winrate: fraction(winrate),
            });
            const elapsed = (performance.now() - started) / 1000;
            const solvesUsed = solution.trace.length;
            const totalStates =
                solution.evalResult.reachedStateCount +
                solution.fundedResult.reachedStateCount;
            spinner.succeed(
                `solved ${plan.label} in ${elapsed.toFixed(1)}s (${solvesUsed} rate-search solves, ${totalStates} states)`,
            );

            const monthlyRate = objective.monthlyRate(solution.ratePerDay);

            ui.heading(plan.label);
            ui.muted(
                '  DP-predicted average reward (from the value-iteration solver itself -- the geometric horizon hazard is an approximation, see empirical run below)\n',
            );
            ui.note(`  status: ${solution.status}`);
            ui.note(
                `  rate: ${formatCurrency(solution.ratePerDay, 2)}/day, ${formatCurrency(monthlyRate)}/month per account slot`,
            );
            ui.note(`  solves used: ${solvesUsed}`);
            ui.muted(
                '  rate-search trace (rate per day tried -> cycle value h at that rate):\n',
            );
            for (const point of solution.trace) {
                ui.note(
                    `    ${formatCurrency(point.ratePerDay, 2)}/day -> h = ${formatCurrency(point.cycleValue)}`,
                );
            }

            const simInputs: SimInputs = {
                evalDayPolicy: solution.evalResult.dayPolicy,
                fundedDayPolicy: solution.fundedResult.dayPolicy,
                fundedHorizonDays,
                maxAttempts: 1,
                maxEvalDays,
                plan,
                rebuyLagDays,
                riskPerTrade: 1,
                rrRatio,
                seed,
                tradesPerDay: 1,
                trials,
                winrate,
            };
            const out = simulate(simInputs);
            const gap = out.expectedMonthlyNet - monthlyRate;

            ui.muted(
                '\n  empirical (real simulate() run driven end-to-end by the DP’s own policy -- trust this over the predicted values above)\n',
            );
            ui.note(`  eval pass rate: ${formatPercent(out.passProbability)}`);
            ui.note(
                `  funded bust probability: ${formatPercent(out.fundedBustProbability)}`,
            );
            ui.note(
                `  expected monthly net per account slot: ${formatCurrency(out.expectedMonthlyNet)}`,
            );
            ui.note(
                `  expected horizon credit per cycle: ${formatCurrency(out.expectedHorizonCredit)}`,
            );
            ui.note(
                `  gap vs DP-predicted monthly rate: ${formatCurrency(gap)}`,
            );

            const evalSampleState = plan.initialState();
            const fundedSampleState = plan.initialState();
            plan.beginFundedPhase(fundedSampleState);

            ui.muted(
                '\n  sample risk at the very first day (this is NOT a fixed ladder -- it is one snapshot of a function that changes with balance/profit/day; re-run this command’s dashboard mentally as your account moves)\n',
            );
            ui.note(
                `  eval, day 1, trade 1-${solution.evalResult.dayPolicy.ladder.length}: ${sampleRisks(
                    solution.evalResult.dayPolicy,
                    evalSampleState,
                )
                    .map((r) => `$${r}`)
                    .join(' / ')}`,
            );
            ui.note(
                `  funded, day 1, trade 1-${solution.fundedResult.dayPolicy.ladder.length}: ${sampleRisks(
                    solution.fundedResult.dayPolicy,
                    fundedSampleState,
                )
                    .map((r) => `$${r}`)
                    .join(' / ')}`,
            );

            if (
                solution.status !== RateSearchStatus.Converged ||
                solution.fundedResult.unconvergedLevelCount > 0
            ) {
                ui.warn(
                    `${plan.label}: rate search did not converge (status=${solution.status}, unconverged funded levels=${solution.fundedResult.unconvergedLevelCount}) -- treat the numbers above as unreliable; consider raising --iterations.`,
                );
                process.exitCode = 1;
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});
