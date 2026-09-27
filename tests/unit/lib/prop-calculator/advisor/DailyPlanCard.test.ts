import { describe, expect, it } from 'vitest';

import {
    ConsistencyRule,
    ConsistencyScope,
    dollars,
    fraction,
    ONE_CENT,
} from '~/lib/prop-calculator';
import {
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
    it('walks the flat funded rungs with TP and running loss until Hard Rule 6 max-trades stops the day', () => {
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

    it('sources a funded-consistency ceiling from ConsistencyRule.maxDayProfitBeforeViolation, exhausted on a fresh cycle', () => {
        const rule = new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.3),
        );
        const ceiling = rule.maxDayProfitBeforeViolation(0);
        expect(ceiling).toBe(0);

        const card = dailyPlanCard(funded, fundedContext({ ceiling }));

        expect(card.rungs).toEqual([]);
        expect(card.stopReason).toBe(DayStopReason.CeilingReached);
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
