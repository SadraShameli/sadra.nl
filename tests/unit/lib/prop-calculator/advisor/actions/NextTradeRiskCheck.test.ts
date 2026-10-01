import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import {
    DayStopReason,
    DEFAULT_RULEBOOK,
    EvalLadderRule,
    type EvalRuleContext,
    FundedFixedRiskRule,
    type FundedRuleContext,
    NextTradeKind,
    NextTradeRiskVerdict,
    NO_PERSONAL_CAPS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { nextTradeRiskCheck } from '~/lib/prop-calculator/advisor/actions';

const ZERO_DAY = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

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

describe('nextTradeRiskCheck (F-V19, F-V20, PT-74b step 4)', () => {
    const funded = new FundedFixedRiskRule(DEFAULT_RULEBOOK);

    it('is WithinPlan when the proposed risk matches the documented rung exactly', () => {
        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            isPayoutEligible: false,
            proposedRisk: dollars(250),
            rule: funded,
        });
        expect(result.verdict).toBe(NextTradeRiskVerdict.WithinPlan);
        expect(result.excessCents).toBe(0);
        expect(result.documentedRung).toBe(250);
    });

    it('is AboveDocumented with the excess in cents when the proposed risk exceeds the rung', () => {
        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            isPayoutEligible: false,
            proposedRisk: dollars(300),
            rule: funded,
        });
        expect(result.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(result.excessCents).toBe(5000);
    });

    it('flags PayoutEligibleAboveRung when risk is above the rung on a payout-eligible account', () => {
        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            isPayoutEligible: true,
            proposedRisk: dollars(300),
            rule: funded,
        });
        expect(result.payoutEligibleAboveRung).toBe(true);
    });

    it('never flags PayoutEligibleAboveRung when the risk stays within the documented rung', () => {
        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            isPayoutEligible: true,
            proposedRisk: dollars(250),
            rule: funded,
        });
        expect(result.payoutEligibleAboveRung).toBe(false);
    });

    it('is AboveDp with the excess in cents when within the documented rung but above a stored DP risk', () => {
        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            dpRisk: dollars(180),
            isPayoutEligible: false,
            proposedRisk: dollars(250),
            rule: funded,
        });
        expect(result.verdict).toBe(NextTradeRiskVerdict.AboveDp);
        expect(result.excessCents).toBe(7000);
    });

    it('prefers AboveDocumented over AboveDp when both are exceeded', () => {
        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            dpRisk: dollars(180),
            isPayoutEligible: false,
            proposedRisk: dollars(300),
            rule: funded,
        });
        expect(result.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
    });

    it("the eval ladder's escalated rung after a loss is WithinPlan", () => {
        const evalRule = new EvalLadderRule(DEFAULT_RULEBOOK);
        const context = evalContext();
        const firstTrade = evalRule.nextTrade(context, ZERO_DAY);
        if (firstTrade.kind !== NextTradeKind.Trade) {
            throw new Error('expected a trade');
        }
        const dayAfterLoss = {
            dayPnL: dollars(0 - firstTrade.rung.risk),
            losses: 1,
            runningLoss: firstTrade.rung.runningLossAfter,
            wins: 0,
        };
        const secondTrade = evalRule.nextTrade(context, dayAfterLoss);
        if (secondTrade.kind !== NextTradeKind.Trade) {
            throw new Error('expected a trade');
        }
        expect(secondTrade.rung.risk).toBeGreaterThan(firstTrade.rung.risk);

        const result = nextTradeRiskCheck({
            context,
            day: dayAfterLoss,
            isPayoutEligible: false,
            proposedRisk: secondTrade.rung.risk,
            rule: evalRule,
        });
        expect(result.verdict).toBe(NextTradeRiskVerdict.WithinPlan);
    });

    it('is AboveDocumented with the whole risk as excess and the stop reason when the day is already stopped, never WithinPlan', () => {
        const stoppedDay = {
            dayPnL: dollars(-1000),
            losses: DEFAULT_RULEBOOK.funded.tradesPerDayMax,
            runningLoss: dollars(1000),
            wins: 0,
        };
        const trade = funded.nextTrade(fundedContext(), stoppedDay);
        expect(trade.kind).toBe(NextTradeKind.Stop);

        const result = nextTradeRiskCheck({
            context: fundedContext(),
            day: stoppedDay,
            isPayoutEligible: false,
            proposedRisk: dollars(600),
            rule: funded,
        });

        expect(result.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(result.excessCents).toBe(60_000);
        expect(result.documentedRung).toBeNull();
        expect(result.stopReason).toBe(DayStopReason.MaxTrades);
    });

    it('stays WithinPlan for a zero proposed risk on a stopped day and AboveDocumented beyond the rung count', () => {
        const stoppedDay = {
            dayPnL: dollars(-5000),
            losses: DEFAULT_RULEBOOK.funded.tradesPerDayMax + 3,
            runningLoss: dollars(5000),
            wins: 0,
        };

        const zero = nextTradeRiskCheck({
            context: fundedContext(),
            day: stoppedDay,
            isPayoutEligible: true,
            proposedRisk: dollars(0),
            rule: funded,
        });
        const beyond = nextTradeRiskCheck({
            context: fundedContext(),
            day: stoppedDay,
            isPayoutEligible: true,
            proposedRisk: dollars(1),
            rule: funded,
        });

        expect(zero.verdict).toBe(NextTradeRiskVerdict.WithinPlan);
        expect(zero.stopReason).toBe(DayStopReason.MaxTrades);
        expect(beyond.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(beyond.excessCents).toBe(100);
        expect(beyond.payoutEligibleAboveRung).toBe(true);
    });

    it('is AboveDocumented on a stopped eval day and carries no stop reason on a tradable day', () => {
        const evalRule = new EvalLadderRule(DEFAULT_RULEBOOK);
        const context = { ...evalContext(), cushion: dollars(0) };
        const trade = evalRule.nextTrade(context, ZERO_DAY);
        expect(trade.kind).toBe(NextTradeKind.Stop);

        const stopped = nextTradeRiskCheck({
            context,
            day: ZERO_DAY,
            isPayoutEligible: false,
            proposedRisk: dollars(400),
            rule: evalRule,
        });
        const tradable = nextTradeRiskCheck({
            context: fundedContext(),
            day: ZERO_DAY,
            isPayoutEligible: false,
            proposedRisk: dollars(250),
            rule: funded,
        });

        expect(stopped.verdict).toBe(NextTradeRiskVerdict.AboveDocumented);
        expect(stopped.excessCents).toBe(40_000);
        expect(stopped.stopReason).toBe(DayStopReason.NoLossRoom);
        expect(tradable.stopReason).toBeNull();
    });
});
