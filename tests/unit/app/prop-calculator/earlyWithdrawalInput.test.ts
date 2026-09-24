import { describe, expect, it } from 'vitest';

import {
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { simInputsCacheKey } from '~/app/(app)/prop-calculator/_components/simInputsCacheKey';
import {
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import {
    FirmId,
    MffuVariant,
    type Plan,
    withOneTimeEarlyWithdrawalTaken,
} from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function mffPlan(variant: MffuVariant): Plan {
    const plan = mffu().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!plan) throw new Error(`MFF ${variant} 50K plan not found`);
    return plan;
}

function mffu() {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === FirmId.Mffu);
    if (!firm) throw new Error('MFF firm not registered');
    return firm;
}

function proState() {
    return {
        ...defaultCalculatorState(),
        firm: mffu(),
        plan: mffPlan(MffuVariant.Pro),
    };
}

describe('web calculator input for the MFF Pro one-time early withdrawal (N-64, T30 opt-in)', () => {
    it('starts off and toggles through the reducer', () => {
        const state = proState();
        expect(state.takesOneTimeEarlyWithdrawal).toBe(false);

        const next = calculatorReducer(state, {
            isTaken: true,
            type: CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
        });

        expect(next.takesOneTimeEarlyWithdrawal).toBe(true);
        expect(next.plan).toBe(state.plan);
    });

    it('round-trips through the share URL and defaults to off when absent', () => {
        const state = { ...proState(), takesOneTimeEarlyWithdrawal: true };
        const encoded = encodeState(state);

        expect(encoded.get('ew')).toBe('1');
        expect(
            decodeState(encoded, ALL_FIRMS, defaultCalculatorState())
                .takesOneTimeEarlyWithdrawal,
        ).toBe(true);

        encoded.delete('ew');
        expect(
            decodeState(encoded, ALL_FIRMS, defaultCalculatorState())
                .takesOneTimeEarlyWithdrawal,
        ).toBe(false);
    });

    it('maps the toggle onto the plan only where the plan offers the rule', () => {
        const pro = mffPlan(MffuVariant.Pro);
        const rapid = mffPlan(MffuVariant.Rapid);

        expect(
            withOneTimeEarlyWithdrawalTaken(pro, true)
                .takesOneTimeEarlyWithdrawal,
        ).toBe(true);
        expect(withOneTimeEarlyWithdrawalTaken(pro, false)).toBe(pro);
        expect(withOneTimeEarlyWithdrawalTaken(rapid, true)).toBe(rapid);
    });

    it('keys cached simulations on the opt-in, so toggling it never reuses a stale result', () => {
        const pro = mffPlan(MffuVariant.Pro);
        const base = {
            fundedHorizonDays: 60,
            maxEvalDays: 60,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 10,
            winrate: 0.5,
        };

        expect(simInputsCacheKey({ ...base, plan: pro })).not.toBe(
            simInputsCacheKey({
                ...base,
                plan: withOneTimeEarlyWithdrawalTaken(pro, true),
            }),
        );
    });
});
