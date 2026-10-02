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
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { fraction } from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

const HAZARD_PARAMETER = 'lth';

function decoded(parameters: URLSearchParams) {
    return decodeState(parameters, ALL_FIRMS, defaultCalculatorState());
}

function setHazard(value: number) {
    return calculatorReducer(defaultCalculatorState(), {
        type: CalculatorActionType.SetLiveTransferHazard,
        value,
    });
}

describe('web calculator input for the live-transfer hazard (PT-73, F-V26)', () => {
    it('starts at 0, so nothing changes until the user sets one', () => {
        expect(defaultCalculatorState().liveTransferHazard).toBe(0);
    });

    it('sets the hazard through the reducer and clamps it to a probability', () => {
        expect(setHazard(0.25).liveTransferHazard).toBe(0.25);
        expect(setHazard(2).liveTransferHazard).toBe(
            CALCULATOR_SCALAR_BOUNDS.lth.max,
        );
        expect(setHazard(-1).liveTransferHazard).toBe(
            CALCULATOR_SCALAR_BOUNDS.lth.min,
        );
    });

    it('keeps the previous hazard for a value that is not a number', () => {
        const state = setHazard(0.25);
        const next = calculatorReducer(state, {
            type: CalculatorActionType.SetLiveTransferHazard,
            value: NaN,
        });
        expect(next.liveTransferHazard).toBe(0.25);
    });

    it('leaves the share link untouched at 0 and writes it only once set', () => {
        expect(
            encodeState(defaultCalculatorState()).has(HAZARD_PARAMETER),
        ).toBe(false);
        expect(encodeState(setHazard(0.25)).get(HAZARD_PARAMETER)).toBe('0.25');
    });

    it.each([0.0004, 0.00005, 0.1234, 0.9999])(
        'keeps a hazard of %s exactly through the share link, with no rounding to three decimals',
        (hazard) => {
            const encoded = encodeState(setHazard(hazard));
            expect(encoded.get(HAZARD_PARAMETER)).toBe(String(hazard));
            expect(decoded(encoded).liveTransferHazard).toBe(hazard);
        },
    );

    it('round-trips through the share link and reads a link without it as 0', () => {
        const encoded = encodeState(setHazard(0.25));
        expect(decoded(encoded).liveTransferHazard).toBe(0.25);
        encoded.delete(HAZARD_PARAMETER);
        expect(decoded(encoded).liveTransferHazard).toBe(0);
    });

    it.each(['-0.5', '1.5', 'abc'])(
        'reads an unusable link value %s as 0',
        (raw) => {
            const parameters = encodeState(defaultCalculatorState());
            parameters.set(HAZARD_PARAMETER, raw);
            expect(decoded(parameters).liveTransferHazard).toBe(0);
        },
    );

    it('keeps the hazard out of the shared simulation inputs that results, sizing, compare and the other tools run on', () => {
        const unpriced = buildSimInputs(defaultCalculatorState());
        const priced = buildSimInputs(setHazard(0.25));
        expect(unpriced.liveTransferHazard).toBeUndefined();
        expect(priced.liveTransferHazard).toBeUndefined();
        expect(simInputsCacheKey(priced)).toBe(simInputsCacheKey(unpriced));
    });

    it('still tells the simulation cache a hazard changes the money', () => {
        const base = buildSimInputs(defaultCalculatorState());
        expect(
            simInputsCacheKey({ ...base, liveTransferHazard: fraction(0.25) }),
        ).not.toBe(simInputsCacheKey(base));
    });
});
