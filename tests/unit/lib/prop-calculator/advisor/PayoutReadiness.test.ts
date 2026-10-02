import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    type FundedCycleTracker,
    MffuVariant,
    newFundedCycleTracker,
    PayoutGate,
    type Plan,
    type PlanId,
    serializePlanId,
    withOneTimeEarlyWithdrawalTaken,
} from '~/lib/prop-calculator';
import {
    LIVE_TRIGGER_NOT_CHECKED,
    PayoutBlockReasonKind,
    payoutPath,
    type PayoutPathStep,
    PayoutPathStepUnit,
    payoutReadiness,
    PayoutReadinessKind,
    PayoutWaitBasis,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

function fundedState(balance: number): AccountState {
    return {
        balance,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 50_100,
        thresholdLocked: true,
        todayPnL: 0,
        tradingDays: 0,
    };
}

function metCalendarTracker(state: AccountState): FundedCycleTracker {
    const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
    tracker.restoreCalendarDayGateProgress(11);
    return tracker;
}

function pathStep(
    path: ReturnType<typeof payoutPath>,
    gate: PayoutGate,
): PayoutPathStep | undefined {
    return path.find((step) => step.gate === gate);
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function trackerSnapshotOf(tracker: FundedCycleTracker) {
    return {
        cumulativePayout: tracker.cumulativePayout,
        cycleBestDayProfit: tracker.cycleBestDayProfit,
        fundedResetsUsed: tracker.fundedResetsUsed,
        lastPayoutBalance: tracker.lastPayoutBalance,
        payoutsIssued: tracker.payoutsIssued,
        qualifyingDaysAtLastPayout: tracker.qualifyingDaysAtLastPayout,
    };
}

describe('payoutReadiness: eligible at the effective request under FullRequestOnly', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('is eligible for the $500 default request when every gate passes', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        const readiness = payoutReadiness(plan, state, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });

    it('nets pending payouts off the balance before evaluating, blocking with PayoutPending (F-138)', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        const withoutPending = payoutReadiness(plan, state, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(withoutPending.kind).toBe(PayoutReadinessKind.Eligible);

        const withPending = payoutReadiness(plan, state, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
            pendingPayouts: 2900,
            statePendingPayoutsNetted: false,
        });
        expect(withPending.kind).toBe(PayoutReadinessKind.Blocked);
        if (withPending.kind !== PayoutReadinessKind.Blocked) return;
        expect(withPending.reason).toEqual({
            kind: PayoutBlockReasonKind.PayoutPending,
        });
        expect(state.balance).toBe(53_000);
    });

    it('keeps the real gate reason when blocked for another reason regardless of a pending payout', () => {
        const state = fundedState(50_700);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        tracker.restoreCalendarDayGateProgress(1);
        const readiness = payoutReadiness(plan, state, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
            pendingPayouts: 100,
            statePendingPayoutsNetted: false,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Blocked);
        if (readiness.kind !== PayoutReadinessKind.Blocked) return;
        expect(readiness.reason).toEqual({
            gate: PayoutGate.DayGateNotMet,
            kind: PayoutBlockReasonKind.Gate,
        });
    });

    it('deducts a pending payout exactly once: the default trusts an already-netted state (F-138 contract)', () => {
        const alreadyNettedState = fundedState(53_000);
        const tracker = metCalendarTracker(alreadyNettedState);

        const trusted = payoutReadiness(plan, alreadyNettedState, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(trusted.kind).toBe(PayoutReadinessKind.Eligible);

        const doubleNetted = payoutReadiness(
            plan,
            alreadyNettedState,
            tracker,
            {
                liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
                minRetainedCushion: 0,
                pendingPayouts: 2000,
                statePendingPayoutsNetted: false,
            },
        );
        expect(doubleNetted.kind).toBe(PayoutReadinessKind.Blocked);
        if (doubleNetted.kind !== PayoutReadinessKind.Blocked) return;
        expect(doubleNetted.reason).toEqual({
            kind: PayoutBlockReasonKind.PayoutPending,
        });
    });

    it('reports profit still needed for BelowMinPayoutProfit on a closed-form pool', () => {
        const state = fundedState(51_500);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        tracker.restoreCalendarDayGateProgress(11);
        const readiness = payoutReadiness(plan, state, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Blocked);
        if (readiness.kind !== PayoutReadinessKind.Blocked) return;
        expect(readiness.reason).toEqual({
            gate: PayoutGate.BelowMinPayoutProfit,
            kind: PayoutBlockReasonKind.Gate,
        });
        expect(readiness.wait).toEqual({
            basis: PayoutWaitBasis.Profit,
            profitStillNeeded: 600,
        });
    });

    it('reports calendar days still needed for DayGateNotMet', () => {
        const state = fundedState(53_000);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        tracker.restoreCalendarDayGateProgress(1);
        const readiness = payoutReadiness(plan, state, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Blocked);
        if (readiness.kind !== PayoutReadinessKind.Blocked) return;
        expect(readiness.reason).toEqual({
            gate: PayoutGate.DayGateNotMet,
            kind: PayoutBlockReasonKind.Gate,
        });
        expect(readiness.wait?.basis).toBe(PayoutWaitBasis.CalendarDays);
    });

    it('agrees with the real day gate at the exact boundary, not the +1 display value (CRITICAL)', () => {
        const state = fundedState(53_000);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        tracker.restoreCalendarDayGateProgress(10);
        const readiness = payoutReadiness(plan, state, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Blocked);
        if (readiness.kind !== PayoutReadinessKind.Blocked) return;
        expect(readiness.reason).toEqual({
            gate: PayoutGate.DayGateNotMet,
            kind: PayoutBlockReasonKind.Gate,
        });
        expect(readiness.wait?.basis).toBe(PayoutWaitBasis.CalendarDays);
        if (readiness.wait?.basis !== PayoutWaitBasis.CalendarDays) return;
        expect(readiness.wait.daysStillNeeded).toBeGreaterThan(0);

        const path = payoutPath(state, plan, tracker, 0);
        const dayGate = path.find(
            (step) => step.gate === PayoutGate.DayGateNotMet,
        );
        expect(dayGate?.satisfied).toBe(false);
    });

    it('is non-mutating', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        const before = { ...state };
        const trackerBefore = trackerSnapshotOf(tracker);
        payoutReadiness(plan, state, tracker, {
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(state).toEqual(before);
        expect(trackerSnapshotOf(tracker)).toEqual(trackerBefore);
    });
});

describe('payoutPath: every gate checked independently, not short-circuited', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('marks every step satisfied on a clean eligible account', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        const path = payoutPath(state, plan, tracker, 0);
        expect(path.length).toBeGreaterThan(0);
        for (const step of path) {
            expect(step.satisfied).toBe(true);
        }
    });

    it('flags the day gate and the profit gate independently when both are unmet', () => {
        const state = fundedState(50_700);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        tracker.restoreCalendarDayGateProgress(1);
        const path = payoutPath(state, plan, tracker, 0);
        const dayGate = path.find(
            (step) => step.gate === PayoutGate.DayGateNotMet,
        );
        const profitGate = path.find(
            (step) => step.gate === PayoutGate.BelowMinPayoutProfit,
        );
        expect(dayGate?.satisfied).toBe(false);
        expect(dayGate?.unit).toBe(PayoutPathStepUnit.Days);
        expect(profitGate?.satisfied).toBe(false);
        expect(profitGate?.remaining).toBe(1400);
    });

    it('honors the caller-supplied minRetainedCushion instead of always using zero (HIGH)', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        const permissive = payoutPath(state, plan, tracker, 0);
        const strict = payoutPath(state, plan, tracker, 10_000);
        const permissiveWithdrawable = permissive.find(
            (step) => step.gate === PayoutGate.NothingWithdrawable,
        );
        const strictWithdrawable = strict.find(
            (step) => step.gate === PayoutGate.NothingWithdrawable,
        );
        expect(permissiveWithdrawable?.satisfied).toBe(true);
        expect(strictWithdrawable?.satisfied).toBe(false);
    });
});

describe('payoutPath: the remaining six gates through the exported ladder helpers (PT-12j, F-110)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('reports the lifetime dollar cap remaining and blocks once it is reached', () => {
        const state = fundedState(153_000);
        const tracker = metCalendarTracker(state);
        tracker.cumulativePayout = 99_900;
        const underCap = pathStep(
            payoutPath(state, plan, tracker, 0),
            PayoutGate.LifetimeDollarCapReached,
        );
        expect(underCap?.satisfied).toBe(true);
        expect(underCap?.remaining).toBe(100);

        tracker.cumulativePayout = 100_000;
        const atCap = pathStep(
            payoutPath(state, plan, tracker, 0),
            PayoutGate.LifetimeDollarCapReached,
        );
        expect(atCap?.satisfied).toBe(false);
        expect(atCap?.remaining).toBe(0);
    });

    it('flags LadderExhausted once payouts issued reach the ladder length', () => {
        const state = fundedState(53_000);
        const ladderedPlan = plan.withOverrides({
            payoutLadder: {
                minRequestAmount: dollars(500),
                steps: [2000, 2000],
            },
        });
        const tracker = metCalendarTracker(state);
        tracker.payoutsIssued = 1;
        const withRoom = pathStep(
            payoutPath(state, ladderedPlan, tracker, 0),
            PayoutGate.LadderExhausted,
        );
        expect(withRoom?.satisfied).toBe(true);

        tracker.payoutsIssued = 2;
        const exhausted = pathStep(
            payoutPath(state, ladderedPlan, tracker, 0),
            PayoutGate.LadderExhausted,
        );
        expect(exhausted?.satisfied).toBe(false);
    });

    it('flags LadderStepUnaffordable when a deny-if-unaffordable step exceeds the withdrawable room', () => {
        const state = fundedState(53_000);
        const unaffordablePlan = plan.withOverrides({
            payoutLadder: {
                deniesIfUnaffordable: true,
                minRequestAmount: dollars(500),
                steps: [50_000],
            },
        });
        const tracker = metCalendarTracker(state);
        const step = pathStep(
            payoutPath(state, unaffordablePlan, tracker, 0),
            PayoutGate.LadderStepUnaffordable,
        );
        expect(step?.satisfied).toBe(false);
    });

    it('flags BelowFullRequest when the ceiling cannot cover the effective request, using the ladder helpers', () => {
        const eligibleState = fundedState(53_000);
        const eligibleTracker = newFundedCycleTracker({
            ...eligibleState,
            balance: 50_000,
        });
        const satisfied = pathStep(
            payoutPath(eligibleState, plan, eligibleTracker, 0),
            PayoutGate.BelowFullRequest,
        );
        expect(satisfied?.satisfied).toBe(true);

        const shortState = fundedState(50_700);
        const shortTracker = newFundedCycleTracker({
            ...shortState,
            balance: 50_000,
        });
        const short = pathStep(
            payoutPath(shortState, plan, shortTracker, 0),
            PayoutGate.BelowFullRequest,
        );
        expect(short?.satisfied).toBe(false);
        expect(short?.remaining).toBe(400);
    });

    it('is not applicable when the plan offers no one-time early withdrawal, or it is not opted in', () => {
        const state = fundedState(50_700);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        const path = payoutPath(state, plan, tracker, 0);
        expect(
            pathStep(path, PayoutGate.EarlyWithdrawalBelowFloor)?.satisfied,
        ).toBe(true);
        expect(
            pathStep(path, PayoutGate.EarlyWithdrawalBelowMinimum)?.satisfied,
        ).toBe(true);
    });

    it('flags EarlyWithdrawalBelowMinimum when the allowance is below the plan minimum but the floor still holds', () => {
        const earlyWithdrawalPlan = withOneTimeEarlyWithdrawalTaken(plan, true);
        const state = fundedState(50_700);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        const path = payoutPath(state, earlyWithdrawalPlan, tracker, 0);
        const floor = pathStep(path, PayoutGate.EarlyWithdrawalBelowFloor);
        const minimum = pathStep(path, PayoutGate.EarlyWithdrawalBelowMinimum);
        expect(floor?.satisfied).toBe(true);
        expect(minimum?.satisfied).toBe(false);
        expect(minimum?.remaining).toBe(580);
    });

    it('flags EarlyWithdrawalBelowFloor when the allowance would cross the post-payout floor', () => {
        const earlyWithdrawalPlan = withOneTimeEarlyWithdrawalTaken(plan, true);
        const state = fundedState(50_200);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        const path = payoutPath(state, earlyWithdrawalPlan, tracker, 0);
        const floor = pathStep(path, PayoutGate.EarlyWithdrawalBelowFloor);
        expect(floor?.satisfied).toBe(false);
    });

    it('caps the early-withdrawal allowance by the requested payout size, matching evaluateEarlyWithdrawal debited amount', () => {
        const earlyWithdrawalPlan = withOneTimeEarlyWithdrawalTaken(plan, true);
        const state = fundedState(50_210);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });

        const withFullAllowance = payoutPath(
            state,
            earlyWithdrawalPlan,
            tracker,
            0,
        );
        const floorWithFullAllowance = pathStep(
            withFullAllowance,
            PayoutGate.EarlyWithdrawalBelowFloor,
        );
        expect(floorWithFullAllowance?.satisfied).toBe(false);

        const withSmallRequest = payoutPath(
            state,
            earlyWithdrawalPlan,
            tracker,
            0,
            50,
        );
        const floorWithSmallRequest = pathStep(
            withSmallRequest,
            PayoutGate.EarlyWithdrawalBelowFloor,
        );
        const minimumWithSmallRequest = pathStep(
            withSmallRequest,
            PayoutGate.EarlyWithdrawalBelowMinimum,
        );
        expect(floorWithSmallRequest?.satisfied).toBe(true);
        expect(minimumWithSmallRequest?.satisfied).toBe(false);
        expect(minimumWithSmallRequest?.remaining).toBe(950);
    });
});
