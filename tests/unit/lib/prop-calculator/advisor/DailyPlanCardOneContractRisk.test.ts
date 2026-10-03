import { describe, expect, it } from 'vitest';

import { dollars, InstrumentSymbol } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalLadderRule,
    type EvalRuleContext,
    FundedFixedRiskRule,
    type FundedRuleContext,
    NO_PERSONAL_CAPS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { dailyPlanCard } from '~/lib/prop-calculator/advisor/DailyPlanCard';

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

describe('the daily plan card carries the risk of one contract at the entered stop (PT-36k, F-154)', () => {
    const funded = new FundedFixedRiskRule(DEFAULT_RULEBOOK);

    it('carries the risk of one NQ contract at a 20 point stop', () => {
        const card = dailyPlanCard(funded, fundedContext(), NQ_AT_20_POINTS);

        expect(card.oneContractRisk).toBe(400);
    });

    it('carries the risk of one MNQ contract at the same stop', () => {
        const card = dailyPlanCard(funded, fundedContext(), MNQ_AT_20_POINTS);

        expect(card.oneContractRisk).toBe(40);
    });

    it('carries no one-contract risk when no stop was entered', () => {
        const card = dailyPlanCard(funded, fundedContext());

        expect(card.oneContractRisk).toBeNull();
    });

    it('carries no one-contract risk for an evaluation card, which is never checked for placement', () => {
        const card = dailyPlanCard(
            new EvalLadderRule(DEFAULT_RULEBOOK),
            evalContext(),
            NQ_AT_20_POINTS,
        );

        expect(card.oneContractRisk).toBeNull();
    });
});
