import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    computeEvalStateValue,
    ConsistencyBasis,
    ConsistencyBoundary,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
    DailyLossLimitKind,
    dollars,
    type EvalStateValueResult,
    fraction,
    type Plan,
    PolicySizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import { toyDpConfig, toyPlan } from '../evalStateValueToy';

const HORIZON_DAYS = 2;
const MAX_ACTION_DOLLARS = 100;
const MID_DAY_TRADE_INDEX = 1;
const TWO_TRADES_PER_DAY = 2;

function atHorizon(plan: Plan): AccountState {
    return { ...plan.initialState(), elapsedDays: HORIZON_DAYS };
}

function computedRisk(
    result: EvalStateValueResult,
    state: AccountState,
    tradeIndex: number,
): number {
    const computeRisk = result.dayPolicy.computeRisk;
    if (!computeRisk) throw new Error('eval DP day policy has no computeRisk');
    return computeRisk(state, tradeIndex);
}

function dayOneAfterLoss(plan: Plan): AccountState {
    return {
        ...plan.initialState(),
        balance: 950,
        elapsedDays: 1,
        threshold: 900,
        tradingDays: 1,
    };
}

function dayOneAfterWin(plan: Plan): AccountState {
    return {
        ...plan.initialState(),
        balance: 1100,
        bestDayProfit: 100,
        elapsedDays: 1,
        intradayHighProfit: 100,
        peakDayCloseProfit: 100,
        peakIntradayProfit: 100,
        threshold: 1000,
        tradingDays: 1,
    };
}

function midDayOf(dayStart: AccountState, todayPnL: number): AccountState {
    const balance = dayStart.balance + todayPnL;
    const intradayProfit = Math.max(
        dayStart.peakIntradayProfit,
        balance - dayStart.startingBalance,
    );
    return {
        ...dayStart,
        balance,
        intradayHighProfit: intradayProfit,
        peakIntradayProfit: intradayProfit,
        todayPnL,
    };
}

function passRegion(plan: Plan): AccountState {
    return {
        ...plan.initialState(),
        balance: 1300,
        bestDayProfit: 300,
        elapsedDays: 1,
        intradayHighProfit: 300,
        peakDayCloseProfit: 300,
        peakIntradayProfit: 300,
        threshold: 1200,
        tradingDays: 1,
    };
}

function solveToy(plan: Plan = toyPlan(250)): EvalStateValueResult {
    return computeEvalStateValue(
        toyDpConfig(plan, HORIZON_DAYS, MAX_ACTION_DOLLARS),
    );
}

function solveTwoTradeToy(plan: Plan): EvalStateValueResult {
    return computeEvalStateValue({
        ...toyDpConfig(plan, HORIZON_DAYS, MAX_ACTION_DOLLARS),
        tradesPerDay: TWO_TRADES_PER_DAY,
    });
}

describe('computeEvalStateValue working-tree pins on toyPlan(250), 2-day cap, max action 100 (PD-31)', () => {
    const plan = toyPlan(250);
    const result = solveToy(plan);

    it('pins initialValue and reachedStateCount', () => {
        expect(result.initialValue).toBeCloseTo(0.25, 10);
        expect(result.reachedStateCount).toBe(43);
    });

    it('pins computeRisk at the initial state, trade 0', () => {
        expect(computedRisk(result, plan.initialState(), 0)).toBe(50);
    });

    it('pins computeRisk on day 1 after a day-0 win (cushion 100, threshold offset 100)', () => {
        expect(computedRisk(result, dayOneAfterWin(plan), 0)).toBe(100);
    });

    it('pins computeRisk on day 1 after a day-0 loss (cushion 50)', () => {
        expect(computedRisk(result, dayOneAfterLoss(plan), 0)).toBe(0);
    });

    it('pins computeRisk in the pass region (balance 1,300)', () => {
        expect(computedRisk(result, passRegion(plan), 0)).toBe(0);
    });

    it('pins computeRisk at elapsedDays 2 (the horizon)', () => {
        expect(computedRisk(result, atHorizon(plan), 0)).toBe(0);
    });

    it('pins computeRisk at a trade index past the slots on a solved key', () => {
        expect(computedRisk(result, plan.initialState(), 1)).toBe(0);
    });

    it('keeps the eval day policy sized as ContractCapped', () => {
        expect(result.dayPolicy.sizing).toBe(PolicySizing.ContractCapped);
    });
});

describe('computeEvalStateValue riskAtReachedState tells a solved state from one the DP never solved (F-116)', () => {
    const plan = toyPlan(250);
    const result = solveToy(plan);

    it('returns the same risk as computeRisk at the initial state', () => {
        const state = plan.initialState();
        expect(result.riskAtReachedState(state, 0)).toBe(50);
        expect(result.riskAtReachedState(state, 0)).toBe(
            computedRisk(result, state, 0),
        );
    });

    it('returns the computeRisk value on day 1 after a day-0 win', () => {
        const state = dayOneAfterWin(plan);
        expect(result.riskAtReachedState(state, 0)).toBe(100);
        expect(result.riskAtReachedState(state, 0)).toBe(
            computedRisk(result, state, 0),
        );
    });

    it('returns 0, not null, for the solved day-1 loss state whose optimum is to sit out', () => {
        const state = dayOneAfterLoss(plan);
        expect(result.riskAtReachedState(state, 0)).toBe(0);
        expect(result.riskAtReachedState(state, 0)).toBe(
            computedRisk(result, state, 0),
        );
    });

    it('returns null for a pass-region profit the solve short-circuits before any key', () => {
        expect(result.riskAtReachedState(passRegion(plan), 0)).toBeNull();
    });

    it('returns null for a day index at the eval-days horizon', () => {
        expect(result.riskAtReachedState(atHorizon(plan), 0)).toBeNull();
    });

    it('returns null at the day cap when maxEvalTradingDays is below maxEvalDays', () => {
        const capped = toyPlan(250).withOverrides({ maxEvalTradingDays: 1 });
        expect(capped.evalDayCap(HORIZON_DAYS)).toBe(1);
        const cappedResult = solveToy(capped);

        expect(cappedResult.riskAtReachedState(capped.initialState(), 0)).toBe(
            computedRisk(cappedResult, capped.initialState(), 0),
        );
        expect(
            cappedResult.riskAtReachedState(dayOneAfterLoss(capped), 0),
        ).toBeNull();
        expect(
            cappedResult.riskAtReachedState(dayOneAfterWin(capped), 0),
        ).toBeNull();
    });

    it('throws a message naming elapsedDays when the state has no day index', () => {
        const state: AccountState = { ...plan.initialState() };
        delete state.elapsedDays;

        expect(() => result.riskAtReachedState(state, 0)).toThrow(
            /elapsedDays/,
        );
        expect(() => result.riskAtReachedState(state, 0)).not.toThrow(/—/);
    });

    it.each([-1, 0.5, NaN, Infinity])(
        'throws on an elapsedDays of %s',
        (elapsedDays) => {
            const state = { ...plan.initialState(), elapsedDays };
            expect(() => result.riskAtReachedState(state, 0)).toThrow(
                /elapsedDays/,
            );
        },
    );

    it.each([-1, 0.5, NaN, Infinity])(
        'throws on a trade index of %s',
        (tradeIndex) => {
            expect(() =>
                result.riskAtReachedState(plan.initialState(), tradeIndex),
            ).toThrow(/trade index/);
        },
    );

    it('returns 0 for a trade index at or above tradesPerDay on a solved key, matching computeRisk', () => {
        const state = plan.initialState();
        expect(result.riskAtReachedState(state, 1)).toBe(0);
        expect(result.riskAtReachedState(state, 3)).toBe(0);
        expect(result.riskAtReachedState(state, 1)).toBe(
            computedRisk(result, state, 1),
        );
    });

    it('still returns null past the slots on an unsolved key', () => {
        expect(result.riskAtReachedState(passRegion(plan), 1)).toBeNull();
    });
});

describe('computeEvalStateValue riskAtReachedState returns null for an exact state already passed or busted off the grid', () => {
    it('returns null for a mid-day state below the threshold whose day-start key is solved', () => {
        const plan = toyPlan(250);
        const result = solveToy(plan);
        const busted: AccountState = {
            ...plan.initialState(),
            balance: 890,
            todayPnL: -110,
        };
        expect(plan.isBust(busted, TradingPhase.Eval)).toBe(true);
        expect(result.riskAtReachedState(plan.initialState(), 0)).toBe(50);

        expect(result.riskAtReachedState(busted, 0)).toBeNull();
    });

    it('returns null for a day-start state with a negative cushion that clamps onto a solved cushion-0 key', () => {
        const plan = toyPlan(250).withOverrides({
            evalDailyLossLimit: {
                amount: dollars(60),
                kind: DailyLossLimitKind.Flat,
            },
        });
        const result = computeEvalStateValue({
            ...toyDpConfig(plan, HORIZON_DAYS, MAX_ACTION_DOLLARS),
            commission: dollars(25),
        });
        const live: AccountState = {
            ...plan.initialState(),
            balance: 925,
            elapsedDays: 1,
            tradingDays: 1,
        };
        const busted: AccountState = { ...live, balance: 890 };
        expect(plan.isBust(busted, TradingPhase.Eval)).toBe(true);
        expect(result.riskAtReachedState(live, 0)).not.toBeNull();

        expect(result.riskAtReachedState(busted, 0)).toBeNull();
    });
});

describe('computeEvalStateValue riskAtReachedState reads a pass only at day close and a bust at any point (PT-18b)', () => {
    it('returns the solved intraday risk for a mid-day state past the target, which the simulator and the DP only pass at day close', () => {
        const plan = toyPlan(275);
        const result = solveTwoTradeToy(plan);
        const dayStart = dayOneAfterWin(plan);
        const midDay = midDayOf(dayStart, 200);
        expect(plan.isPassed(dayStart)).toBe(false);
        expect(plan.isPassed(midDay)).toBe(true);
        expect(result.riskAtReachedState(dayStart, 0)).not.toBeNull();

        expect(result.riskAtReachedState(midDay, MID_DAY_TRADE_INDEX)).toBe(
            computedRisk(result, midDay, MID_DAY_TRADE_INDEX),
        );
    });

    it('returns a positive solved risk for a mid-day state past the target that the close fails on consistency', () => {
        const plan = toyPlan(250).withOverrides({
            consistency: new ConsistencyRule(
                ConsistencyScope.Eval,
                fraction(0.5),
            ),
        });
        const result = solveTwoTradeToy(plan);
        const dayStart: AccountState = {
            ...plan.initialState(),
            balance: 1150,
            bestDayProfit: 150,
            elapsedDays: 1,
            intradayHighProfit: 150,
            peakDayCloseProfit: 150,
            peakIntradayProfit: 150,
            threshold: 1050,
            tradingDays: 1,
        };
        const midDay = midDayOf(dayStart, 200);
        const closedAtMidDayBalance: AccountState = {
            ...midDay,
            bestDayProfit: Math.max(midDay.bestDayProfit, midDay.todayPnL),
            tradingDays: midDay.tradingDays + 1,
        };
        expect(plan.isPassed(midDay)).toBe(true);
        expect(plan.isPassed(closedAtMidDayBalance)).toBe(false);
        expect(result.riskAtReachedState(dayStart, 0)).not.toBeNull();

        const risk = result.riskAtReachedState(midDay, MID_DAY_TRADE_INDEX);
        expect(risk).toBe(computedRisk(result, midDay, MID_DAY_TRADE_INDEX));
        expect(risk).toBeGreaterThan(0);
    });

    it('does not pass a DoubleTarget consistency violation at 2x the profit target when that is still at or below 2x the best day, and the DP agrees with Plan.isPassed (N-79)', () => {
        const plan = toyPlan(250).withOverrides({
            consistency: new ConsistencyRule(
                ConsistencyScope.Eval,
                fraction(0.5),
                ConsistencyBasis.Cycle,
                ConsistencyViolationEffect.DoubleTarget,
                ConsistencyBoundary.Inclusive,
            ),
        });
        const result = solveTwoTradeToy(plan);
        const dayStart: AccountState = {
            ...plan.initialState(),
            balance: 1150,
            bestDayProfit: 150,
            elapsedDays: 1,
            intradayHighProfit: 150,
            peakDayCloseProfit: 150,
            peakIntradayProfit: 150,
            threshold: 1050,
            tradingDays: 1,
        };
        const midDay = midDayOf(dayStart, 350);
        const closedAtTwiceTarget: AccountState = {
            ...midDay,
            bestDayProfit: Math.max(midDay.bestDayProfit, midDay.todayPnL),
            tradingDays: midDay.tradingDays + 1,
        };
        expect(closedAtTwiceTarget.bestDayProfit).toBe(350);
        expect(midDay.balance - plan.initialState().startingBalance).toBe(500);

        expect(plan.isPassed(closedAtTwiceTarget)).toBe(false);
        expect(result.riskAtReachedState(dayStart, 0)).not.toBeNull();

        const risk = result.riskAtReachedState(midDay, MID_DAY_TRADE_INDEX);
        expect(risk).toBe(computedRisk(result, midDay, MID_DAY_TRADE_INDEX));
        expect(risk).not.toBeNull();
    });

    it('widens the DoubleTarget ceiling to the whole untracked margin, not just the profit target, so a best day past the old too-narrow ceiling still resolves a valid table entry (N-79 EvalStateValue.ts ceiling)', () => {
        const plan = toyPlan(100).withOverrides({
            consistency: new ConsistencyRule(
                ConsistencyScope.Eval,
                fraction(0.5),
                ConsistencyBasis.Cycle,
                ConsistencyViolationEffect.DoubleTarget,
                ConsistencyBoundary.Inclusive,
            ),
        });
        const result = computeEvalStateValue({
            actionStepDollars: 500,
            cushionStepDollars: 100,
            maxActionDollars: 500,
            maxEvalDays: 3,
            plan,
            profitStepDollars: 100,
            rrRatio: 2,
            tradesPerDay: 2,
            winrate: fraction(0.5),
        });
        const bestDayAboveOldCeiling: AccountState = {
            ...plan.initialState(),
            balance: plan.initialState().startingBalance + 2000,
            bestDayProfit: 2000,
            elapsedDays: 1,
            intradayHighProfit: 2000,
            peakDayCloseProfit: 2000,
            peakIntradayProfit: 2000,
            threshold: plan.initialState().startingBalance + 2000 - 100,
            tradingDays: 1,
        };
        expect(plan.isPassed(bestDayAboveOldCeiling)).toBe(false);

        expect(
            result.riskAtReachedState(bestDayAboveOldCeiling, 0),
        ).not.toBeNull();
    });

    it.each([0, MID_DAY_TRADE_INDEX])(
        'returns null for a state that passed at the previous day close, at trade index %s',
        (tradeIndex) => {
            const plan = toyPlan(250);
            const result = solveTwoTradeToy(plan);
            const passedAtClose = passRegion(plan);
            expect(plan.isPassed(passedAtClose)).toBe(true);

            expect(
                result.riskAtReachedState(passedAtClose, tradeIndex),
            ).toBeNull();
        },
    );

    it('returns null for a mid-day state back under the target after a day that started passed', () => {
        const plan = toyPlan(250);
        const result = solveTwoTradeToy(plan);
        const midDay = midDayOf(passRegion(plan), -60);
        expect(plan.isPassed(midDay)).toBe(false);
        expect(plan.isBust(midDay, TradingPhase.Eval)).toBe(false);

        expect(
            result.riskAtReachedState(midDay, MID_DAY_TRADE_INDEX),
        ).toBeNull();
    });

    it('returns null for a mid-day bust on a solved day-start key', () => {
        const plan = toyPlan(250);
        const result = solveTwoTradeToy(plan);
        const busted = midDayOf(plan.initialState(), -110);
        expect(plan.isBust(busted, TradingPhase.Eval)).toBe(true);
        expect(
            result.riskAtReachedState(plan.initialState(), 0),
        ).not.toBeNull();

        expect(
            result.riskAtReachedState(busted, MID_DAY_TRADE_INDEX),
        ).toBeNull();
    });
});
