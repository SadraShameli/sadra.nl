import { describe, expect, it } from 'vitest';

import { INSTRUMENTS, InstrumentSymbol } from '~/lib/prop-calculator/core';
import { buildLucidLivePlan } from '~/lib/prop-calculator/firms/lucid/LucidLive';

describe('buildLucidLivePlan contract limits', () => {
    it.each([
        { balance: 0, micros: 20, minis: 2 },
        { balance: 2000, micros: 30, minis: 3 },
        { balance: 4000, micros: 40, minis: 4 },
    ])(
        'allows $minis minis / $micros micros at a $balance balance (50K CME row of New Live Scaling Plan)',
        ({ balance, micros, minis }) => {
            const plan = buildLucidLivePlan();
            const state = { ...plan.initialState(), balance };

            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
            ).toBe(minis);
            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
            ).toBe(micros);
        },
    );
});
