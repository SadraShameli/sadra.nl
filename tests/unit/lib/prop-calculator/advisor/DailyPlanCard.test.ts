import { describe, expect, it } from 'vitest';

import {
    ConsistencyRule,
    ConsistencyScope,
    dollars,
    fraction,
    ONE_CENT,
} from '~/lib/prop-calculator';
import {
    ConsistencyCeilingNote,
    dailyPlanCard,
    DayStopReason,
    DEFAULT_RULEBOOK,
    FundedFixedRiskRule,
    type FundedRuleContext,
    NO_PERSONAL_CAPS,
    SizingConstraint,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const funded = new FundedFixedRiskRule(DEFAULT_RULEBOOK);

function fundedContext(
    overrides: Partial<FundedRuleContext> = {},
): FundedRuleContext {
    return {
        ceiling: null,
        contractLimit: null,
        cushion: dollars(3000),
        dayStartDllRoom: null,
        instrument: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: ONE_CENT,
        stage: SizingStage.Funded,
        ...overrides,
    };
}

describe('dailyPlanCard (PT-19f, F-127, F-146, F-154)', () => {
    it('walks the flat funded rungs with TP and running loss until the daily trade count from tradesPerDayMax stops the day', () => {
        const card = dailyPlanCard(funded, fundedContext());

        expect(card.rungs.map((rung) => rung.risk)).toEqual([
            250, 250, 250, 250,
        ]);
        expect(card.rungs.map((rung) => rung.takeProfit)).toEqual([
            500, 500, 500, 500,
        ]);
        expect(card.rungs[0]?.runningLossBefore).toBe(0);
        expect(card.rungs[3]?.runningLossAfter).toBe(1000);
        expect(card.stopReason).toBe(DayStopReason.MaxTrades);
        expect(card.stopCappedBy).toEqual([]);
    });

    it('caps the first rung at (ceiling - running PnL) / rr, naming CeilingCap', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({ ceiling: dollars(300) }),
        );

        expect(card.rungs.map((rung) => rung.risk)).toEqual([
            150, 225, 250, 250,
        ]);
        expect(card.rungs[0]?.cappedBy).toEqual([SizingConstraint.CeilingCap]);
        expect(card.rungs[1]?.cappedBy).toEqual([SizingConstraint.CeilingCap]);
        expect(card.rungs[2]?.cappedBy).toEqual([]);
    });

    it('stops for today, with no rungs at all, when the ceiling is already exhausted', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({ ceiling: dollars(0) }),
        );

        expect(card.rungs).toEqual([]);
        expect(card.stopReason).toBe(DayStopReason.CeilingReached);
        expect(card.stopCappedBy).toEqual([SizingConstraint.CeilingCap]);
    });

    it('sources a funded-consistency ceiling from ConsistencyRule.maxDayProfitBeforeViolation and names it ConsistencyCap', () => {
        const rule = new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.4),
        );
        const consistencyCeiling = rule.maxDayProfitBeforeViolation(600);
        expect(consistencyCeiling).toBe(400);

        const card = dailyPlanCard(
            funded,
            fundedContext({ consistencyCeiling }),
        );

        expect(card.profitCeiling).toEqual({
            amount: 400,
            constraint: SizingConstraint.ConsistencyCap,
        });
        expect(card.rungs[0]?.risk).toBe(200);
        expect(card.rungs[0]?.takeProfit).toBe(400);
        expect(card.rungs[0]?.cappedBy).toEqual([
            SizingConstraint.ConsistencyCap,
        ]);
        expect(card.rungs[1]?.risk).toBe(250);
        expect(card.rungs[1]?.cappedBy).toEqual([]);
    });

    it('keeps a live single-day trigger ceiling named CeilingCap when it is tighter than the consistency ceiling', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({
                ceiling: dollars(250),
                consistencyCeiling: dollars(400),
            }),
        );

        expect(card.profitCeiling).toEqual({
            amount: 250,
            constraint: SizingConstraint.CeilingCap,
        });
        expect(card.rungs[0]?.cappedBy).toEqual([SizingConstraint.CeilingCap]);
    });

    it('names the consistency ceiling when it is tighter than the trigger ceiling', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({
                ceiling: dollars(900),
                consistencyCeiling: dollars(400),
            }),
        );

        expect(card.profitCeiling).toEqual({
            amount: 400,
            constraint: SizingConstraint.ConsistencyCap,
        });
    });

    it('stops with ConsistencyCap and no rungs when the consistency ceiling is below the placeable minimum', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({ consistencyCeiling: dollars(0) }),
        );

        expect(card.rungs).toEqual([]);
        expect(card.stopReason).toBe(DayStopReason.CeilingReached);
        expect(card.stopCappedBy).toEqual([SizingConstraint.ConsistencyCap]);
    });

    it('keeps the documented rungs on a fresh cycle, where the ceiling is absent, and carries the fresh-cycle note (was: no rungs and CeilingReached from a ceiling of 0)', () => {
        const rule = new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.3),
        );
        expect(rule.maxDayProfitBeforeViolation(0)).toBe(0);

        const card = dailyPlanCard(
            funded,
            fundedContext({
                consistencyCeiling: null,
                consistencyNote: ConsistencyCeilingNote.FreshCycle,
            }),
        );

        expect(card.rungs.map((rung) => rung.risk)).toEqual([
            250, 250, 250, 250,
        ]);
        expect(card.stopReason).toBe(DayStopReason.MaxTrades);
        expect(card.profitCeiling).toBeNull();
        expect(card.consistencyNote).toBe(ConsistencyCeilingNote.FreshCycle);
    });

    it('carries no consistency note when the context has none', () => {
        expect(
            dailyPlanCard(funded, fundedContext()).consistencyNote,
        ).toBeNull();
    });

    it('caps every rung at a personal daily profit cap, naming PersonalCap', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({
                personalCaps: {
                    ...NO_PERSONAL_CAPS,
                    dailyProfitCap: dollars(200),
                },
            }),
        );

        expect(card.rungs.map((rung) => rung.risk)).toEqual([
            100, 150, 225, 250,
        ]);
        expect(card.rungs[0]?.cappedBy).toEqual([SizingConstraint.PersonalCap]);
        expect(card.stopReason).toBe(DayStopReason.MaxTrades);
    });

    it('never places a rung below the placeable minimum: no cushion stops immediately with no loss room', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({ cushion: dollars(0) }),
        );

        expect(card.rungs).toEqual([]);
        expect(card.stopReason).toBe(DayStopReason.NoLossRoom);
    });
});
