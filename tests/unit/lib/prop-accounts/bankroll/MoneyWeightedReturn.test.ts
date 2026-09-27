import { describe, expect, it } from 'vitest';

import { moneyWeightedReturn } from '~/lib/prop-accounts/bankroll';

describe('moneyWeightedReturn', () => {
    it('matches the closed form for a single deposit and terminal value', () => {
        const days = 100;
        const invested = 200_000;
        const terminal = 220_000;
        const expected = (terminal / invested) ** (365 / days) - 1;
        const rate = moneyWeightedReturn([
            { amountCents: -invested, on: '2026-01-01' },
            { amountCents: terminal, on: '2026-04-11' },
        ]);
        expect(rate).not.toBeNull();
        expect(rate ?? 0).toBeCloseTo(expected, 6);
    });

    it('is negative when the terminal value is below what was deposited', () => {
        const rate = moneyWeightedReturn([
            { amountCents: -200_000, on: '2026-01-01' },
            { amountCents: 150_000, on: '2026-06-01' },
        ]);
        expect(rate).not.toBeNull();
        expect(rate ?? 0).toBeLessThan(0);
    });

    it('treats a withdrawal as an inflow alongside the terminal value', () => {
        const days = 200;
        const netInvestedOnDayZero = 500_000 - 300_000;
        const terminal = 300_000;
        const expected = (terminal / netInvestedOnDayZero) ** (365 / days) - 1;
        const rate = moneyWeightedReturn([
            { amountCents: -500_000, on: '2026-01-01' },
            { amountCents: 300_000, on: '2026-01-01' },
            { amountCents: terminal, on: '2026-07-20' },
        ]);
        expect(rate).not.toBeNull();
        expect(rate ?? 0).toBeCloseTo(expected, 4);
    });

    it('is null with fewer than two dated cashflows', () => {
        expect(moneyWeightedReturn([])).toBeNull();
        expect(
            moneyWeightedReturn([{ amountCents: -1000, on: '2026-01-01' }]),
        ).toBeNull();
    });

    it('is null when every cashflow has the same sign', () => {
        const rate = moneyWeightedReturn([
            { amountCents: -1000, on: '2026-01-01' },
            { amountCents: -2000, on: '2026-02-01' },
        ]);
        expect(rate).toBeNull();
    });

    it('ignores zero-amount cashflows', () => {
        const rate = moneyWeightedReturn([
            { amountCents: -200_000, on: '2026-01-01' },
            { amountCents: 0, on: '2026-02-01' },
            { amountCents: 220_000, on: '2026-04-11' },
        ]);
        expect(rate).not.toBeNull();
    });
});
