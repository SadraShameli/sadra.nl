import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    addIsoDays,
    findFirm,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    PayoutEvaluationKind,
    type Plan,
    type PlanId,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    calendarGateProgress,
    CalendarGateProgressKind,
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

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

describe('calendarGateProgress: real calendar days, not the session approximation', () => {
    const plan = registryPlan(MFF_PRO_ID);
    const anchor = '2026-01-01';

    it('reports 14 of 14 calendar days met at the first-payout boundary', () => {
        const asOf = addIsoDays(anchor, 14);
        const result = calendarGateProgress(plan, 0, anchor, asOf);
        expect(result).toEqual({
            calendarDaysElapsed: 14,
            calendarDaysRequired: 14,
            isMet: true,
            kind: CalendarGateProgressKind.Progress,
            restoreProgress: 11,
        });
    });

    it('reports 13 of 14 calendar days as not met, one session short of the boundary', () => {
        const asOf = addIsoDays(anchor, 13);
        const result = calendarGateProgress(plan, 0, anchor, asOf);
        expect(result).toEqual({
            calendarDaysElapsed: 13,
            calendarDaysRequired: 14,
            isMet: false,
            kind: CalendarGateProgressKind.Progress,
            restoreProgress: 10,
        });
    });

    it('reports a later cycle from the last payout date, anchor equal to progress', () => {
        const asOf = addIsoDays(anchor, 14);
        const result = calendarGateProgress(plan, 1, anchor, asOf);
        expect(result).toEqual({
            calendarDaysElapsed: 14,
            calendarDaysRequired: 14,
            isMet: true,
            kind: CalendarGateProgressKind.Progress,
            restoreProgress: 10,
        });
    });

    it('gives zero progress plus a missing-anchor result when no anchor is recorded', () => {
        expect(calendarGateProgress(plan, 0, null, anchor)).toEqual({
            kind: CalendarGateProgressKind.MissingAnchor,
            restoreProgress: 0,
        });
    });

    it('throws for a plan not gated on calendar days', () => {
        const rapid = registryPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Rapid,
        });
        expect(() =>
            calendarGateProgress(rapid, 0, anchor, anchor),
        ).toThrow(/calendar days/);
    });

    it('agrees with evaluatePayout at the boundary day for a first payout', () => {
        const met = calendarGateProgress(plan, 0, anchor, addIsoDays(anchor, 14));
        const notMet = calendarGateProgress(
            plan,
            0,
            anchor,
            addIsoDays(anchor, 13),
        );
        expect(met.kind).toBe(CalendarGateProgressKind.Progress);
        expect(notMet.kind).toBe(CalendarGateProgressKind.Progress);
        if (
            met.kind !== CalendarGateProgressKind.Progress ||
            notMet.kind !== CalendarGateProgressKind.Progress
        ) {
            throw new Error('unreachable');
        }

        const state = fundedState(53_000);
        const metTracker = newFundedCycleTracker({
            ...state,
            balance: 50_000,
        });
        metTracker.restoreCalendarDayGateProgress(met.restoreProgress);
        const metEvaluation = metTracker.evaluatePayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });
        expect(metEvaluation.kind).toBe(PayoutEvaluationKind.Eligible);

        const notMetTracker = newFundedCycleTracker({
            ...state,
            balance: 50_000,
        });
        notMetTracker.restoreCalendarDayGateProgress(notMet.restoreProgress);
        const notMetEvaluation = notMetTracker.evaluatePayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });
        expect(notMetEvaluation).toEqual({
            gate: 'day-gate-not-met',
            kind: PayoutEvaluationKind.Blocked,
        });
    });

    it('agrees with evaluatePayout at the boundary day for a later cycle', () => {
        const met = calendarGateProgress(plan, 1, anchor, addIsoDays(anchor, 14));
        if (met.kind !== CalendarGateProgressKind.Progress) {
            throw new Error('unreachable');
        }
        const state = fundedState(53_000);
        const tracker = newFundedCycleTracker({ ...state, balance: 50_000 });
        tracker.payoutsIssued = 1;
        tracker.restoreCalendarDayGateProgress(met.restoreProgress);
        const evaluation = tracker.evaluatePayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });
        expect(evaluation.kind).toBe(PayoutEvaluationKind.Eligible);
    });
});
