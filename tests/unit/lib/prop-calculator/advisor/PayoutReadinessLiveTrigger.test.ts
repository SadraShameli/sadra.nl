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

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

describe('payoutReadiness: live-trigger count limit (PT-36b)', () => {
    const plan = registryPlan(MFF_PRO_ID);

    it('stays eligible when no live-trigger limit is supplied (unverified firm, unchanged)', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        const readiness = payoutReadiness(plan, state, tracker, {
            ...NO_PENDING_PAYOUT_COUNTS,
            liveTrigger: LIVE_TRIGGER_NOT_CHECKED,
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });

    it('blocks with WouldTriggerLive when the next payout reaches the verified per-account cap', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        tracker.payoutsIssued = 2;
        const readiness = payoutReadiness(plan, state, tracker, {
            ...NO_PENDING_PAYOUT_COUNTS,
            liveTrigger: {
                firmTotalCap: null,
                firmTotalSource: null,
                paidPayoutsSinceLastLiveAccount: null,
                perAccountCap: 3,
                perAccountSource: null,
            },
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Blocked);
        if (readiness.kind !== PayoutReadinessKind.Blocked) return;
        expect(readiness.reason).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                triggerAtPayoutCount: 3,
            },
        });
        expect(readiness.wait).toBeNull();
    });

    it('does not block while under the verified per-account cap', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        tracker.payoutsIssued = 1;
        const readiness = payoutReadiness(plan, state, tracker, {
            ...NO_PENDING_PAYOUT_COUNTS,
            liveTrigger: {
                firmTotalCap: null,
                firmTotalSource: null,
                paidPayoutsSinceLastLiveAccount: null,
                perAccountCap: 3,
                perAccountSource: null,
            },
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });

    it('blocks with WouldTriggerLive when the next payout reaches the verified firm-total cap', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        const readiness = payoutReadiness(plan, state, tracker, {
            ...NO_PENDING_PAYOUT_COUNTS,
            liveTrigger: {
                firmTotalCap: 10,
                firmTotalSource: null,
                paidPayoutsSinceLastLiveAccount: 9,
                perAccountCap: null,
                perAccountSource: null,
            },
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Blocked);
        if (readiness.kind !== PayoutReadinessKind.Blocked) return;
        expect(readiness.reason).toEqual({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 9,
                scope: LiveTriggerScope.Firm,
                triggerAtPayoutCount: 10,
            },
        });
    });

    it('does not block while under the verified firm-total cap', () => {
        const state = fundedState(53_000);
        const tracker = metCalendarTracker(state);
        const readiness = payoutReadiness(plan, state, tracker, {
            ...NO_PENDING_PAYOUT_COUNTS,
            liveTrigger: {
                firmTotalCap: 10,
                firmTotalSource: null,
                paidPayoutsSinceLastLiveAccount: 8,
                perAccountCap: null,
                perAccountSource: null,
            },
            minRetainedCushion: 0,
        });
        expect(readiness.kind).toBe(PayoutReadinessKind.Eligible);
    });
});
