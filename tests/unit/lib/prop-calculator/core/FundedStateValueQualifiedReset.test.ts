import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type AccountState,
    AlphaFuturesVariant,
    DailyLossLimitKind,
    describeFundedResetTerms,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type FundedCycleSnapshot,
    FundedResetEligibility,
    fundedResetsBeforeFirstPayout,
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
const LAYERED_WINRATE = 0.25;
const LAYERED_SIM_TRIALS = 40_000;

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

function fundedStartState(plan: Plan): AccountState {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return state;
}

function layeredToyPlan(): Plan {
    return resetToyPlan({ maxConsecutiveIdleDays: undefined });
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

function riskWithDayGateProgress(
    dayGateProgress: number,
    payoutsIssued: number,
): { label: string; risk: () => number | undefined } {
    const plan = resetToyPlan({ maxLifetimePayouts: 2 });
    const result = computeFundedStateValue(dpConfig(plan));
    const state = fundedStartState(plan);
    if (payoutsIssued > 0) {
        state.threshold = 1000;
        state.thresholdLocked = true;
        state.balance = 1100;
    }
    return {
        label: plan.label,
        risk: () =>
            result.dayPolicy.computeRisk?.(state, 0, {
                cycleBestDayProfit: 0,
                dayGateProgress,
                fundedResetsUsed: 0,
                lastPayoutBalance: state.balance,
                payoutsIssued,
            }),
    };
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

    it('reports no reset gap at all now that the day policy picks its reset layer (N-34)', () => {
        const zeroTaken = withFundedResetTaken(alphaZero(), true);
        const policy = zeroTaken.fundedReset;
        if (policy === null) throw new Error('Alpha Zero has no reset policy');

        expect(Object.values(FundedDpModelGapKind)).not.toContain(
            'funded-reset-policy-ignores-reset-count',
        );
        expect(fundedDpModelGaps(zeroTaken)).toStrictEqual([]);
        expect(fundedDpModelGaps(alphaZero())).toStrictEqual([]);
        expect(describeFundedResetTerms(policy)).toContain('$499');
    });
});

describe('fundedResetsBeforeFirstPayout is the one source for whether a funded reset applies before the first payout', () => {
    it('counts the resets the plan allows before its first payout: 2 on the toy, 0 without the opt-in', () => {
        expect(fundedResetsBeforeFirstPayout(resetToyPlan())).toBe(2);
        expect(
            fundedResetsBeforeFirstPayout(
                resetToyPlan({ takesFundedReset: false }),
            ),
        ).toBe(0);
        expect(fundedResetsBeforeFirstPayout(rapidEodPlan())).toBe(0);
    });

    it('drives the payout regime cap 0 rejection only when a reset applies before the first payout', () => {
        const withoutOptIn = resetToyPlan({ takesFundedReset: false });

        expect(() =>
            computeFundedStateValue(
                dpConfig(resetToyPlan(), { payoutRegimeCap: 0 }),
            ),
        ).toThrow(/payoutRegimeCap 0 is not allowed/);
        expect(
            computeFundedStateValue(
                dpConfig(withoutOptIn, { payoutRegimeCap: 0 }),
            ).unconvergedLevelCount,
        ).toBe(0);
    });
});

describe('the funded DP day policy picks the reset layer from the reset count (N-34)', () => {
    it('trades in the layers that still have a reset and idles in the last one, where a trade is worth -5.00 against 0.00 for idling', () => {
        const plan = layeredToyPlan();
        const result = computeFundedStateValue(
            dpConfig(plan, { winrate: LAYERED_WINRATE }),
        );
        const riskAfterResets = (fundedResetsUsed: number) =>
            result.dayPolicy.computeRisk?.(fundedStartState(plan), 0, {
                cycleBestDayProfit: 0,
                dayGateProgress: 0,
                fundedResetsUsed,
                lastPayoutBalance: plan.accountSize,
                payoutsIssued: 0,
            });

        expect(result.initialValue).toBeCloseTo(17.5, 9);
        expect([0, 1, 2].map(riskAfterResets)).toStrictEqual([100, 100, 0]);
        expect(result.dayPolicy.computeRisk?.(fundedStartState(plan), 0)).toBe(
            100,
        );
    });

    it('rejects a funded cycle snapshot without a reset count at compile time instead of silently using the layer 0 policy', () => {
        expectTypeOf<{
            readonly cycleBestDayProfit: number;
            readonly dayGateProgress: number;
            readonly lastPayoutBalance: number;
            readonly payoutsIssued: number;
        }>().not.toExtend<FundedCycleSnapshot>();
        expectTypeOf<
            FundedCycleSnapshot['fundedResetsUsed']
        >().toEqualTypeOf<number>();
    });

    it('reads a call without a funded cycle snapshot as 0 resets used, on a plan with and without reset layers', () => {
        for (const plan of [
            layeredToyPlan(),
            resetToyPlan({ takesFundedReset: false }),
        ]) {
            const result = computeFundedStateValue(
                dpConfig(plan, { winrate: LAYERED_WINRATE }),
            );
            const withoutSnapshot = result.dayPolicy.computeRisk?.(
                fundedStartState(plan),
                0,
            );

            expect(withoutSnapshot).toBeTypeOf('number');
            expect(withoutSnapshot).toBe(
                result.dayPolicy.computeRisk?.(fundedStartState(plan), 0, {
                    cycleBestDayProfit: 0,
                    dayGateProgress: 0,
                    fundedResetsUsed: 0,
                    lastPayoutBalance: plan.accountSize,
                    payoutsIssued: 0,
                }),
            );
        }
    });

    it.each([-1, 0.5, 2.5, NaN, Infinity])(
        'fails loud on a reset count of %s instead of clamping it to a layer',
        (fundedResetsUsed) => {
            const plan = layeredToyPlan();
            const result = computeFundedStateValue(
                dpConfig(plan, { winrate: LAYERED_WINRATE }),
            );

            expect(() =>
                result.dayPolicy.computeRisk?.(fundedStartState(plan), 0, {
                    cycleBestDayProfit: 0,
                    dayGateProgress: 0,
                    fundedResetsUsed,
                    lastPayoutBalance: plan.accountSize,
                    payoutsIssued: 0,
                }),
            ).toThrow(
                `${plan.label}: FundedStateValue computeRisk needs a non-negative integer reset count, got ${fundedResetsUsed}`,
            );
        },
    );

    it.each([-1, 0.5, NaN, Infinity])(
        'fails loud on a reset count of %s after the first payout too, with the same message',
        (fundedResetsUsed) => {
            const plan = layeredToyPlan();
            const result = computeFundedStateValue(
                dpConfig(plan, { winrate: LAYERED_WINRATE }),
            );

            expect(() =>
                result.dayPolicy.computeRisk?.(fundedStartState(plan), 0, {
                    cycleBestDayProfit: 0,
                    dayGateProgress: 0,
                    fundedResetsUsed,
                    lastPayoutBalance: plan.accountSize,
                    payoutsIssued: 1,
                }),
            ).toThrow(
                `${plan.label}: FundedStateValue computeRisk needs a non-negative integer reset count, got ${fundedResetsUsed}`,
            );
        },
    );

    it.each([-1, 0.5, 2.5, NaN, Infinity])(
        'fails loud on a payout count of %s instead of reading it as a payout regime',
        (payoutsIssued) => {
            const plan = layeredToyPlan();
            const result = computeFundedStateValue(
                dpConfig(plan, { winrate: LAYERED_WINRATE }),
            );

            expect(() =>
                result.dayPolicy.computeRisk?.(fundedStartState(plan), 0, {
                    cycleBestDayProfit: 0,
                    dayGateProgress: 0,
                    fundedResetsUsed: 0,
                    lastPayoutBalance: plan.accountSize,
                    payoutsIssued,
                }),
            ).toThrow(
                `${plan.label}: FundedStateValue computeRisk needs a non-negative integer payout count, got ${payoutsIssued}`,
            );
        },
    );

    it.each([0, 1])(
        'reads a valid day gate progress of 0 after %i payout(s) without throwing',
        (payoutsIssued) => {
            expect(riskWithDayGateProgress(0, payoutsIssued).risk()).toBeTypeOf(
                'number',
            );
        },
    );

    it.each([
        { dayGateProgress: -1, payoutsIssued: 0 },
        { dayGateProgress: 0.5, payoutsIssued: 0 },
        { dayGateProgress: 2.5, payoutsIssued: 0 },
        { dayGateProgress: NaN, payoutsIssued: 0 },
        { dayGateProgress: Infinity, payoutsIssued: 0 },
        { dayGateProgress: -1, payoutsIssued: 1 },
        { dayGateProgress: 0.5, payoutsIssued: 1 },
    ])(
        'fails loud on a day gate progress of $dayGateProgress after $payoutsIssued payout(s) instead of flooring or clamping it to a key',
        ({ dayGateProgress, payoutsIssued }) => {
            const { label, risk } = riskWithDayGateProgress(
                dayGateProgress,
                payoutsIssued,
            );

            expect(risk).toThrow(
                `${label}: FundedStateValue computeRisk needs a non-negative integer day gate progress, got ${dayGateProgress}`,
            );
        },
    );

    it('saturates a day gate progress past the gate at the last key, by design, instead of throwing', () => {
        const plan = resetToyPlan({ minDaysAfterPassForPayout: 2 });
        const result = computeFundedStateValue(dpConfig(plan));
        const riskAtProgress = (dayGateProgress: number) =>
            result.dayPolicy.computeRisk?.(fundedStartState(plan), 0, {
                cycleBestDayProfit: 0,
                dayGateProgress,
                fundedResetsUsed: 0,
                lastPayoutBalance: plan.accountSize,
                payoutsIssued: 0,
            });

        expect(riskAtProgress(2)).toBeTypeOf('number');
        expect(riskAtProgress(3)).toBe(riskAtProgress(2));
        expect(riskAtProgress(1_000_000)).toBe(riskAtProgress(2));
    });

    it('agrees with a real simulate() run of its own policy, which idles once both resets are used instead of trading into a -5.00 bust', () => {
        const plan = layeredToyPlan();
        const result = computeFundedStateValue(
            dpConfig(plan, { winrate: LAYERED_WINRATE }),
        );
        const out = simulate({
            fundedDayPolicy: result.dayPolicy,
            fundedHorizonDays: 20,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: 2,
            seed: 11,
            tradesPerDay: 1,
            trials: LAYERED_SIM_TRIALS,
            winrate: LAYERED_WINRATE,
        });
        const empiricalValue =
            out.expectedGrossPayout -
            out.costBreakdown.fundedResetFeesTotal +
            out.fundedBustProbability * result.bustTerminalValue;
        const perTrialVariance =
            0.25 * 100 ** 2 +
            0.1875 * 80 ** 2 +
            0.5625 * (-40) ** 2 -
            17.5 ** 2;
        const standardError = Math.sqrt(perTrialVariance / LAYERED_SIM_TRIALS);

        expect(
            Math.abs(empiricalValue - result.initialValue),
        ).toBeLessThanOrEqual(4 * standardError);
        expect(out.fundedBustProbability).toBe(0);
        expect(out.expectedFundedResets).toBeCloseTo(1.3125, 1);
    }, 60_000);
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
