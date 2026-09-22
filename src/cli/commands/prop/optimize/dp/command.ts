import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    readNumber,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type AccountState,
    computeEvalStateValue,
    computeFundedStateValue,
    type DayPolicy,
    dollars,
    type EvalStateValueResult,
    fraction,
    type FundedStateValueResult,
    isEvalDpEligible,
    isFundedDpEligible,
    lifetimeExpectedNet,
    type Plan,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';

interface JointFixedPoint {
    evalResult: EvalStateValueResult;
    fundedResult: FundedStateValueResult;
    iterationsUsed: number;
}

function sampleRisks(dayPolicy: DayPolicy, state: AccountState): number[] {
    const slots = dayPolicy.ladder.length;
    return Array.from({ length: slots }, (_, index) =>
        Math.round(dayPolicy.computeRisk?.(state, index, 0, 0) ?? 0),
    );
}

function solveJointFixedPoint(
    plan: Plan,
    winrate: number,
    rrRatio: number,
    maxEvalDays: number,
    maxIterations: number,
    convergenceTolerance: number,
): JointFixedPoint {
    const feePerAttempt = dollars(plan.fees.reset);
    let evalInitialValueGuess = 0;
    let evalResult: EvalStateValueResult | undefined;
    let fundedResult: FundedStateValueResult | undefined;
    let iterationsUsed = 0;
    for (
        let iteration = 0;
        iteration < Math.max(1, maxIterations);
        iteration++
    ) {
        fundedResult = computeFundedStateValue({
            evalInitialValue: evalInitialValueGuess,
            feePerAttempt,
            plan,
            rrRatio,
            winrate,
        });
        evalResult = computeEvalStateValue({
            maxEvalDays,
            plan,
            rrRatio,
            terminalValueAtPass: fundedResult.initialValue,
            winrate: fraction(winrate),
        });
        iterationsUsed = iteration + 1;
        const delta = Math.abs(evalResult.initialValue - evalInitialValueGuess);
        evalInitialValueGuess = evalResult.initialValue;
        if (delta < convergenceTolerance) break;
    }
    if (!evalResult || !fundedResult) {
        throw new Error(
            `${plan.label}: joint DP fixed point never ran a single iteration`,
        );
    }
    return { evalResult, fundedResult, iterationsUsed };
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
                'Funded-phase horizon for the empirical validation run',
            type: 'string',
        },
        iterations: {
            default: '8',
            description:
                'Max outer eval/funded fixed-point iterations (stops early on convergence). Each iteration is a full eval + funded DP solve, so this multiplies total runtime directly.',
            type: 'string',
        },
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
            'Solve the joint eval+funded value-iteration DP for one plan (--firm, --variant): a state-dependent risk policy (risk depends on current balance/profit/day, not a fixed ladder), cross-checked against a real simulate() run.',
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
                ui.warn(
                    `${plan.label}: funded phase is not DP-eligible (intraday-trailing drawdown, a terminating or peak-share-dependent funded daily loss limit, or no drawdown lock / ReleaseFloor payout effect).`,
                );
                return;
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
            const maxIterations = readNumber(
                context.args.iterations,
                'iterations',
            );

            spinner = ui.spinner(`solving joint DP for ${plan.label}`).start();
            const started = performance.now();
            const { evalResult, fundedResult, iterationsUsed } =
                solveJointFixedPoint(
                    plan,
                    winrate,
                    rrRatio,
                    maxEvalDays,
                    maxIterations,
                    1,
                );
            const elapsed = (performance.now() - started) / 1000;
            spinner.succeed(
                `solved ${plan.label} in ${elapsed.toFixed(1)}s (${iterationsUsed} fixed-point iterations, ${evalResult.reachedStateCount + fundedResult.reachedStateCount} states)`,
            );

            const evalCost = plan.fees.oneTimeEval + plan.fees.activation;
            const netEvalValue = evalResult.initialValue - evalCost;

            ui.heading(plan.label);
            ui.muted(
                '  DP-predicted values (from the value-iteration solver itself -- known to run optimistic, see empirical run below)\n',
            );
            ui.note(
                `  value of a fresh funded account: ${formatCurrency(fundedResult.initialValue)}`,
            );
            ui.note(
                `  value of one eval attempt, net of its $${evalCost.toFixed(0)} cost: ${formatCurrency(netEvalValue)}`,
            );

            const simInputs: SimInputs = {
                evalDayPolicy: evalResult.dayPolicy,
                fundedDayPolicy: fundedResult.dayPolicy,
                fundedHorizonDays,
                maxEvalDays,
                plan,
                riskPerTrade: 1,
                rrRatio,
                seed,
                tradesPerDay: 1,
                trials,
                winrate,
            };
            const out = simulate(simInputs);
            const costOfOneMoreAttempt = plan.feesUntilPass(
                out.expectedDaysToPass,
            );
            let empiricalLifetimeNet: null | number = null;
            if (out.fundedBustProbability < 1) {
                empiricalLifetimeNet = lifetimeExpectedNet({
                    costOfOneMoreAttempt,
                    expectedNet: out.expectedNet,
                    fundedBustProbability: out.fundedBustProbability,
                });
            }

            ui.muted(
                '\n  empirical (real simulate() run driven end-to-end by the DP’s own policy -- trust this over the predicted values above)\n',
            );
            ui.note(`  eval pass rate: ${formatPercent(out.passProbability)}`);
            ui.note(
                `  funded bust probability: ${formatPercent(out.fundedBustProbability)}`,
            );
            ui.note(
                `  expected net over one ${fundedHorizonDays}-day funded cycle: ${formatCurrency(out.expectedNet)}`,
            );
            ui.note(
                `  renewal-adjusted lifetime net (unlimited repeat cycles): ${empiricalLifetimeNet === null ? 'n/a (100% bust)' : formatCurrency(empiricalLifetimeNet)}`,
            );

            const evalSampleState = plan.initialState();
            const fundedSampleState = plan.initialState();
            plan.beginFundedPhase(fundedSampleState);

            ui.muted(
                '\n  sample risk at the very first day (this is NOT a fixed ladder -- it is one snapshot of a function that changes with balance/profit/day; re-run this command’s dashboard mentally as your account moves)\n',
            );
            ui.note(
                `  eval, day 1, trade 1-${evalResult.dayPolicy.ladder.length}: ${sampleRisks(
                    evalResult.dayPolicy,
                    evalSampleState,
                )
                    .map((r) => `$${r}`)
                    .join(' / ')}`,
            );
            ui.note(
                `  funded, day 1, trade 1-${fundedResult.dayPolicy.ladder.length}: ${sampleRisks(
                    fundedResult.dayPolicy,
                    fundedSampleState,
                )
                    .map((r) => `$${r}`)
                    .join(' / ')}`,
            );
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});
