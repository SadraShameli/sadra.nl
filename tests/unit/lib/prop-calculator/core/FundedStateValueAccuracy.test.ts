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
const BUILDER_COARSE_FIXED_POINT = 11_540.95058132762;

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
        | 'cushionStepMultiple'
        | 'cycleBestDayBucketCount'
        | 'maxCushionMultiple'
        | 'maxTailCushionMultiple'
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
                fundedResetsUsed: 0,
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

    it('earns at least its DP value in a replay of its own policy on the default 6 drawdown cushion grid (the tail pinned off, WP58c: this test studies that specific grid top on purpose), a result for this toy only since truncation above the grid top can err either way', () => {
        const { dpValue, replayValue } = dpAgainstReplay(
            consistencyToyPlan(0.4),
            { cushionStepMultiple: 0.5, maxTailCushionMultiple: 6 },
        );
        expect(replayValue).toBeGreaterThan(
            dpValue * (1 - REPLAY_RELATIVE_TOLERANCE),
        );
        expect(dpValue).toBeGreaterThan(300);
    }, 600_000);

    it('keeps the 40 percent toy above 300 and no higher than its own replay on a coarse cycleBestDayBucketCount of 3, at the default 6 drawdown cushion grid (the tail pinned off, WP58c: this test studies that specific grid top on purpose)', () => {
        const { dpValue, replayValue } = dpAgainstReplay(
            consistencyToyPlan(0.4),
            {
                cushionStepMultiple: 0.5,
                cycleBestDayBucketCount: 3,
                maxTailCushionMultiple: 6,
            },
        );
        expect(replayValue).toBeGreaterThan(
            dpValue * (1 - REPLAY_RELATIVE_TOLERANCE),
        );
        expect(dpValue).toBeGreaterThan(300);
    }, 600_000);

    it('rounds an off-grid carried best day up to the next bucket of a coarse cycleBestDayBucketCount, so its policy acts on the larger best day and never on a smaller one the real rule would not see, at the default 6 drawdown cushion grid (the tail pinned off, WP58c: this test studies that specific grid top on purpose)', () => {
        const { dayPolicy } = computeFundedStateValue({
            ...TOY_GRID,
            cushionStepMultiple: 0.5,
            cycleBestDayBucketCount: 3,
            maxTailCushionMultiple: 6,
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
    it('values MFF Builder 50K (50 percent best-day rule) at the coarse probe grid, within its stated error bound of the fixed point the solver reaches at tolerance 0.0001. Re-pinned for T32: the end-of-horizon credit is one request under the payout ladder step, not the whole balance above the floor; with only the pre-T32 credit restored the same run reproduces the WP17e pin $14,039.06 and fixed point $14,039.08 exactly, so the credit is the only move. Re-pinned again for N-86 (WP54, continuationKey interpolates the day-close cushion): $11,614.25 moved to $12,040.46 and its tolerance-0.0001 fixed point moved from $11,614.29 to $12,040.48 (reachedStateCount and unconvergedLevelCount unchanged), an upward move consistent with the fix removing a downward floor-rounding bias at Builder’s drawdown lock. Re-pinned again for WP58c (N-86 stage 2): the coarse cushion tail is on by default now, reaching 30 drawdowns above the locked floor instead of 6, and this plan tracks a funded consistency rule whose own cycleBestDayGrid dimension scales with that wider range uncapped (no cycleBestDayBucketCount override here), so reachedStateCount grew far more than the ~1.2x to ~2x seen elsewhere: 226,800 to 4,640,328 (about 20.5x, disclosed as exceeding the "about 2x" guidance; the design accepts this and keeps the tail on). initialValue moved from 12,040.458422262556 to 11,541.08563746211 (a decrease here, consistent with FTMO Growth’s direction elsewhere in this fix) and its tolerance-0.0001 fixed point from 12,040.484358923788 to 11,540.95058132762. Re-pinned again for WP58d: the default best-day grid is now bounded by what one day can win (tradesPerDay times the largest win, plus one cushion step per trade), so reachedStateCount fell from 4,640,328 to 1,406,160 (3.3x fewer, still about 6.2x the pre-tail 226,800: the rest is the cushion tail and the cycle-baseline grid, which follows the tail top) and initialValue moved from 11,541.08563746211 to 11,541.088348689482, a rise of 0.0027 against the DP tolerance of 1 and the error bound of this run. Re-pinned again for WP58e (N-90): a best day past the one-day swing cap now moves to an extra overflow bucket that denies every payout instead of being clamped to the cap, which adds one best-day bucket per level (1,406,160 to 1,476,468 states, about 6.5x the pre-tail 226,800) and moves the value from 11,541.088348689482 to 11,541.085384811904 (-0.003, against the DP tolerance of 1). The cycle-baseline grid keeps following the cushion tail top (here $58,000 above the locked floor, under the $60,000 locked top) on purpose: capping it at the cushion grid fine top cut the state count to 439,236 (1.94x of 226,800, inside the 2x target) but moved the Builder value from 11,541.09 to 21,217.62 at this grid, because a post-payout balance above a clamped baseline is credited as extra cycle profit and the policy farms it, so the 6.2x cost is kept and reported rather than traded for a wrong value', async () => {
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
        expect(result.reachedStateCount).toBe(1_476_468);
        expect(result.initialValue).toBeCloseTo(11_541.085384811904, 6);
        expect(result.cushionGrid.lockedTopDollars).toBe(60_000);
        expect(result.cycleBaselineRounding?.topDollars).toBe(58_000);
        expect(
            Math.abs(result.initialValue - BUILDER_COARSE_FIXED_POINT),
        ).toBeLessThanOrEqual(result.valueErrorBound);
    }, 900_000);
});
