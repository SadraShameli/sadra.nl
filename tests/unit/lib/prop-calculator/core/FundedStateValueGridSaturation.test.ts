import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const TOY_DRAWDOWN = 100;
const TOY_LOCKED_THRESHOLD = 1000;

const TOY_CONFIG = {
    actionStepMultiple: 0.25,
    cushionStepMultiple: 0.2,
    cycleBestDayBucketCount: 1,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxCushionMultiple: 2,
    maxTailCushionMultiple: 2,
    payoutRegimeCap: 6,
    rrRatio: 2,
    tradesPerDay: 1,
    winrate: 0.5,
} as const;

const TOY_CONFIG_DEFAULT_TAIL = {
    actionStepMultiple: 0.25,
    cushionStepMultiple: 0.2,
    cycleBestDayBucketCount: 1,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxCushionMultiple: 2,
    payoutRegimeCap: 6,
    rrRatio: 2,
    tradesPerDay: 1,
    winrate: 0.5,
} as const;

function saturationToyPlan(): Plan {
    const rapidEod = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!rapidEod) throw new Error('MFF Rapid EOD 50K plan not found');
    return rapidEod.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(TOY_DRAWDOWN) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => TOY_LOCKED_THRESHOLD,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minRetainedCushionOverride: dollars(0),
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

describe('computeFundedStateValue exposes whether a state sits at or above its grid top (WP58, N-86)', () => {
    it('reports false for an unlocked state comfortably inside the unlocked cushion grid top', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({ ...TOY_CONFIG, plan });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        expect(state.thresholdLocked).toBe(false);
        state.balance = state.threshold + TOY_DRAWDOWN * 0.1;
        expect(result.isGridSaturated(state)).toBe(false);
    });

    it('reports true for an unlocked state at or above the unlocked cushion grid top (one drawdown above threshold)', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({ ...TOY_CONFIG, plan });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.threshold + TOY_DRAWDOWN;
        expect(result.isGridSaturated(state)).toBe(true);
    });

    it('reports false for a locked state comfortably inside the (wider) locked cushion grid top', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({ ...TOY_CONFIG, plan });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.threshold = TOY_LOCKED_THRESHOLD;
        state.thresholdLocked = true;
        state.balance = TOY_LOCKED_THRESHOLD + TOY_DRAWDOWN;
        expect(result.isGridSaturated(state)).toBe(false);
    });

    it('reports true for a locked state at or above the locked cushion grid top (maxCushionMultiple drawdowns above the locked floor, tail pinned off at maxTailCushionMultiple: 2, WP58c re-pin: the coarse tail is on by default and moves this top out to maxTailCushionMultiple otherwise)', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({ ...TOY_CONFIG, plan });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.threshold = TOY_LOCKED_THRESHOLD;
        state.thresholdLocked = true;
        state.balance =
            TOY_LOCKED_THRESHOLD + TOY_CONFIG.maxCushionMultiple * TOY_DRAWDOWN;
        expect(result.isGridSaturated(state)).toBe(true);
        state.balance =
            TOY_LOCKED_THRESHOLD +
            TOY_CONFIG.maxCushionMultiple * TOY_DRAWDOWN * 5;
        expect(result.isGridSaturated(state)).toBe(true);
    });

    it('reports false when the post-payout balance stays well inside the cycle-baseline grid top', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({ ...TOY_CONFIG, plan });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.threshold = TOY_LOCKED_THRESHOLD;
        state.thresholdLocked = true;
        state.balance = TOY_LOCKED_THRESHOLD + TOY_DRAWDOWN * 0.1;
        expect(
            result.isGridSaturated(state, {
                cycleBestDayProfit: 0,
                dayGateProgress: 0,
                fundedResetsUsed: 0,
                lastPayoutBalance: TOY_LOCKED_THRESHOLD,
                payoutsIssued: 1,
            }),
        ).toBe(false);
    });

    it('reports true when the post-payout balance sits at or above the cycle-baseline grid top, even though the cushion is small (N-86 root cause)', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({ ...TOY_CONFIG, plan });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.threshold = TOY_LOCKED_THRESHOLD;
        state.thresholdLocked = true;
        state.balance = TOY_LOCKED_THRESHOLD + TOY_DRAWDOWN * 0.1;
        expect(
            result.isGridSaturated(state, {
                cycleBestDayProfit: 0,
                dayGateProgress: 0,
                fundedResetsUsed: 0,
                lastPayoutBalance: TOY_LOCKED_THRESHOLD + TOY_DRAWDOWN * 1000,
                payoutsIssued: 1,
            }),
        ).toBe(true);
    });
});

describe('computeFundedStateValue turns the coarse cushion tail on by default (WP58c, N-86 stage 2)', () => {
    const TAIL_CONFIG = {
        ...TOY_CONFIG,
        maxTailCushionMultiple: 10,
        tailCushionStepMultiple: 1,
    } as const;

    it('does not saturate a locked state past the old fine-only top once a coarser tail reaches further', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({ ...TAIL_CONFIG, plan });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.threshold = TOY_LOCKED_THRESHOLD;
        state.thresholdLocked = true;
        state.balance =
            TOY_LOCKED_THRESHOLD + TAIL_CONFIG.maxCushionMultiple * TOY_DRAWDOWN;
        expect(result.isGridSaturated(state)).toBe(false);
    });

    it('saturates only at the tail top (maxTailCushionMultiple drawdowns above the locked floor)', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({ ...TAIL_CONFIG, plan });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.threshold = TOY_LOCKED_THRESHOLD;
        state.thresholdLocked = true;
        state.balance =
            TOY_LOCKED_THRESHOLD +
            TAIL_CONFIG.maxTailCushionMultiple * TOY_DRAWDOWN -
            TOY_DRAWDOWN * 0.5;
        expect(result.isGridSaturated(state)).toBe(false);
        state.balance =
            TOY_LOCKED_THRESHOLD +
            TAIL_CONFIG.maxTailCushionMultiple * TOY_DRAWDOWN;
        expect(result.isGridSaturated(state)).toBe(true);
    });

    it('is on by default (no tail override) at DEFAULT_MAX_TAIL_CUSHION_MULTIPLE (30), unlike the old fine-only top', () => {
        const plan = saturationToyPlan();
        const result = computeFundedStateValue({
            ...TOY_CONFIG_DEFAULT_TAIL,
            plan,
        });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.threshold = TOY_LOCKED_THRESHOLD;
        state.thresholdLocked = true;
        state.balance =
            TOY_LOCKED_THRESHOLD +
            TOY_CONFIG_DEFAULT_TAIL.maxCushionMultiple * TOY_DRAWDOWN;
        expect(result.isGridSaturated(state)).toBe(false);
        state.balance = TOY_LOCKED_THRESHOLD + 30 * TOY_DRAWDOWN;
        expect(result.isGridSaturated(state)).toBe(true);
    });

    it('rejects a tailCushionStepMultiple finer than cushionStepMultiple as unsafe, through the one guard in FundedCushionGrid (WP58c review, WP58d): the day-tree window bounds are computed from the fine step and applied as raw grid-index deltas, so a finer tail step would under-cover the reachable range there', () => {
        const plan = saturationToyPlan();
        expect(() =>
            computeFundedStateValue({
                ...TOY_CONFIG,
                maxTailCushionMultiple: 10,
                plan,
                tailCushionStepMultiple: TOY_CONFIG.cushionStepMultiple / 2,
            }),
        ).toThrow(/FundedCushionGrid: tailStep .* must be at least fineStep/);
    });
});

describe('computeFundedStateValue reports the cushion grid it actually solved on (WP58d review)', () => {
    it('reports a fine top wider than maxCushionMultiple when one trading day can swing past it, and a locked top that stays at the requested tail top', () => {
        const result = computeFundedStateValue({
            ...TOY_CONFIG,
            plan: saturationToyPlan(),
        });
        expect(result.cushionGrid).toStrictEqual({
            fineStepDollars: 20,
            fineTopDollars: 300,
            lockedTopDollars: 200,
            tailStepDollars: 100,
            tailTopDollars: 300,
        });
        expect(result.cushionGrid.fineTopDollars).toBeGreaterThan(
            TOY_CONFIG.maxCushionMultiple * TOY_DRAWDOWN,
        );
    });

    it('reports a real coarse tail from the widened fine top up to the requested tail top', () => {
        const result = computeFundedStateValue({
            ...TOY_CONFIG,
            maxTailCushionMultiple: 10,
            plan: saturationToyPlan(),
            tailCushionStepMultiple: 1,
        });
        expect(result.cushionGrid).toStrictEqual({
            fineStepDollars: 20,
            fineTopDollars: 300,
            lockedTopDollars: 1000,
            tailStepDollars: 100,
            tailTopDollars: 1000,
        });
    });

    it('reports the rounded top when the tail step does not divide the range', () => {
        const result = computeFundedStateValue({
            ...TOY_CONFIG,
            maxTailCushionMultiple: 10,
            plan: saturationToyPlan(),
            tailCushionStepMultiple: 3,
        });
        expect(result.cushionGrid.tailStepDollars).toBe(300);
        expect(result.cushionGrid.tailTopDollars).toBe(900);
    });

    it('accepts a coarse cushion step above the default tail step when the tail is off', () => {
        const result = computeFundedStateValue({
            ...TOY_CONFIG,
            cushionStepMultiple: 2,
            maxCushionMultiple: 4,
            maxTailCushionMultiple: 4,
            plan: saturationToyPlan(),
        });
        expect(result.cushionGrid.fineStepDollars).toBe(200);
        expect(result.cushionGrid.tailTopDollars).toBe(
            result.cushionGrid.fineTopDollars,
        );
    });
});
