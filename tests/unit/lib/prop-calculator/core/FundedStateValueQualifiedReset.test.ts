import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    DailyLossLimitKind,
    describeFundedResetTerms,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    FundedResetEligibility,
    MffuVariant,
    percent,
    type Plan,
    withFundedResetTaken,
} from '~/lib/prop-calculator/core';
import { solveAverageRewardPolicy } from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    FundedDpModelGapKind,
    fundedDpModelGaps,
} from '~/lib/prop-calculator/core/FundedDpModelGaps';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { RenewalCycleObjective } from '~/lib/prop-calculator/core/RenewalCycleObjective';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const RESET_FEE = 20;
const BUST_TERMINAL_VALUE = -40;
const SIM_TRIALS = 20_000;

function alphaZero(): Plan {
    const plan = new AlphaFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Zero,
    });
    if (!plan) throw new Error('Alpha Futures Zero 50K plan not found');
    return plan;
}

function dpConfig(
    plan: Plan,
    overrides: Partial<FundedStateValueConfig> = {},
): FundedStateValueConfig {
    return {
        actionStepMultiple: 1,
        cushionStepMultiple: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(-BUST_TERMINAL_VALUE),
        maxActionMultiple: 1,
        plan,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.5,
        ...overrides,
    };
}

function rapidEodPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function resetToyPlan(
    overrides: Parameters<Plan['withOverrides']>[0] = {},
): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        fundedReset: {
            eligibility: FundedResetEligibility.NoPayoutEverRequested,
            fee: dollars(RESET_FEE),
            label: 'Toy Reset',
            maxPerAccount: 2,
            windowCalendarDays: 7,
        },
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        takesFundedReset: true,
        ...overrides,
    });
}

describe('computeFundedStateValue models an opted-in funded reset exactly (N-34 DP half)', () => {
    it('values a breach before the first payout as the next reset layer start value minus the fee: 67.50 with two resets against 30.00 without the opt-in', () => {
        const withReset = computeFundedStateValue(dpConfig(resetToyPlan()));
        const withoutReset = computeFundedStateValue(
            dpConfig(resetToyPlan({ takesFundedReset: false })),
        );

        expect(withoutReset.initialValue).toBeCloseTo(30, 9);
        expect(withReset.initialValue).toBeCloseTo(67.5, 9);
        expect(withReset.bustTerminalValue).toBe(BUST_TERMINAL_VALUE);
        expect(withReset.unconvergedLevelCount).toBe(0);
    });

    it('prices the reset with the reset discount flag (T9): 75.00 at 50% off', () => {
        const result = computeFundedStateValue(
            dpConfig(resetToyPlan(), {
                discounts: {
                    activationPercent: percent(0),
                    evalPercent: percent(0),
                    resetPercent: percent(50),
                },
            }),
        );

        expect(result.initialValue).toBeCloseTo(75, 9);
    });

    it('reaches the next reset layer only if the horizon did not end that day, like every other funded day: 64.075 at a 10-day mean horizon', () => {
        const result = computeFundedStateValue(
            dpConfig(resetToyPlan(), { meanHorizonDays: 10 }),
        );

        expect(result.initialValue).toBeCloseTo(64.075, 9);
    });

    it('never resets a breach after the first payout: 137.50 on the two-payout toy', () => {
        const result = computeFundedStateValue(
            dpConfig(resetToyPlan({ maxLifetimePayouts: 2 })),
        );

        expect(result.initialValue).toBeCloseTo(137.5, 9);
    });

    it('never resets an inactivity closure: a trader who can only lose idles into the closure and keeps the bust terminal value', () => {
        const result = computeFundedStateValue(
            dpConfig(resetToyPlan(), { winrate: 0 }),
        );

        expect(result.initialValue).toBeCloseTo(BUST_TERMINAL_VALUE, 9);
    });

    it('rejects a payout regime cap of 0, which cannot tell a breach before the first payout from one after it', () => {
        expect(() =>
            computeFundedStateValue(
                dpConfig(resetToyPlan(), { payoutRegimeCap: 0 }),
            ),
        ).toThrow(/payoutRegimeCap/);
    });

    it('agrees with a real simulate() run that takes the reset, driven by the DP policy', () => {
        const plan = resetToyPlan();
        const result = computeFundedStateValue(dpConfig(plan));
        const out = simulate({
            fundedDayPolicy: result.dayPolicy,
            fundedHorizonDays: 400,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: 2,
            seed: 7,
            tradesPerDay: 1,
            trials: SIM_TRIALS,
            winrate: 0.5,
        });
        const empiricalValue =
            out.expectedGrossPayout -
            out.costBreakdown.fundedResetFeesTotal +
            out.fundedBustProbability * result.bustTerminalValue;
        const perTrialVariance =
            0.5 * 100 ** 2 +
            0.25 * 80 ** 2 +
            0.125 * 60 ** 2 +
            0.125 * (-80) ** 2 -
            67.5 ** 2;
        const standardError = Math.sqrt(perTrialVariance / SIM_TRIALS);

        expect(out.expectedFundedResets).toBeCloseTo(0.75, 1);
        expect(out.fundedBustProbability).toBeCloseTo(0.125, 1);
        expect(
            Math.abs(empiricalValue - result.initialValue),
        ).toBeLessThanOrEqual(4 * standardError);
    }, 60_000);
});

describe('fundedDpModelGaps no longer reports the funded reset as unmodeled', () => {
    it('drops the FundedResetNotModeled kind', () => {
        expect(Object.values(FundedDpModelGapKind)).not.toContain(
            'funded-reset-not-modeled',
        );
    });

    it('reports only that the policy after a reset cannot see the reset count, carrying the plan policy so its text comes from the plan data', () => {
        const zeroTaken = withFundedResetTaken(alphaZero(), true);
        const policy = zeroTaken.fundedReset;
        if (policy === null) throw new Error('Alpha Zero has no reset policy');

        expect(fundedDpModelGaps(zeroTaken)).toStrictEqual([
            {
                kind: FundedDpModelGapKind.FundedResetPolicyIgnoresResetCount,
                policy,
            },
        ]);
        expect(fundedDpModelGaps(alphaZero())).toStrictEqual([]);
        expect(describeFundedResetTerms(policy)).toContain('$499');
    });
});

describe('solveAverageRewardPolicy solves the funded reset inside its own funded DP', () => {
    const HALF_OFF_RESETS = {
        activationPercent: percent(0),
        evalPercent: percent(0),
        resetPercent: percent(50),
    };

    it('charges the reset at the objective reset discount, exactly as a direct funded solve at the chosen rate does', () => {
        const plan = resetToyPlan({
            isInstantFunded: false,
            profitTarget: dollars(50),
        });
        const solution = solveAverageRewardPolicy({
            evalGrid: {
                actionStepDollars: 50,
                cushionStepDollars: 50,
                maxActionDollars: 50,
                profitStepDollars: 50,
                tradesPerDay: 1,
            },
            fundedGrid: {
                actionStepMultiple: 1,
                cushionStepMultiple: 1,
                maxActionMultiple: 1,
                tradesPerDay: 1,
            },
            maxSolves: 1,
            objective: new RenewalCycleObjective({
                discounts: HALF_OFF_RESETS,
                fundedHorizonDays: 20,
                maxEvalDays: 1,
                plan,
                rebuyLagDays: 0,
            }),
            rrRatio: 2,
            winrate: fraction(0.5),
        });
        const direct = (discounts: FundedStateValueConfig['discounts']) =>
            computeFundedStateValue({
                ...dpConfig(plan),
                dayCost: solution.ratePerDay,
                discounts,
                feePerAttempt: dollars(0),
                meanHorizonDays: 20,
            }).initialValue;

        expect(direct(HALF_OFF_RESETS)).toBeGreaterThan(direct(undefined));
        expect(solution.fundedResult.initialValue).toBeCloseTo(
            direct(HALF_OFF_RESETS),
            9,
        );
    });
});
