import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    applyTrade,
    closeTradingDay,
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    dollars,
    FirmId,
    MffuVariant,
    type Plan,
    recordBestDay,
    resetForNewDay,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

function apexIntraday(): Plan {
    const plan = new ApexTraderFunding().findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Intraday,
    });
    if (!plan) throw new Error('Apex Intraday 50K plan not found');
    return plan;
}

function rapidEod(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('applyTrade books one trade through the plan drawdown', () => {
    it('ratchets an intraday trailing threshold by the trade gain and survives', () => {
        const plan = apexIntraday();
        const state = plan.initialState();
        expect(state.threshold).toBe(48_000);

        applyTrade(plan, TradingPhase.Eval, state, 500);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);

        expect(state.balance).toBe(50_500);
        expect(state.todayPnL).toBe(500);
        expect(state.threshold).toBe(48_500);
    });

    it('uses an explicit intraday peak when one is given', () => {
        const plan = apexIntraday();
        const state = plan.initialState();

        applyTrade(plan, TradingPhase.Eval, state, -200, 300);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);

        expect(state.balance).toBe(49_800);
        expect(state.threshold).toBe(48_300);
    });

    it('reports a bust when the loss reaches the threshold', () => {
        const plan = apexIntraday();
        const state = plan.initialState();

        applyTrade(plan, TradingPhase.Eval, state, -2000);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(true);
        expect(state.balance).toBe(48_000);
    });

    it('reports a bust on a terminating eval daily loss limit', () => {
        const plan = apexIntraday().withOverrides({
            evalDailyLossLimit: {
                amount: dollars(1000),
                kind: DailyLossLimitKind.Flat,
            },
            evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Terminate,
        });
        const state = plan.initialState();

        applyTrade(plan, TradingPhase.Eval, state, -999);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);
        applyTrade(plan, TradingPhase.Eval, state, -1);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(true);
    });

    it('does not bust on a lockout daily loss limit', () => {
        const plan = apexIntraday().withOverrides({
            evalDailyLossLimit: {
                amount: dollars(1000),
                kind: DailyLossLimitKind.Flat,
            },
            evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Lockout,
        });
        const state = plan.initialState();

        applyTrade(plan, TradingPhase.Eval, state, -1000);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);
    });
});

describe('closeTradingDay books the day close', () => {
    it('counts an eval trading day only when the day traded, and always counts the elapsed day', () => {
        const plan = rapidEod();
        const state = plan.initialState();

        closeTradingDay(plan, TradingPhase.Eval, state, false);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);
        expect(state.tradingDays).toBe(0);
        expect(state.elapsedDays).toBe(1);
        expect(state.consecutiveIdleDays).toBe(1);

        closeTradingDay(plan, TradingPhase.Eval, state, true);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);
        expect(state.tradingDays).toBe(1);
        expect(state.elapsedDays).toBe(2);
        expect(state.consecutiveIdleDays).toBe(0);
        expect(state.qualifyingDays).toBe(1);
    });

    it('leaves the eval day counters alone in the funded phase', () => {
        const plan = rapidEod();
        const state = plan.initialState();

        closeTradingDay(plan, TradingPhase.Funded, state, true);

        expect(state.tradingDays).toBe(0);
        expect(state.elapsedDays).toBe(0);
        expect(state.qualifyingDays).toBe(1);
    });

    it('runs the end-of-day drawdown ratchet and records the day-close peak', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        applyTrade(plan, TradingPhase.Eval, state, 700);
        expect(state.threshold).toBe(48_000);

        closeTradingDay(plan, TradingPhase.Eval, state, true);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);

        expect(state.threshold).toBe(48_700);
        expect(state.peakDayCloseProfit).toBe(700);
    });

    it('reports a bust found at the day close', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        state.balance = state.threshold;

        closeTradingDay(plan, TradingPhase.Eval, state, true);
        expect(plan.isBust(state, TradingPhase.Eval)).toBe(true);
    });
});

describe('the intraday profit peak (Tradeify 10468321: reaching the balance intraday raises the tier from the next session)', () => {
    it('tracks the highest profit reached after any trade without committing it before the session closes', () => {
        const plan = rapidEod();
        const state = plan.initialState();

        applyTrade(plan, TradingPhase.Funded, state, 700);
        applyTrade(plan, TradingPhase.Funded, state, -500);

        expect(state.intradayHighProfit).toBe(700);
        expect(state.peakIntradayProfit).toBe(0);
    });

    it('commits the session intraday high at the close and never lowers it after a losing session', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        applyTrade(plan, TradingPhase.Funded, state, 700);
        applyTrade(plan, TradingPhase.Funded, state, -500);
        closeTradingDay(plan, TradingPhase.Funded, state, true);

        expect(state.peakIntradayProfit).toBe(700);
        expect(state.peakDayCloseProfit).toBe(200);

        resetForNewDay(state);
        applyTrade(plan, TradingPhase.Funded, state, -150);
        closeTradingDay(plan, TradingPhase.Funded, state, true);

        expect(state.peakIntradayProfit).toBe(700);
        expect(state.intradayHighProfit).toBe(700);
    });

    it('commits the session close when it is the highest point of the session', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        state.balance = state.startingBalance + 400;
        closeTradingDay(plan, TradingPhase.Funded, state, false);

        expect(state.peakIntradayProfit).toBe(400);
    });

    it('starts both intraday peaks at 0 and resets them only when a funded phase begins', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        expect(state.intradayHighProfit).toBe(0);
        expect(state.peakIntradayProfit).toBe(0);

        applyTrade(plan, TradingPhase.Eval, state, 900);
        closeTradingDay(plan, TradingPhase.Eval, state, true);
        resetForNewDay(state);
        expect(state.peakIntradayProfit).toBe(900);

        plan.beginFundedPhase(state);
        expect(state.intradayHighProfit).toBe(0);
        expect(state.peakIntradayProfit).toBe(0);
    });
});

describe('recordBestDay keeps the best day P&L', () => {
    it('raises bestDayProfit only on a better day', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        state.todayPnL = 400;
        recordBestDay(state);
        expect(state.bestDayProfit).toBe(400);

        resetForNewDay(state);
        state.todayPnL = 250;
        recordBestDay(state);
        expect(state.bestDayProfit).toBe(400);

        state.todayPnL = -300;
        recordBestDay(state);
        expect(state.bestDayProfit).toBe(400);
    });
});
