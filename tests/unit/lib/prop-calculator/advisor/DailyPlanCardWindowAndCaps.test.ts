import { describe, expect, it } from 'vitest';

import { dollars, ONE_CENT } from '~/lib/prop-calculator';
import {
    createDocumentedRule,
    dailyPlanCard,
    DEFAULT_RULEBOOK,
    type EvalRuleContext,
    EvalSizingMode,
    type FundedRuleContext,
    type LiveRuleContext,
    NO_PERSONAL_CAPS,
    type RulebookParameters,
    SizingConstraint,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const TWO_TRADES_PER_WINDOW = 2;

function evalContext(
    overrides: Partial<EvalRuleContext> = {},
): EvalRuleContext {
    return {
        ceiling: null,
        consistencyDailyCap: null,
        contractLimit: null,
        cushion: dollars(2000),
        dayStartDllRoom: null,
        instrument: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: ONE_CENT,
        remainingProfitToTarget: dollars(10_000),
        stage: SizingStage.Eval,
        ...overrides,
    };
}

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

function liveContext(): LiveRuleContext {
    return {
        ceiling: null,
        contractLimit: null,
        cushion: dollars(4000),
        dayStartDllRoom: null,
        floorTradeRisk: dollars(0),
        instrument: null,
        liveCushionPercent: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: ONE_CENT,
        stage: SizingStage.Live,
        thresholdLocked: false,
    };
}

function maxRiskRulebook(): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        eval: { ...DEFAULT_RULEBOOK.eval, mode: EvalSizingMode.MaxRisk },
    };
}

function rulebookWithWindowTrades(
    maxTradesPerWindow: number,
): RulebookParameters {
    return { ...DEFAULT_RULEBOOK, execution: { maxTradesPerWindow } };
}

describe('the daily plan card states the window rule (PT-105 step 1, F-127)', () => {
    it('reports one trade per window on the default rulebook for eval, funded and live cards', () => {
        expect(
            dailyPlanCard(
                createDocumentedRule(SizingStage.Eval, DEFAULT_RULEBOOK),
                evalContext(),
            ).maxTradesPerWindow,
        ).toBe(1);
        expect(
            dailyPlanCard(
                createDocumentedRule(SizingStage.Funded, DEFAULT_RULEBOOK),
                fundedContext(),
            ).maxTradesPerWindow,
        ).toBe(1);
        expect(
            dailyPlanCard(
                createDocumentedRule(SizingStage.Live, DEFAULT_RULEBOOK),
                liveContext(),
            ).maxTradesPerWindow,
        ).toBe(1);
    });

    it('reports the rulebook maxTradesPerWindow of 2 for eval, funded and live cards', () => {
        const rulebook = rulebookWithWindowTrades(TWO_TRADES_PER_WINDOW);

        expect(
            dailyPlanCard(
                createDocumentedRule(SizingStage.Eval, rulebook),
                evalContext(),
            ).maxTradesPerWindow,
        ).toBe(TWO_TRADES_PER_WINDOW);
        expect(
            dailyPlanCard(
                createDocumentedRule(SizingStage.Funded, rulebook),
                fundedContext(),
            ).maxTradesPerWindow,
        ).toBe(TWO_TRADES_PER_WINDOW);
        expect(
            dailyPlanCard(
                createDocumentedRule(SizingStage.Live, rulebook),
                liveContext(),
            ).maxTradesPerWindow,
        ).toBe(TWO_TRADES_PER_WINDOW);
    });

    it('keeps the rungs as the trades of successive windows, not capped by the window size', () => {
        const card = dailyPlanCard(
            createDocumentedRule(SizingStage.Funded, DEFAULT_RULEBOOK),
            fundedContext(),
        );

        expect(card.maxTradesPerWindow).toBe(1);
        expect(card.rungs).toHaveLength(
            DEFAULT_RULEBOOK.funded.tradesPerDayMax,
        );
    });
});

describe('the daily plan card states the loss cap and the profit ceiling (PT-105 step 2, F-127)', () => {
    const funded = createDocumentedRule(SizingStage.Funded, DEFAULT_RULEBOOK);

    it('reports a $600 day-start loss room as a loss cap of 600 named DailyLossCap', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({
                cushion: dollars(1200),
                dayStartDllRoom: dollars(600),
            }),
        );

        expect(card.dailyLossCap).toEqual({
            amount: 600,
            constraint: SizingConstraint.DailyLossCap,
        });
    });

    it('carries the day-start cushion and the day loss room beside the cap (PT-92 addendum)', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({
                cushion: dollars(1200),
                dayStartDllRoom: dollars(600),
            }),
        );

        expect(card.cushion).toBe(1200);
        expect(card.dailyLossRoom).toBe(600);
    });

    it('carries no day loss room when the plan has no daily loss limit and no personal one', () => {
        const card = dailyPlanCard(funded, fundedContext());

        expect(card.dailyLossRoom).toBeNull();
        expect(card.cushion).toBe(3000);
    });

    it('names the cushion when it is tighter than the daily loss room', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({
                cushion: dollars(400),
                dayStartDllRoom: dollars(600),
            }),
        );

        expect(card.dailyLossCap).toEqual({
            amount: 400,
            constraint: SizingConstraint.CushionCap,
        });
    });

    it('names the personal daily loss limit when it is the tightest room', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({
                cushion: dollars(1200),
                dayStartDllRoom: dollars(600),
                personalDll: dollars(300),
            }),
        );

        expect(card.dailyLossCap).toEqual({
            amount: 300,
            constraint: SizingConstraint.PersonalCap,
        });
        expect(card.dailyLossRoom).toBe(300);
    });

    it('reports a zero loss cap, never a negative one, when the cushion is gone', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({ cushion: dollars(-50) }),
        );

        expect(card.dailyLossCap.amount).toBe(0);
        expect(card.dailyLossCap.constraint).toBe(SizingConstraint.CushionCap);
    });

    it('reports an eval max-risk profit ceiling of twice its first risk', () => {
        const card = dailyPlanCard(
            createDocumentedRule(SizingStage.Eval, maxRiskRulebook()),
            evalContext({ dayStartDllRoom: dollars(500) }),
        );

        expect(card.rungs[0]?.risk).toBe(500);
        expect(card.dailyProfitCeiling).toEqual({
            amount: 1000,
            constraint: SizingConstraint.DailyProfitCap,
        });
    });

    it('reports a personal daily profit cap as the day ceiling when it is tighter than the rule ceiling', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({
                ceiling: dollars(900),
                personalCaps: {
                    ...NO_PERSONAL_CAPS,
                    dailyProfitCap: dollars(200),
                },
            }),
        );

        expect(card.dailyProfitCeiling).toEqual({
            amount: 200,
            constraint: SizingConstraint.PersonalCap,
        });
    });

    it('reports the rule ceiling when no personal cap is tighter', () => {
        const card = dailyPlanCard(
            funded,
            fundedContext({ ceiling: dollars(900) }),
        );

        expect(card.dailyProfitCeiling).toEqual({
            amount: 900,
            constraint: SizingConstraint.CeilingCap,
        });
    });

    it('reports no day ceiling when nothing bounds the day profit', () => {
        const card = dailyPlanCard(funded, fundedContext());

        expect(card.dailyProfitCeiling).toBeNull();
        expect(card.profitCeiling).toBeNull();
    });

    it('reports the live card loss cap from its cushion', () => {
        const card = dailyPlanCard(
            createDocumentedRule(SizingStage.Live, DEFAULT_RULEBOOK),
            liveContext(),
        );

        expect(card.dailyLossCap).toEqual({
            amount: 4000,
            constraint: SizingConstraint.CushionCap,
        });
    });
});
