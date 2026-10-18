import { describe, expect, it } from 'vitest';

import { computeEvalStateValue } from '~/lib/prop-calculator/core';

import { toyDpConfig, toyPlan } from '../evalStateValueToy';

const plan = toyPlan(250);
const result = computeEvalStateValue(toyDpConfig(plan, 2, 100));

function startState() {
    return { ...plan.initialState(), elapsedDays: 0 };
}

describe('EvalStateValue valuesAtReachedState (PT-30a DpStateValues)', () => {
    it('reads the hand-derived day-one values: $50 and $100 both win to 0.5 and lose to 0, worth 0.25, against 0 for no trade', () => {
        const reading = result.valuesAtReachedState(startState(), 0);

        expect(reading?.value).toBeCloseTo(0.25, 10);
        expect(reading?.noTradeValue).toBeCloseTo(0, 10);
        const trades = reading?.trades ?? [];
        expect(trades.map((trade) => trade.risk)).toEqual([50, 100]);
        for (const trade of trades) {
            expect(trade.valueAfterWin).toBeCloseTo(0.5, 10);
            expect(trade.valueAfterLoss).toBeCloseTo(0, 10);
            expect(trade.value).toBeCloseTo(0.25, 10);
        }
    });

    it('equals the solved initial value at the start state', () => {
        expect(result.valuesAtReachedState(startState(), 0)?.value).toBe(
            result.initialValue,
        );
    });

    it('picks the same risk as the policy, including its tie-break to the lower action', () => {
        const state = startState();

        expect(result.valuesAtReachedState(state, 0)?.bestRisk).toBe(
            result.riskAtReachedState(state, 0),
        );
        expect(result.valuesAtReachedState(state, 0)?.bestRisk).toBe(50);
    });

    it('values a requested risk on the action grid exactly like its candidate', () => {
        const reading = result.valuesAtReachedState(startState(), 0, [100]);

        expect(reading?.requested).toEqual([
            reading?.trades.find((trade) => trade.risk === 100),
        ]);
    });

    it('caps a requested risk above the cushion to the risk the engine would place', () => {
        const reading = result.valuesAtReachedState(startState(), 0, [500]);

        expect(reading?.requested[0]?.risk).toBe(100);
    });

    it('reads nothing past the last trade of the day or for a passed account', () => {
        const passed = {
            ...startState(),
            balance: plan.accountSize + 300,
            tradingDays: 1,
        };

        expect(result.valuesAtReachedState(startState(), 2)).toBeNull();
        expect(result.valuesAtReachedState(passed, 0)).toBeNull();
    });
});
