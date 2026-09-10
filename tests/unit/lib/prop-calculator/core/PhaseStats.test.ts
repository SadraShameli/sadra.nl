import { describe, expect, it } from 'vitest';

import { FirmId, MffuVariant } from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import {
    LossStreak,
    newPhaseStats,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

function rapidEod() {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('drawdown is tracked per phase, totals per trial', () => {
    it('does not book the eval peak as a funded drawdown', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        const totals = new TradeTotals();
        const streak = new LossStreak(totals);

        const evalStats = newPhaseStats(state.startingBalance, totals, streak);
        state.balance = 53_400;
        evalStats.recordTrade(true, 3400, state.balance);
        expect(totals.maxDrawdown).toBe(0);

        plan.beginFundedPhase(state);
        const fundedStats = newPhaseStats(state.balance, totals, streak);

        state.balance -= 300;
        fundedStats.recordTrade(false, -300, state.balance);

        expect(totals.maxDrawdown).toBe(300);
    });

    it('carries trade totals across the phase boundary', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        const totals = new TradeTotals();
        const streak = new LossStreak(totals);

        const evalStats = newPhaseStats(state.startingBalance, totals, streak);
        evalStats.recordTrade(true, 600, 50_600);
        evalStats.recordTrade(false, -300, 50_300);

        plan.beginFundedPhase(state);
        const fundedStats = newPhaseStats(state.balance, totals, streak);
        fundedStats.recordTrade(false, -200, 49_800);

        expect(totals.tradesTaken).toBe(3);
        expect(totals.grossWins).toBe(600);
        expect(totals.grossLosses).toBe(500);
        expect(evalStats.tradesTaken).toBe(2);
        expect(fundedStats.tradesTaken).toBe(1);
    });

    it('continues a losing streak across the phase boundary', () => {
        const plan = rapidEod();
        const state = plan.initialState();
        const totals = new TradeTotals();
        const streak = new LossStreak(totals);

        const evalStats = newPhaseStats(state.startingBalance, totals, streak);
        evalStats.recordTrade(false, -100, 49_900);
        evalStats.recordTrade(false, -100, 49_800);

        plan.beginFundedPhase(state);
        const fundedStats = newPhaseStats(state.balance, totals, streak);
        fundedStats.recordTrade(false, -100, 49_900);

        expect(totals.maxLosingStreak).toBe(3);
    });

    it('exposes no operation that lowers a running total', () => {
        const totals = new TradeTotals();
        totals.advanceMaxDrawdown(500);
        totals.advanceMaxDrawdown(100);
        expect(totals.maxDrawdown).toBe(500);

        totals.advanceMaxLosingStreak(4);
        totals.advanceMaxLosingStreak(1);
        expect(totals.maxLosingStreak).toBe(4);
    });
});
