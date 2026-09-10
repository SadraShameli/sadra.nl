import { describe, expect, it } from 'vitest';

import { minStopPoints } from '~/lib/prop-calculator/core/ContractLimits';
import {
    ALL_INSTRUMENTS,
    INSTRUMENTS,
    InstrumentSymbol,
} from '~/lib/prop-calculator/core/Instruments';

describe('CME contract specifications', () => {
    it('matches the published contract unit and outright tick for each product', () => {
        expect(INSTRUMENTS[InstrumentSymbol.NQ].pointValue).toBe(20);
        expect(INSTRUMENTS[InstrumentSymbol.NQ].tickSize).toBe(0.25);
        expect(INSTRUMENTS[InstrumentSymbol.NQ].tickValue).toBe(5);
        expect(INSTRUMENTS[InstrumentSymbol.NQ].isMicro).toBe(false);

        expect(INSTRUMENTS[InstrumentSymbol.ES].pointValue).toBe(50);
        expect(INSTRUMENTS[InstrumentSymbol.ES].tickSize).toBe(0.25);
        expect(INSTRUMENTS[InstrumentSymbol.ES].tickValue).toBe(12.5);
        expect(INSTRUMENTS[InstrumentSymbol.ES].isMicro).toBe(false);

        expect(INSTRUMENTS[InstrumentSymbol.MNQ].pointValue).toBe(2);
        expect(INSTRUMENTS[InstrumentSymbol.MNQ].tickSize).toBe(0.25);
        expect(INSTRUMENTS[InstrumentSymbol.MNQ].tickValue).toBe(0.5);
        expect(INSTRUMENTS[InstrumentSymbol.MNQ].isMicro).toBe(true);
    });

    it('keeps tickValue consistent with tickSize times pointValue', () => {
        for (const spec of ALL_INSTRUMENTS) {
            expect(spec.tickValue).toBeCloseTo(
                spec.tickSize * spec.pointValue,
                10,
            );
        }
    });
});

describe('minimum stop distance', () => {
    it('derives the stop a rung implies at a given contract cap', () => {
        const nq = INSTRUMENTS[InstrumentSymbol.NQ].pointValue;
        expect(minStopPoints(450, 3, nq)).toBeCloseTo(7.5, 10);
        expect(minStopPoints(800, 3, nq)).toBeCloseTo(13.33, 2);
        expect(minStopPoints(250, 3, nq)).toBeCloseTo(4.17, 2);
    });

    it('returns null for inputs that cannot produce a stop', () => {
        expect(minStopPoints(0, 3, 20)).toBeNull();
        expect(minStopPoints(450, 0, 20)).toBeNull();
        expect(minStopPoints(450, 3, 0)).toBeNull();
    });
});
