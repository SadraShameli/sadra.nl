import { describe, expect, it } from 'vitest';

import {
    ConsistencyScope,
    DrawdownKind,
    FirmId,
} from '~/lib/prop-calculator/core';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';

const plan = (() => {
    const found = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
    });
    if (!found) throw new Error('E8 Futures Signature 50K plan not found');
    return found;
})();

describe('E8 Futures Signature 50K', () => {
    it('is registered in ALL_FIRMS and findable via findFirm', () => {
        expect(findFirm(FirmId.E8Futures)).toBeInstanceOf(E8Futures);
        expect(ALL_FIRMS.some((firm) => firm.id === FirmId.E8Futures)).toBe(
            true,
        );
    });

    it('matches the live-verified core numbers', () => {
        expect(plan.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.drawdown.amount).toBe(2000);
        expect(plan.drawdown.lock?.atProfit).toBe(2000);
        expect(plan.drawdown.lock?.lockedThreshold(50_000)).toBe(50_000);
        expect(plan.profitTarget).toBe(3000);
        expect(plan.fees.oneTimeEval).toBe(160);
        expect(plan.fees.reset).toBe(160);
        expect(plan.minPayoutProfit).toBe(2000);
    });

    it('stays EOD-trailing once funded instead of switching to an intraday trail', () => {
        expect(plan.fundedDrawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.fundedDrawdown).toBe(plan.drawdown);
    });

    it('does not repeat the TPT bug: minPayoutRequest is explicit and independent of minPayoutProfit', () => {
        expect(plan.minPayoutRequest).toBe(0.01);
        expect(plan.minPayoutRequest).not.toBe(plan.minPayoutProfit);
    });

    it('applies the 35% consistency bar to the funded stage only', () => {
        expect(plan.evalConsistencyRule()).toBeNull();
        const funded = plan.fundedConsistencyRule();
        expect(funded?.scope).toBe(ConsistencyScope.Funded);
        expect(funded?.maxBestDayShare).toBe(0.35);
    });

    it('the payout cap steps up by payout count (1250 / 2250 / 3250), not a flat first-tier value', () => {
        const state = plan.initialState();
        expect(plan.resolvedPayoutCap(state, 0).requestCap).toBe(1250);
        expect(plan.resolvedPayoutCap(state, 1).requestCap).toBe(1250);
        expect(plan.resolvedPayoutCap(state, 2).requestCap).toBe(2250);
        expect(plan.resolvedPayoutCap(state, 3).requestCap).toBe(2250);
        expect(plan.resolvedPayoutCap(state, 4).requestCap).toBe(3250);
        expect(plan.resolvedPayoutCap(state, 40).requestCap).toBe(3250);
    });

    it('closes both the evaluation and funded account after 7 consecutive days without a trade (live-verified 2026-09-13 against helpfutures.e8markets.com)', () => {
        expect(plan.maxConsecutiveIdleDays).toBe(7);
    });

    it('the $1,000 daily pause locks the day out once funded, without busting the account, and does not apply during the eval', () => {
        const evalState = plan.initialState();
        evalState.balance -= 1000;
        evalState.todayPnL = -1000;
        expect(plan.isDayLockedOut(evalState, TradingPhase.Eval)).toBe(false);
        expect(plan.isBust(evalState, TradingPhase.Eval)).toBe(false);

        const fundedState = plan.initialState();
        fundedState.balance -= 1000;
        fundedState.todayPnL = -1000;
        expect(plan.isDayLockedOut(fundedState, TradingPhase.Funded)).toBe(
            true,
        );
        expect(plan.isBust(fundedState, TradingPhase.Funded)).toBe(false);
    });
});
