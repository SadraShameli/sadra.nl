import { describe, expect, it } from 'vitest';

import { simInputsRawSchema } from '~/lib/prop-calculator/inputs-schema';

const base = {
    riskPerTrade: 0.005,
    rrRatio: 2,
    tradesPerDay: 3,
    winrate: 0.55,
};

describe('simInputsRawSchema', () => {
    it('accepts a typical payload and fills defaults', () => {
        const r = simInputsRawSchema.safeParse(base);
        expect(r.success).toBe(true);
        expect(r.data?.fundedHorizonDays).toBe(60);
        expect(r.data?.maxEvalDays).toBe(60);
        expect(r.data?.seed).toBe(1);
        expect(r.data?.trials).toBe(500);
    });

    it('rejects winrate outside [0,1]', () => {
        expect(
            simInputsRawSchema.safeParse({ ...base, winrate: -0.1 }).success,
        ).toBe(false);
        expect(
            simInputsRawSchema.safeParse({ ...base, winrate: 1.1 }).success,
        ).toBe(false);
    });

    it('rejects RR ratio below 0.1 or above 20', () => {
        expect(
            simInputsRawSchema.safeParse({ ...base, rrRatio: 0 }).success,
        ).toBe(false);
        expect(
            simInputsRawSchema.safeParse({ ...base, rrRatio: 25 }).success,
        ).toBe(false);
    });

    it('rejects risk-per-trade of 0 or above 20%', () => {
        expect(
            simInputsRawSchema.safeParse({ ...base, riskPerTrade: 0 }).success,
        ).toBe(false);
        expect(
            simInputsRawSchema.safeParse({ ...base, riskPerTrade: 0.25 })
                .success,
        ).toBe(false);
    });

    it('rejects trades/day below 1 or above 50', () => {
        expect(
            simInputsRawSchema.safeParse({ ...base, tradesPerDay: 0 }).success,
        ).toBe(false);
        expect(
            simInputsRawSchema.safeParse({ ...base, tradesPerDay: 51 }).success,
        ).toBe(false);
    });

    it('rejects non-integer trades/day', () => {
        expect(
            simInputsRawSchema.safeParse({ ...base, tradesPerDay: 2.5 })
                .success,
        ).toBe(false);
    });

    it('caps trials at 10_000 and requires at least 50', () => {
        expect(
            simInputsRawSchema.safeParse({ ...base, trials: 10 }).success,
        ).toBe(false);
        expect(
            simInputsRawSchema.safeParse({ ...base, trials: 20_000 }).success,
        ).toBe(false);
    });

    it('accepts optional commissionPerRoundTrip', () => {
        expect(
            simInputsRawSchema.safeParse({
                ...base,
                commissionPerRoundTrip: 4.5,
            }).success,
        ).toBe(true);
    });

    it('rejects negative commission', () => {
        expect(
            simInputsRawSchema.safeParse({
                ...base,
                commissionPerRoundTrip: -1,
            }).success,
        ).toBe(false);
    });

    it('caps fundedHorizonDays / maxEvalDays at 1 year', () => {
        expect(
            simInputsRawSchema.safeParse({
                ...base,
                fundedHorizonDays: 400,
            }).success,
        ).toBe(false);
        expect(
            simInputsRawSchema.safeParse({ ...base, maxEvalDays: 400 }).success,
        ).toBe(false);
    });
});
