import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    applyTrade,
    closeTradingDay,
    computeEvalStateValue,
    ConsistencyBasis,
    ConsistencyBoundary,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
    fraction,
    type Plan,
    recordBestDay,
    resetForNewDay,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import { toyPlan } from '../evalStateValueToy';

const MAX_EVAL_DAYS = 4;
const RISK_DOLLARS = 100;
const RR_RATIO = 2;
const WINRATE = 0.5;

function dayStartAt(
    plan: Plan,
    bestDay: number,
    profit: number,
): AccountState {
    return {
        ...plan.initialState(),
        balance: plan.initialState().startingBalance + profit,
        bestDayProfit: bestDay,
        elapsedDays: 1,
        intradayHighProfit: profit,
        peakDayCloseProfit: profit,
        peakIntradayProfit: profit,
        threshold: plan.initialState().startingBalance + profit - 100,
        tradingDays: 1,
    };
}

function doubleTargetPlan(): Plan {
    return toyPlan(100).withOverrides({
        consistency: new ConsistencyRule(
            ConsistencyScope.Eval,
            fraction(0.5),
            ConsistencyBasis.Cycle,
            ConsistencyViolationEffect.DoubleTarget,
            ConsistencyBoundary.Inclusive,
        ),
    });
}

function passProbabilityWithFirstRisk(
    plan: Plan,
    dayStart: AccountState,
    firstRisk: number,
): number {
    function closeDay(state: AccountState, isTraded: boolean): number {
        const closed = { ...state };
        closeTradingDay(plan, TradingPhase.Eval, closed, isTraded);
        recordBestDay(closed);
        if (plan.isBust(closed, TradingPhase.Eval)) return 0;
        return plan.isPassed(closed) ? 1 : walkDay(closed);
    }

    function trade(state: AccountState, pnl: number): number {
        const next = { ...state };
        applyTrade(plan, TradingPhase.Eval, next, pnl);
        return plan.isBust(next, TradingPhase.Eval) ? 0 : closeDay(next, true);
    }

    function bestOver(state: AccountState, isFirst: boolean): number {
        const risks = isFirst ? [firstRisk] : [0, RISK_DOLLARS];
        return Math.max(
            ...risks.map((risk) =>
                risk === 0
                    ? closeDay(state, false)
                    : WINRATE * trade(state, RR_RATIO * risk) +
                      (1 - WINRATE) * trade(state, -risk),
            ),
        );
    }

    function walkDay(state: AccountState): number {
        if ((state.elapsedDays ?? 0) >= MAX_EVAL_DAYS) return 0;
        const next = { ...state };
        resetForNewDay(next);
        return bestOver(next, false);
    }

    return bestOver({ ...dayStart }, true);
}

describe('computeEvalStateValue DoubleTarget ceiling (N-79 pin)', () => {
    const plan = doubleTargetPlan();
    const result = computeEvalStateValue({
        actionStepDollars: RISK_DOLLARS,
        cushionStepDollars: 100,
        maxActionDollars: 2 * RISK_DOLLARS,
        maxEvalDays: MAX_EVAL_DAYS,
        plan,
        profitStepDollars: 100,
        rrRatio: RR_RATIO,
        tradesPerDay: 1,
        winrate: fraction(WINRATE),
    });

    it.each([
        { bestDay: 500, profit: 500 },
        { bestDay: 500, profit: 600 },
        { bestDay: 600, profit: 700 },
        { bestDay: 600, profit: 800 },
    ])(
        'picks the first risk that maximises the exact pass probability from best day $bestDay at profit $profit, a state whose winning continuations pass the old DoubleTarget ceiling',
        ({ bestDay, profit }) => {
            const dayStart = dayStartAt(plan, bestDay, profit);
            const chosen = result.riskAtReachedState(dayStart, 0);
            if (chosen === null) throw new Error('expected a live state');

            const values = [0, RISK_DOLLARS].map((risk) =>
                passProbabilityWithFirstRisk(plan, dayStart, risk),
            );

            expect(values[1]).toBeGreaterThan(values[0] ?? NaN);
            expect(chosen).toBe(RISK_DOLLARS);
        },
    );
});
