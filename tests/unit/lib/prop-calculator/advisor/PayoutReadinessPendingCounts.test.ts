import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    findFirm,
    FirmId,
    type FundedCycleTracker,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    LIVE_TRIGGER_NOT_CHECKED,
    LiveTriggerScope,
    NO_PENDING_PAYOUT_COUNTS,
    PayoutBlockReasonKind,
    payoutReadiness,
    PayoutReadinessKind,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

function fundedState(): AccountState {
    return {
        balance: 55_000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 50_100,
        thresholdLocked: true,
        todayPnL: 0,
        tradingDays: 20,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function trackerWith(
    state: AccountState,
    payoutsIssued: number,
): FundedCycleTracker {
    const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
    tracker.restoreCalendarDayGateProgress(20);
    tracker.payoutsIssued = payoutsIssued;
    return tracker;
}

describe('payoutReadiness counts the pending payouts it is given, not 0 or 1 (PT-36l, F-145)', () => {
    const plan = registryPlan(MFF_PRO_ID);
    const perAccountFour = { ...LIVE_TRIGGER_NOT_CHECKED, perAccountCap: 4 };
    const firmTenAfterFivePaid = {
        ...LIVE_TRIGGER_NOT_CHECKED,
        firmTotalCap: 10,
        paidPayoutsSinceLastLiveAccount: 5,
    };

    it('counts two own requests toward the per-account cap, so the next request is the fourth', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 1), {
            liveTrigger: perAccountFour,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 2,
            pendingPayouts: 200,
            statePendingPayoutsNetted: false,
        });
        expect(readiness).toMatchObject({
            kind: PayoutReadinessKind.Blocked,
            reason: {
                kind: PayoutBlockReasonKind.WouldTriggerLive,
                trigger: {
                    payoutsTaken: 3,
                    scope: LiveTriggerScope.Account,
                    triggerAtPayoutCount: 4,
                },
            },
        });
    });

    it('stays eligible with one own request under the same per-account cap', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 1), {
            liveTrigger: perAccountFour,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 1,
            pendingPayouts: 100,
            statePendingPayoutsNetted: false,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });

    it('counts a request made before the snapshot, which nets no dollars, toward the per-account cap', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 2), {
            liveTrigger: perAccountFour,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 1,
            pendingPayouts: 0,
            statePendingPayoutsNetted: false,
        });
        expect(readiness).toMatchObject({
            kind: PayoutReadinessKind.Blocked,
            reason: {
                trigger: { payoutsTaken: 3, scope: LiveTriggerScope.Account },
            },
        });
    });

    it('nets pending dollars off the balance without counting them as a request when no count is given', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 2), {
            liveTrigger: perAccountFour,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 0,
            pendingPayoutCount: 0,
            pendingPayouts: 100,
            statePendingPayoutsNetted: false,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });

    it('adds the other accounts pending requests to the firm-wide count only', () => {
        const state = fundedState();
        const underCap = payoutReadiness(plan, state, trackerWith(state, 0), {
            liveTrigger: firmTenAfterFivePaid,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 2,
            pendingPayoutCount: 1,
            pendingPayouts: 100,
            statePendingPayoutsNetted: false,
        });
        expect(underCap.kind).toBe(PayoutReadinessKind.Eligible);
        const atCap = payoutReadiness(plan, state, trackerWith(state, 0), {
            liveTrigger: firmTenAfterFivePaid,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 3,
            pendingPayoutCount: 1,
            pendingPayouts: 100,
            statePendingPayoutsNetted: false,
        });
        expect(atCap).toMatchObject({
            kind: PayoutReadinessKind.Blocked,
            reason: {
                kind: PayoutBlockReasonKind.WouldTriggerLive,
                trigger: { payoutsTaken: 9, scope: LiveTriggerScope.Firm },
            },
        });
    });

    it('does not count the other accounts requests toward a per-account cap', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 1), {
            liveTrigger: perAccountFour,
            minRetainedCushion: 0,
            otherAccountsPendingPayoutCount: 9,
            pendingPayoutCount: 0,
            pendingPayouts: 0,
            statePendingPayoutsNetted: false,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });

    it('counts nothing when the state is already netted and no counts are given, as the planner does', () => {
        const state = fundedState();
        const readiness = payoutReadiness(plan, state, trackerWith(state, 3), {
            ...NO_PENDING_PAYOUT_COUNTS,
            liveTrigger: { ...LIVE_TRIGGER_NOT_CHECKED, perAccountCap: 5 },
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });
});
