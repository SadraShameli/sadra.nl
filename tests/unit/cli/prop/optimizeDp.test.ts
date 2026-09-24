import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it, vi } from 'vitest';

import optimizeDp, {
    dpArguments,
    EMPIRICAL_MAX_ATTEMPTS,
    empiricalSimInputs,
    empiricalSummaryLines,
    fundedConsistencyGridNote,
    fundedIneligibilityMessage,
    payoutCountRuleWarning,
    readDpInputs,
    renewalObjective,
    resolveDpPlan,
} from '~/cli/commands/prop/optimize/dp/command';
import {
    ApexVariant,
    type DayPolicy,
    dollars,
    E8FuturesVariant,
    FirmId,
    MffuVariant,
    type Plan,
    type SimOutputs,
    simulate,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    DayStopRuleKind,
    FtmoFuturesVariant,
    FundedNextVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { solveAverageRewardPolicy } from '~/lib/prop-calculator/core/AverageRewardSolver';
import { isFundedDpEligible } from '~/lib/prop-calculator/core/FundedStateValue';
import { PayoutCountTieredPayoutCap } from '~/lib/prop-calculator/core/PayoutCap';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { FtmoFutures } from '~/lib/prop-calculator/firms/ftmo-futures/FtmoFutures';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

vi.mock(
    import('~/lib/prop-calculator/core/AverageRewardSolver'),
    async (importOriginal) => {
        const actual = await importOriginal();
        return {
            ...actual,
            solveAverageRewardPolicy: vi.fn(actual.solveAverageRewardPolicy),
        };
    },
);

vi.mock(import('~/lib/prop-calculator'), async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, simulate: vi.fn(actual.simulate) };
});

function apexEodPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return plan;
}

function apexIntradayPlan(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Intraday,
    });
    if (!plan) throw new Error('Apex Intraday 50K plan not found');
    return plan;
}

function findE8SignaturePlan(): Plan {
    const plan = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });
    if (!plan) throw new Error('E8 Signature 50K plan not found');
    return plan;
}

function legacyPlan(): Plan {
    const plan = new FundedNext().findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant: FundedNextVariant.Legacy,
    });
    if (!plan) throw new Error('FundedNext Legacy 50K plan not found');
    return plan;
}

function mffBuilderPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder 50K plan not found');
    return plan;
}

function mffProPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro 50K plan not found');
    return plan;
}

function topStepNoFeeStandardPlan(): Plan {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep no-fee-standard 50K plan not found');
    return plan;
}

describe('fundedIneligibilityMessage', () => {
    it('names the cumulative-qualifying-days payout cap as a reason, for FundedNext Legacy', () => {
        const message = fundedIneligibilityMessage(legacyPlan());
        expect(message).toContain('QualifyingDaysMilestonePayoutCap');
        expect(message).toContain('cumulative qualifying days');
    });

    it('no longer lists a terminating daily loss limit, only the continuously peak-scaled one', () => {
        const message = fundedIneligibilityMessage(legacyPlan());
        expect(message).not.toContain('terminating');
        expect(message).toContain('PeakProfitShare');
    });

    it('FTMO Futures Pro 50K, whose funded daily loss limit terminates the account, is now DP-eligible', () => {
        const plan = new FtmoFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Pro,
        });
        if (!plan) throw new Error('FTMO Futures Pro 50K plan not found');
        expect(plan.isDailyLossLimitTerminating(TradingPhase.Funded)).toBe(
            true,
        );
        expect(isFundedDpEligible(plan)).toBe(true);
    });
});

describe('fundedConsistencyGridNote (N-65)', () => {
    it('says nothing for a plan without a funded consistency rule', () => {
        const plan = new FtmoFutures().findPlan({
            accountSize: 50_000,
            firm: FirmId.FtmoFutures,
            variant: FtmoFuturesVariant.Growth,
        });
        if (!plan) throw new Error('FTMO Futures Growth 50K plan not found');
        expect(plan.fundedConsistencyRule()).toBeNull();
        expect(fundedConsistencyGridNote(plan)).toBeNull();
        expect(
            fundedConsistencyGridNote(topStepNoFeeStandardPlan()),
        ).toBeNull();
    });

    it('discloses for MFF Builder that the 6 drawdown cushion grid truncates both the balance and a day ending above the grid top, so neither direction of the consistency error is guaranteed there, without claiming the DP is conservative (N-65 review)', () => {
        const plan = mffBuilderPlan();
        const note = fundedConsistencyGridNote(plan);
        expect(note).not.toBeNull();
        expect(note?.startsWith(`${plan.label}: `)).toBe(true);
        expect(note).toContain('50%');
        expect(note).toContain('6 drawdowns');
        expect(note).toContain('rounded up between grid steps');
        expect(note).toContain('a day that ends above the grid top');
        expect(note).toContain('neither direction is guaranteed');
        expect(note).not.toContain('conservative');
        expect(note).not.toContain('never allows a payout the real rule denies');
        expect(note?.slice(plan.label.length)).not.toContain('\u{2014}');
    });
});

describe('payoutCountRuleWarning', () => {
    it('returns null for Apex EOD: its payoutLadder (6 steps) and maxLifetimePayouts (6) both fit inside the DP payout-count regime cap of 6', () => {
        expect(payoutCountRuleWarning(apexEodPlan())).toBeNull();
    });

    it('returns null for Apex Intraday, for the same reason as EOD', () => {
        expect(payoutCountRuleWarning(apexIntradayPlan())).toBeNull();
    });

    it('returns null for E8 Signature: its tiered payout cap tiers (0, 2, 4) and maxLifetimePayouts (5) both fit inside the regime cap', () => {
        expect(payoutCountRuleWarning(findE8SignaturePlan())).toBeNull();
    });

    it('returns null for MFF Builder: its payoutLadder (5 steps) and maxLifetimePayouts (5) both fit inside the regime cap', () => {
        expect(payoutCountRuleWarning(mffBuilderPlan())).toBeNull();
    });

    it('returns null for TopStep no-fee-standard: it has no count-keyed payout rule at all', () => {
        expect(payoutCountRuleWarning(topStepNoFeeStandardPlan())).toBeNull();
    });

    it('warns about MFF Pro’s $100,000 lifetime payout-dollar cap and says this DP ignores it (optimistic)', () => {
        const warning = payoutCountRuleWarning(mffProPlan());
        expect(warning).not.toBeNull();
        expect(warning).toContain('$100,000');
        expect(warning).toContain('maxLifetimePayoutDollars');
        expect(warning).toContain('ignores');
        expect(warning).toContain('cumulativePayout');
    });

    it('warns that MFF Pro’s payout-triggered lock lets the pre-lock floor trail past the DP offset grid', () => {
        const warning = payoutCountRuleWarning(mffProPlan());
        expect(warning).toContain(
            'locks its funded drawdown only on the first payout',
        );
        expect(warning).toContain('saturate');
        expect(warning).toContain('understates the balance');
        expect(warning).toContain('pessimistic');
        expect(warning).not.toContain('slightly optimistic');
    });

    it('warns about a PayoutCountTieredPayoutCap tier beyond the regime cap and says it saturates', () => {
        const plan = topStepNoFeeStandardPlan().withOverrides({
            payoutBalanceShareCap: undefined,
            payoutCapOverride: new PayoutCountTieredPayoutCap([
                {
                    fromPayoutIndex: 0,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(1000),
                    },
                },
                {
                    fromPayoutIndex: 9,
                    regime: {
                        balanceShareCap: null,
                        requestCap: dollars(2000),
                    },
                },
            ]),
            payoutRequestCap: undefined,
        });

        const warning = payoutCountRuleWarning(plan);
        expect(warning).not.toBeNull();
        expect(warning).toContain('payout #10');
        expect(warning).toContain('regime cap of 6');
        expect(warning).toContain('saturate');
    });
});

async function resolveArguments(): Promise<ArgsDef> {
    const resolvable = optimizeDp.args;
    if (!resolvable) throw new Error('optimize dp command has no args');
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    return resolved instanceof Promise ? resolved : resolved;
}

describe('optimize dp arguments', () => {
    it('defaults --rebuy-lag-days to 0', async () => {
        const arguments_ = await resolveArguments();
        const parsed = parseArgs([], arguments_);
        expect(parsed['rebuy-lag-days']).toBe('0');
    });

    it('still exposes --iterations as max rate-search solves', async () => {
        const arguments_ = await resolveArguments();
        expect(arguments_.iterations).toBeDefined();
        const parsed = parseArgs([], arguments_);
        expect(parsed.iterations).toBe('8');
    });
});

function resolvedDpPlan(argv: string[]): Plan {
    return resolveDpPlan(parseArgs<typeof dpArguments>(argv, dpArguments));
}

describe('optimize dp takes the MFF Pro one-time early withdrawal opt-in (N-64, T30)', () => {
    it('solves the opted-in rule when --early-withdrawal is passed', () => {
        expect(
            resolvedDpPlan([
                '--firm',
                'mffu',
                '--variant',
                'pro',
                '--early-withdrawal',
            ]).takesOneTimeEarlyWithdrawal,
        ).toBe(true);
    });

    it('solves the default rule without the flag', () => {
        expect(
            resolvedDpPlan(['--firm', 'mffu', '--variant', 'pro'])
                .takesOneTimeEarlyWithdrawal,
        ).toBe(false);
        expect(mffProPlan().takesOneTimeEarlyWithdrawal).toBe(false);
    });

    it('leaves a plan without the rule unchanged', () => {
        const plan = resolvedDpPlan([
            '--firm',
            'mffu',
            '--variant',
            'builder',
            '--early-withdrawal',
        ]);

        expect(plan.oneTimeEarlyWithdrawal).toBeNull();
        expect(plan.takesOneTimeEarlyWithdrawal).toBe(false);
    });
});

describe('optimize dp run() warms the firm registry before its first solve (N-63)', () => {
    it('runs the very first funded solve on the worker pool instead of single-threaded', async () => {
        const argv = [
            '--firm',
            'mffu',
            '--variant',
            'rapid-eod',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
        ];
        vi.mocked(solveAverageRewardPolicy).mockClear();
        const exitCode = process.exitCode;
        try {
            await optimizeDp.run?.({
                args: parseArgs<typeof dpArguments>(argv, dpArguments),
                cmd: optimizeDp,
                rawArgs: argv,
            });
        } finally {
            process.exitCode = exitCode;
        }

        const [firstSolve] = vi.mocked(solveAverageRewardPolicy).mock.results;
        expect(firstSolve?.type).toBe('return');
        expect(
            firstSolve?.type === 'return'
                ? firstSolve.value.fundedResult.workerCount
                : 0,
        ).toBeGreaterThan(0);
    }, 600_000);
});

describe('optimize dp run() hands the opted-in plan to both the DP objective and the empirical replay (N-64)', () => {
    it('solves and replays the MFF Pro rule with the one-time early withdrawal taken when --early-withdrawal is passed', async () => {
        const argv = [
            '--firm',
            'mffu',
            '--variant',
            'pro',
            '--early-withdrawal',
            '--eval-days',
            '2',
            '--funded-days',
            '2',
            '--iterations',
            '1',
            '--trials',
            '10',
        ];
        vi.mocked(solveAverageRewardPolicy).mockClear();
        vi.mocked(simulate).mockClear();
        const exitCode = process.exitCode;
        try {
            await optimizeDp.run?.({
                args: parseArgs<typeof dpArguments>(argv, dpArguments),
                cmd: optimizeDp,
                rawArgs: argv,
            });
        } finally {
            process.exitCode = exitCode;
        }

        expect(
            vi
                .mocked(solveAverageRewardPolicy)
                .mock.calls.map(
                    ([config]) =>
                        config.objective.plan.takesOneTimeEarlyWithdrawal,
                ),
        ).toStrictEqual([true]);
        expect(
            vi
                .mocked(simulate)
                .mock.calls.map(
                    ([inputs]) => inputs.plan.takesOneTimeEarlyWithdrawal,
                ),
        ).toStrictEqual([true]);
    }, 180_000);
});

function parseDpInputs(argv: string[]) {
    return readDpInputs(parseArgs<typeof dpArguments>(argv, dpArguments));
}

describe('optimize dp flag bounds', () => {
    it.each([
        ['winrate', '40', /--winrate must be a fraction in \[0, 1\]/],
        ['trials', '0', /--trials must be a whole number >= 1/],
        ['seed', '1.5', /--seed must be a whole number/],
        ['rr', '0', /--rr must be a number > 0/],
        ['eval-days', '0', /--eval-days must be a whole number >= 1/],
        ['funded-days', '0', /--funded-days must be a whole number >= 1/],
        ['iterations', '2.5', /--iterations must be a whole number >= 1/],
        ['copy-accounts', '0', /--copy-accounts must be a whole number >= 1/],
        ['eval-discount', '101', /--eval-discount/],
    ])('rejects --%s %s, naming the flag', (flag, value, message) => {
        expect(() => parseDpInputs([`--${flag}=${value}`])).toThrow(message);
    });

    it('reads the defaults', () => {
        expect(parseDpInputs([])).toStrictEqual({
            copyAccounts: 1,
            discounts: undefined,
            fundedHorizonDays: 252,
            maxEvalDays: 40,
            maxSolves: 8,
            rebuyLagDays: 0,
            rrRatio: 2,
            seed: 42,
            trials: 4000,
            winrate: 0.4,
        });
    });
});

describe('optimize dp empirical summary (D2)', () => {
    const base = simulate({
        fundedHorizonDays: 20,
        maxEvalDays: 30,
        plan: apexEodPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: 20,
        winrate: 0.5,
    });
    const out: SimOutputs = {
        ...base,
        evalPassProbability: 0.8,
        fundedSurvivalProbability: 0.1,
    };
    const lines = empiricalSummaryLines(out, out.expectedMonthlyNet, 1);

    it('labels evalPassProbability as the chance of eventually passing within the retry cap, not a per-attempt pass rate (N-62)', () => {
        expect(lines).toContain(
            `eventual eval pass within the ${EMPIRICAL_MAX_ATTEMPTS}-attempt retry cap: 80.0%`,
        );
        expect(lines.some((line) => line.startsWith('eval pass rate'))).toBe(
            false,
        );
    });

    it('adds the funded survive rate as its own line', () => {
        expect(lines).toContain('funded survive: 10.0%');
    });

    it('reports a zero gap when the empirical monthly net equals the DP rate', () => {
        expect(lines).toContain('gap vs DP-predicted monthly rate: $0');
    });
});

describe('optimize dp prices the empirical cross-check like the DP (N-62)', () => {
    const plan = topStepNoFeeStandardPlan();
    const inputs = parseDpInputs([
        '--eval-discount=20',
        '--activation-discount=10',
        '--monthly-discount=5',
        '--copy-accounts=3',
    ]);
    const policy: DayPolicy = {
        ladder: [200],
        maxLossesPerDay: null,
        stopRule: { kind: DayStopRuleKind.None },
    };

    it('reads the coupon discounts and the copy count', () => {
        expect(inputs.discounts).toStrictEqual({
            activationPercent: 10,
            evalPercent: 20,
            monthlySubscriptionPercent: 5,
        });
        expect(inputs.copyAccounts).toBe(3);
    });

    it('hands the discounts and copy count to the renewal-cycle objective', () => {
        const objective = renewalObjective(inputs, plan);
        expect(objective.discounts).toStrictEqual(inputs.discounts);
        expect(objective.copyAccounts).toBe(3);
        expect(objective.purchaseDiscounts).toStrictEqual(
            plan.purchaseDiscounts(inputs.discounts, 3),
        );
    });

    it('retries failed evals in the simulate() cross-check, with the same discounts and copy count', () => {
        const simInputs = empiricalSimInputs(inputs, plan, {
            evalDayPolicy: policy,
            fundedDayPolicy: policy,
        });
        expect(EMPIRICAL_MAX_ATTEMPTS).toBeGreaterThanOrEqual(1000);
        expect(simInputs.maxAttempts).toBe(EMPIRICAL_MAX_ATTEMPTS);
        expect(simInputs.discounts).toStrictEqual(inputs.discounts);
        expect(simInputs.copyAccounts).toBe(3);
        expect(simInputs.evalDayPolicy).toBe(policy);
        expect(simInputs.fundedDayPolicy).toBe(policy);
    });

    it('keeps retrying busted evals until one passes, so every trial reaches the funded phase', () => {
        const swingPolicy: DayPolicy = { ...policy, ladder: [1000] };
        const out = simulate(
            empiricalSimInputs(
                {
                    ...inputs,
                    fundedHorizonDays: 5,
                    maxEvalDays: 60,
                    trials: 200,
                },
                plan,
                { evalDayPolicy: swingPolicy, fundedDayPolicy: policy },
            ),
        );
        expect(out.expectedAttempts).toBeGreaterThan(1);
        expect(out.evalPassProbability).toBe(1);
    }, 60_000);

    it('compares the DP rate per account slot, so the copy count does not show up as a gap', () => {
        const base = simulate({
            fundedHorizonDays: 20,
            maxEvalDays: 30,
            plan: apexEodPlan(),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 4,
            trials: 20,
            winrate: 0.5,
        });
        const threeCopies: SimOutputs = {
            ...base,
            expectedHorizonCredit: 3 * 400,
            expectedMonthlyNet: 3 * 1000,
        };
        const lines = empiricalSummaryLines(threeCopies, 1000, 3);
        expect(lines).toContain(
            'expected monthly net per account slot: $1,000',
        );
        expect(lines).toContain('expected horizon credit per cycle: $400');
        expect(lines).toContain('gap vs DP-predicted monthly rate: $0');
    });
});
