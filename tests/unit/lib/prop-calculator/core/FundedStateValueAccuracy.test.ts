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

const REPLAY_TRIALS = 10_000;
const REPLAY_RELATIVE_TOLERANCE = 0.01;
const REPLAY_SIGMAS = 4;
const UNBINDING_CUSHION_MULTIPLE = 20;
const TOY_GRID = {
    actionStepMultiple: 1,
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
const BUILDER_COARSE_FIXED_POINT = 2002.113786855271;

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
        | 'actionStepMultiple'
        | 'cushionStepMultiple'
        | 'cycleBestDayBucketCount'
        | 'maxCushionMultiple'
        | 'maxTailCushionMultiple'
    >,
    replayPlan: Plan = plan,
) {
    const result = computeFundedStateValue({ ...TOY_GRID, ...grid, plan });
    const out = simulate({
        fundedDayPolicy: result.dayPolicy,
        fundedHorizonDays: 2000,
        maxEvalDays: 1,
        plan: replayPlan,
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
        replayStandardErrorDollars:
            out.estimates.expectedGrossPayout.standardError,
        replayToleranceDollars:
            REPLAY_RELATIVE_TOLERANCE * result.initialValue +
            REPLAY_SIGMAS * out.estimates.expectedGrossPayout.standardError,
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

describe('computeFundedStateValue with a funded consistency rule agrees with a replay of its own policy (N-65; PT-T1b: the toy is solved at action step 1 drawdown and replayed over 10,000 trials, instead of action step 0.5 and 400,000 trials whose three replays took 70 to 136 s each, so the agreement is stated as 1 percent plus four standard errors of the replay, which is 1 percent of the toy value plus about 6 percent of it at this trial count; the toy replay of the 400,000 trial run at action step 1 earns 462.82 against the DP value of 462.97, a gap of 0.03 percent; one case keeps action step 0.5 so the intermediate half-risk action is still replayed, and a mutation check shows the replay rejects a DP that ignores the rule)', () => {
    it.each([
        {
            actionStepMultiple: 1,
            cushionStepMultiple: 1,
            maxCushionMultiple: UNBINDING_CUSHION_MULTIPLE,
        },
        {
            actionStepMultiple: 0.5,
            cushionStepMultiple: 0.5,
            maxCushionMultiple: 10,
            maxTailCushionMultiple: 10,
        },
    ])(
        'values the 40 percent best-day toy within 1 percent of its value plus four standard errors of simulate() driven by its own policy at action step $actionStepMultiple and cushion step $cushionStepMultiple x drawdown, once the cushion grid is wide enough not to truncate the balance (action step 0.5 keeps the intermediate half-risk action the best-day rule makes the policy back off to)',
        (grid) => {
            const { dpValue, replayToleranceDollars, replayValue } =
                dpAgainstReplay(consistencyToyPlan(0.4), grid);
            expect(Math.abs(replayValue - dpValue)).toBeLessThan(
                replayToleranceDollars,
            );
            expect(dpValue).toBeGreaterThan(400);
        },
    );

    it('rejects a DP that ignores the best-day rule: the policy of the same toy with a 100 percent best-day share, replayed under the 40 percent rule, falls outside the tolerance the agreement tests above accept (mutation check of the replay resolution)', () => {
        const { dpValue, replayToleranceDollars, replayValue } =
            dpAgainstReplay(
                consistencyToyPlan(1),
                {
                    actionStepMultiple: 1,
                    cushionStepMultiple: 1,
                    maxCushionMultiple: UNBINDING_CUSHION_MULTIPLE,
                },
                consistencyToyPlan(0.4),
            );
        expect(Math.abs(replayValue - dpValue)).toBeGreaterThan(
            replayToleranceDollars,
        );
    });

    it('earns at least its DP value in a replay of its own policy on the default 6 drawdown cushion grid (the tail pinned off, WP58c: this test studies that specific grid top on purpose), a result for this toy only since truncation above the grid top can err either way', () => {
        const { dpValue, replayStandardErrorDollars, replayValue } =
            dpAgainstReplay(consistencyToyPlan(0.4), {
                cushionStepMultiple: 0.5,
                maxTailCushionMultiple: 6,
            });
        expect(
            replayValue + REPLAY_SIGMAS * replayStandardErrorDollars,
        ).toBeGreaterThan(dpValue * (1 - REPLAY_RELATIVE_TOLERANCE));
        expect(dpValue).toBeGreaterThan(200);
    });

    it('keeps the 40 percent toy above 200 and no higher than its own replay on a coarse cycleBestDayBucketCount of 3, at the default 6 drawdown cushion grid (the tail pinned off, WP58c: this test studies that specific grid top on purpose)', () => {
        const { dpValue, replayStandardErrorDollars, replayValue } =
            dpAgainstReplay(consistencyToyPlan(0.4), {
                cushionStepMultiple: 0.5,
                cycleBestDayBucketCount: 3,
                maxTailCushionMultiple: 6,
            });
        expect(
            replayValue + REPLAY_SIGMAS * replayStandardErrorDollars,
        ).toBeGreaterThan(dpValue * (1 - REPLAY_RELATIVE_TOLERANCE));
        expect(dpValue).toBeGreaterThan(200);
    });

    it('rounds an off-grid carried best day up to the next bucket of a coarse cycleBestDayBucketCount, so its policy acts on the larger best day and never on a smaller one the real rule would not see, at the default 6 drawdown cushion grid (the tail pinned off, WP58c: this test studies that specific grid top on purpose)', () => {
        const { dayPolicy } = computeFundedStateValue({
            ...TOY_GRID,
            actionStepMultiple: 0.5,
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
    it('values MFF Builder 50K (50 percent best-day rule) at the coarse probe grid, within its stated error bound of the fixed point the solver reaches at tolerance 0.0001. Re-pinned for T32: the end-of-horizon credit is one request under the payout ladder step, not the whole balance above the floor; with only the pre-T32 credit restored the same run reproduces the WP17e pin $14,039.06 and fixed point $14,039.08 exactly, so the credit is the only move. Re-pinned again for N-86 (WP54, continuationKey interpolates the day-close cushion): $11,614.25 moved to $12,040.46 and its tolerance-0.0001 fixed point moved from $11,614.29 to $12,040.48 (reachedStateCount and unconvergedLevelCount unchanged), an upward move consistent with the fix removing a downward floor-rounding bias at Builder’s drawdown lock. Re-pinned again for WP58c (N-86 stage 2): the coarse cushion tail is on by default now, reaching 30 drawdowns above the locked floor instead of 6, and this plan tracks a funded consistency rule whose own cycleBestDayGrid dimension scales with that wider range uncapped (no cycleBestDayBucketCount override here), so reachedStateCount grew far more than the ~1.2x to ~2x seen elsewhere: 226,800 to 4,640,328 (about 20.5x, disclosed as exceeding the "about 2x" guidance; the design accepts this and keeps the tail on). initialValue moved from 12,040.458422262556 to 11,541.08563746211 (a decrease here, consistent with FTMO Growth’s direction elsewhere in this fix) and its tolerance-0.0001 fixed point from 12,040.484358923788 to 11,540.95058132762. Re-pinned again for WP58d: the default best-day grid is now bounded by what one day can win (tradesPerDay times the largest win, plus one cushion step per trade), so reachedStateCount fell from 4,640,328 to 1,406,160 (3.3x fewer, still about 6.2x the pre-tail 226,800: the rest is the cushion tail and the cycle-baseline grid, which follows the tail top) and initialValue moved from 11,541.08563746211 to 11,541.088348689482, a rise of 0.0027 against the DP tolerance of 1 and the error bound of this run. Re-pinned again for WP58e (N-90): a best day past the one-day swing cap now moves to an extra overflow bucket that denies every payout instead of being clamped to the cap, which adds one best-day bucket per level (1,406,160 to 1,476,468 states, about 6.5x the pre-tail 226,800) and moves the value from 11,541.088348689482 to 11,541.085384811904 (-0.003, against the DP tolerance of 1). The cycle-baseline grid keeps following the cushion tail top (here $58,000 above the locked floor, under the $60,000 locked top) on purpose: capping it at the cushion grid fine top cut the state count to 439,236 (1.94x of 226,800, inside the 2x target) but moved the Builder value from 11,541.09 to 21,217.62 at this grid, because a post-payout balance above a clamped baseline is credited as extra cycle profit and the policy farms it, so the 6.2x cost is kept and reported rather than traded for a wrong value. Re-pinned again for the WP58e review: the best-day cap now allows one coarse tail step per trade of day-close rounding where the tail exists (the day close is a tail cell, so it can land a tail step per trade away from the day start), which widens the best-day grid and moves 1,476,468 states to 1,898,316 (about 8.4x the pre-tail 226,800) and the value from 11,541.085384811904 to 11,541.08553036521 (+0.00015, against the DP tolerance of 1). Re-pinned for PT-T1b: solved at cushion and action step 1 drawdown with the tail pinned off at 6 drawdowns, which gives a 12,000 locked top and no coarse baseline rounding (the cushion step equals the coarse step), 14,553 states and 2,002.08 over a tolerance-0.0001 fixed point of 2,002.11, where the cushion and action step 0.25 solve on the default 30 drawdown tail took 1,898,316 states, 235 s and pinned 11,541.09 over a fixed point of 11,540.95', async () => {
        const plan = await registryMffBuilder50k();
        const result = computeFundedStateValue({
            actionStepMultiple: 1,
            cushionStepMultiple: 1,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            maxTailCushionMultiple: 6,
            meanHorizonDays: 60,
            payoutRegimeCap: 2,
            plan: plan.withOverrides({}),
            rrRatio: 2,
            tradesPerDay: 2,
            winrate: 0.5,
        });
        expect(result.unconvergedLevelCount).toBe(0);
        expect(result.reachedStateCount).toBe(14_553);
        expect(result.initialValue).toBeCloseTo(2002.084979310969, 6);
        expect(result.cushionGrid.lockedTopDollars).toBe(12_000);
        expect(result.cycleBaselineRounding).toBeNull();
        expect(
            Math.abs(result.initialValue - BUILDER_COARSE_FIXED_POINT),
        ).toBeLessThanOrEqual(result.valueErrorBound);
    });
});
