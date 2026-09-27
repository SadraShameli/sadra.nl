import { describe, expect, it } from 'vitest';

import { FirmId, MffuVariant, TradingPhase } from '~/lib/prop-calculator/core';
import { fundedCalendarWeekInactivityDpGap } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';

function mffProPlan() {
    const found = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!found) throw new Error('MFF Pro 50K plan not found');
    return found;
}

function tptPlan() {
    const found = new TakeProfitTrader().findPlan({
        accountSize: 50_000,
        firm: FirmId.Tpt,
    });
    if (!found) throw new Error('TPT 50K plan not found');
    return found;
}

describe('fundedCalendarWeekInactivityDpGap discloses the exact DP gap for a calendar-week inactivity rule (N-80 follow-up)', () => {
    it('names the gap for TPT PRO, whose funded phase uses calendarWeekInactivity instead of maxConsecutiveIdleDays', () => {
        const plan = tptPlan();
        expect(
            plan.calendarWeekInactivityFor(TradingPhase.Funded),
        ).not.toBeNull();
        const gap = fundedCalendarWeekInactivityDpGap(plan);
        expect(gap).not.toBeNull();
        expect(gap).toContain('calendar week');
        expect(gap).toContain('does not model');
        expect(gap).toContain(plan.label);
    });

    it('reports no gap for a plan whose funded phase has no calendar-week inactivity rule', () => {
        const plan = mffProPlan();
        expect(plan.calendarWeekInactivityFor(TradingPhase.Funded)).toBeNull();
        expect(fundedCalendarWeekInactivityDpGap(plan)).toBeNull();
    });
});
