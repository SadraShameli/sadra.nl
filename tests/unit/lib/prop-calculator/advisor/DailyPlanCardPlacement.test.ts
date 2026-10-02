import { describe, expect, it } from 'vitest';

import { dollars, InstrumentSymbol } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalLadderRule,
    type EvalRuleContext,
    FundedFixedRiskRule,
    type FundedRuleContext,
    NextTradeRiskVerdict,
    NO_PERSONAL_CAPS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { nextTradeRiskCheck } from '~/lib/prop-calculator/advisor/actions';
import { dailyPlanCard } from '~/lib/prop-calculator/advisor/DailyPlanCard';
import { RungPlacement } from '~/lib/prop-calculator/advisor/PlaceableMinimum';

const ZERO_DAY = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

const NQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 20,
} as const;

const MNQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.MNQ,
    stopPoints: 20,
} as const;

function evalContext(): EvalRuleContext {
    return {
        ceiling: null,
        consistencyDailyCap: null,
        contractLimit: null,
        cushion: dollars(2000),
        dayStartDllRoom: null,
        instrument: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: dollars(0.01),
        remainingProfitToTarget: dollars(4000),
        stage: SizingStage.Eval,
    };
}

function fundedContext(): FundedRuleContext {
    return {
        ceiling: null,
        contractLimit: null,
        cushion: dollars(3000),
        dayStartDllRoom: null,
        instrument: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: dollars(0.01),
        stage: SizingStage.Funded,
    };
}

describe('the daily plan card flags a funded rung below one contract (PT-36h, F-154)', () => {
    const funded = new FundedFixedRiskRule(DEFAULT_RULEBOOK);

    it('flags every rung when one contract at the entered stop risks more than the documented rung', () => {
        const card = dailyPlanCard(funded, fundedContext(), NQ_AT_20_POINTS);

        expect(card.rungs[0]?.risk).toBe(250);
        expect(card.rungPlacements).toEqual(
            card.rungs.map(() => RungPlacement.BelowOneContract),
        );
    });

    it('places the rungs when one contract at the entered stop fits inside them', () => {
        const card = dailyPlanCard(funded, fundedContext(), MNQ_AT_20_POINTS);

        expect(card.rungs.length).toBeGreaterThan(0);
        expect(card.rungPlacements).toEqual(
            card.rungs.map(() => RungPlacement.Placeable),
        );
    });

    it('says it was not checked when no stop was entered', () => {
        const card = dailyPlanCard(funded, fundedContext());

        expect(card.rungPlacements).toEqual(
            card.rungs.map(() => RungPlacement.NotChecked),
        );
    });

    it('never flags an evaluation rung, which stops instead of placing below one contract', () => {
        const card = dailyPlanCard(
            new EvalLadderRule(DEFAULT_RULEBOOK),
            evalContext(),
            NQ_AT_20_POINTS,
        );

        expect(card.rungPlacements).toEqual(
            card.rungs.map(() => RungPlacement.NotChecked),
        );
    });
});

describe('the next-trade risk check flags a documented rung below one contract (PT-36h, F-154)', () => {
    const funded = new FundedFixedRiskRule(DEFAULT_RULEBOOK);

    it('carries the flag beside the documented rung', () => {
        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            isPayoutEligible: false,
            placement: NQ_AT_20_POINTS,
            proposedRisk: dollars(250),
            rule: funded,
        });

        expect(result.verdict).toBe(NextTradeRiskVerdict.WithinPlan);
        expect(result.documentedRungPlacement).toBe(
            RungPlacement.BelowOneContract,
        );
    });

    it('places the documented rung when a contract fits inside it', () => {
        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            isPayoutEligible: false,
            placement: MNQ_AT_20_POINTS,
            proposedRisk: dollars(250),
            rule: funded,
        });

        expect(result.documentedRungPlacement).toBe(RungPlacement.Placeable);
    });

    it('says it was not checked without a stop, and when no rung applies', () => {
        const without = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            isPayoutEligible: false,
            proposedRisk: dollars(250),
            rule: funded,
        });
        const noRung = nextTradeRiskCheck({
            context: fundedContext(),
            day: {
                dayPnL: dollars(-3000),
                losses: 12,
                runningLoss: dollars(3000),
                wins: 0,
            },
            isPayoutEligible: false,
            placement: NQ_AT_20_POINTS,
            proposedRisk: dollars(250),
            rule: funded,
        });

        expect(without.documentedRungPlacement).toBe(RungPlacement.NotChecked);
        expect(noRung.documentedRung).toBeNull();
        expect(noRung.documentedRungPlacement).toBe(RungPlacement.NotChecked);
    });
});
