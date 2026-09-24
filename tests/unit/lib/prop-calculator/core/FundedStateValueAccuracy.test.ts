import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    ConsistencyRule,
    ConsistencyScope,
    createInitialState,
    DailyLossLimitKind,
    type DayPolicy,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const REPLAY_TRIALS = 400_000;
const REPLAY_RELATIVE_TOLERANCE = 0.01;
const UNBINDING_CUSHION_MULTIPLE = 20;
const TOY_GRID = {
    actionStepMultiple: 0.5,
    convergenceTolerance: 0.01,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    rrRatio: 2,
    tradesPerDay: 2,
    winrate: 0.5,
} as const;
const COARSE_BEST_DAY_STEP = 200;
const TOY_LOCKED_CUSHION_STEPS = 12;
const TOY_CUSHION_STEP = 50;

function consistencyToyPlan(maxBestDayShare: number): Plan {
    const base = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(
                ConsistencyScope.Funded,
                fraction(maxBestDayShare),
            ),
        },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        isInstantFunded: true,
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: 2,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0.01),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function dpAgainstReplay(
    plan: Plan,
    grid: Pick<
        FundedStateValueConfig,
        'cushionStepMultiple' | 'cycleBestDayBucketCount' | 'maxCushionMultiple'
    >,
) {
    const result = computeFundedStateValue({ ...TOY_GRID, ...grid, plan });
    const out = simulate({
        fundedDayPolicy: result.dayPolicy,
        fundedHorizonDays: 2000,
        maxEvalDays: 1,
        plan,
        riskPerTrade: 100,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 2,
        trials: REPLAY_TRIALS,
        winrate: 0.5,
    });
    expect(result.unconvergedLevelCount).toBe(0);
    return {
        dpValue: result.initialValue,
        replayValue: out.expectedGrossPayout,
    };
}

function lockedRiskProfile(
    dayPolicy: DayPolicy,
    cycleBestDayProfit: number,
): number[] {
    return Array.from({ length: TOY_LOCKED_CUSHION_STEPS }, (_, step) => {
        const state = createInitialState(1000, 1000);
        state.balance = 1000 + TOY_CUSHION_STEP * (step + 1);
        state.threshold = 1000;
        state.thresholdLocked = true;
        return (
            dayPolicy.computeRisk?.(state, 0, {
                cycleBestDayProfit,
                dayGateProgress: 0,
                lastPayoutBalance: 1000,
                payoutsIssued: 0,
            }) ?? NaN
        );
    });
}

async function registryMffBuilder50k(): Promise<Plan> {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find((firm) => firm.id === FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder 50K not in the registry');
    return plan;
}

describe('computeFundedStateValue with a funded consistency rule agrees with a replay of its own policy (N-65)', () => {
    it.each([0.5, 0.25])(
        'values the 40 percent best-day toy within 1 percent of simulate() driven by its own policy at cushion step %s x drawdown, once the cushion grid is wide enough not to truncate the balance',
        (cushionStepMultiple) => {
            const { dpValue, replayValue } = dpAgainstReplay(
                consistencyToyPlan(0.4),
                {
                    cushionStepMultiple,
                    maxCushionMultiple: UNBINDING_CUSHION_MULTIPLE,
                },
            );
            expect(Math.abs(replayValue - dpValue)).toBeLessThan(
                REPLAY_RELATIVE_TOLERANCE * dpValue,
            );
            expect(dpValue).toBeGreaterThan(900);
        },
        600_000,
    );

    it('earns at least its DP value in a replay of its own policy on the 40 percent toy at the default 6 drawdown cushion grid, a result for this toy only since truncation above the grid top can err either way', () => {
        const { dpValue, replayValue } = dpAgainstReplay(
            consistencyToyPlan(0.4),
            { cushionStepMultiple: 0.5 },
        );
        expect(replayValue).toBeGreaterThan(
            dpValue * (1 - REPLAY_RELATIVE_TOLERANCE),
        );
        expect(dpValue).toBeGreaterThan(300);
    }, 600_000);

    it('keeps the 40 percent toy above 300 and no higher than its own replay on a coarse cycleBestDayBucketCount of 3', () => {
        const { dpValue, replayValue } = dpAgainstReplay(
            consistencyToyPlan(0.4),
            { cushionStepMultiple: 0.5, cycleBestDayBucketCount: 3 },
        );
        expect(replayValue).toBeGreaterThan(
            dpValue * (1 - REPLAY_RELATIVE_TOLERANCE),
        );
        expect(dpValue).toBeGreaterThan(300);
    }, 600_000);

    it('rounds an off-grid carried best day up to the next bucket of a coarse cycleBestDayBucketCount, so its policy acts on the larger best day and never on a smaller one the real rule would not see', () => {
        const { dayPolicy } = computeFundedStateValue({
            ...TOY_GRID,
            cushionStepMultiple: 0.5,
            cycleBestDayBucketCount: 3,
            plan: consistencyToyPlan(0.4),
        });
        const atZero = lockedRiskProfile(dayPolicy, 0);
        const atFirstBucket = lockedRiskProfile(
            dayPolicy,
            COARSE_BEST_DAY_STEP,
        );
        const atSecondBucket = lockedRiskProfile(
            dayPolicy,
            2 * COARSE_BEST_DAY_STEP,
        );
        expect(atFirstBucket).not.toEqual(atZero);
        expect(atSecondBucket).not.toEqual(atFirstBucket);
        for (const offGrid of [
            1,
            COARSE_BEST_DAY_STEP / 2,
            COARSE_BEST_DAY_STEP - 1,
        ]) {
            expect(lockedRiskProfile(dayPolicy, offGrid)).toEqual(
                atFirstBucket,
            );
        }
        for (const offGrid of [
            COARSE_BEST_DAY_STEP + 1,
            2 * COARSE_BEST_DAY_STEP - 1,
        ]) {
            expect(lockedRiskProfile(dayPolicy, offGrid)).toEqual(
                atSecondBucket,
            );
        }
    });
});

describe('computeFundedStateValue pins a real plan with a funded consistency rule (N-65 review)', () => {
    it('values MFF Builder 50K (50 percent best-day rule) at the coarse probe grid at $14,006.93 over 226,800 states, down from the $15,832.08 over 68,040 states that the floor-rounded best day produced by waiting for payouts the real rule denies', async () => {
        const plan = await registryMffBuilder50k();
        const result = computeFundedStateValue({
            actionStepMultiple: 0.25,
            cushionStepMultiple: 0.25,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            meanHorizonDays: 60,
            payoutRegimeCap: 2,
            plan,
            rrRatio: 2,
            tradesPerDay: 2,
            winrate: 0.5,
        });
        expect(result.unconvergedLevelCount).toBe(0);
        expect(result.reachedStateCount).toBe(226_800);
        expect(result.initialValue).toBeCloseTo(14_006.926986926397, 6);
    }, 900_000);
});
