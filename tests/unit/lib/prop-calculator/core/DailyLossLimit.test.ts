import { describe, expect, it } from 'vitest';

import {
    type DllTier,
    resolveDailyLossLimit,
} from '~/lib/prop-calculator/core/DailyLossLimit';

// Tables verified against the plan's A1 section ("Funded DLL tiers"), one
// entry per Apex account size. Kept literal here (rather than imported from
// ApexTraderFunding.ts) so a firm-data typo can't accidentally pass this
// pure-function test too.
const FUNDED_TIERS_25K: readonly DllTier[] = [
    { dailyLossLimit: 500, maxContracts: 4, minProfit: 0 },
    { dailyLossLimit: 500, maxContracts: 4, minProfit: 1000 },
    { dailyLossLimit: 1250, maxContracts: 4, minProfit: 2000 },
];

const FUNDED_TIERS_50K: readonly DllTier[] = [
    { dailyLossLimit: 1000, maxContracts: 6, minProfit: 0 },
    { dailyLossLimit: 1000, maxContracts: 6, minProfit: 1500 },
    { dailyLossLimit: 2000, maxContracts: 6, minProfit: 3000 },
    { dailyLossLimit: 3000, maxContracts: 6, minProfit: 6000 },
];

const FUNDED_TIERS_100K: readonly DllTier[] = [
    { dailyLossLimit: 1750, maxContracts: 8, minProfit: 0 },
    { dailyLossLimit: 1750, maxContracts: 8, minProfit: 2000 },
    { dailyLossLimit: 1750, maxContracts: 8, minProfit: 3000 },
    { dailyLossLimit: 2500, maxContracts: 8, minProfit: 5000 },
    { dailyLossLimit: 3500, maxContracts: 8, minProfit: 10_000 },
];

const FUNDED_TIERS_150K: readonly DllTier[] = [
    { dailyLossLimit: 2500, maxContracts: 12, minProfit: 0 },
    { dailyLossLimit: 2500, maxContracts: 12, minProfit: 2000 },
    { dailyLossLimit: 2500, maxContracts: 12, minProfit: 3000 },
    { dailyLossLimit: 3000, maxContracts: 12, minProfit: 5000 },
    { dailyLossLimit: 4000, maxContracts: 12, minProfit: 10_000 },
];

describe('resolveDailyLossLimit', () => {
    describe('kind: flat', () => {
        it('returns the flat amount regardless of profit-in-cycle', () => {
            const config = { amount: 500, kind: 'flat' } as const;
            expect(resolveDailyLossLimit(config, -10_000)).toBe(500);
            expect(resolveDailyLossLimit(config, 0)).toBe(500);
            expect(resolveDailyLossLimit(config, 10_000)).toBe(500);
        });
    });

    describe('kind: none', () => {
        it('always returns null', () => {
            const config = { kind: 'none' } as const;
            expect(resolveDailyLossLimit(config, -10_000)).toBeNull();
            expect(resolveDailyLossLimit(config, 0)).toBeNull();
            expect(resolveDailyLossLimit(config, 10_000)).toBeNull();
        });
    });

    describe('kind: tiered — no tiers', () => {
        it('returns null when the tier list is empty', () => {
            expect(
                resolveDailyLossLimit({ kind: 'tiered', tiers: [] }, 5000),
            ).toBeNull();
        });
    });

    describe('kind: tiered — 25K funded DLL table', () => {
        const config = { kind: 'tiered', tiers: FUNDED_TIERS_25K } as const;

        it('floors at the lowest tier for profit below every threshold', () => {
            expect(resolveDailyLossLimit(config, -50_000)).toBe(500);
            expect(resolveDailyLossLimit(config, 0)).toBe(500);
        });

        it('stays at $500 through the $1,000 tier', () => {
            expect(resolveDailyLossLimit(config, 999)).toBe(500);
            expect(resolveDailyLossLimit(config, 1000)).toBe(500);
        });

        it('boundary: $1,999 vs $2,000 profit ($500 -> $1,250)', () => {
            expect(resolveDailyLossLimit(config, 1999)).toBe(500);
            expect(resolveDailyLossLimit(config, 2000)).toBe(1250);
        });

        it('stays at the top tier far beyond the last threshold', () => {
            expect(resolveDailyLossLimit(config, 1_000_000)).toBe(1250);
        });
    });

    describe('kind: tiered — 50K funded DLL table', () => {
        const config = { kind: 'tiered', tiers: FUNDED_TIERS_50K } as const;

        it('stays at $1,000 across the first two (equal) tiers', () => {
            expect(resolveDailyLossLimit(config, 0)).toBe(1000);
            expect(resolveDailyLossLimit(config, 1500)).toBe(1000);
            expect(resolveDailyLossLimit(config, 2999)).toBe(1000);
        });

        it('boundary: $2,999 vs $3,000 profit ($1,000 -> $2,000)', () => {
            expect(resolveDailyLossLimit(config, 2999)).toBe(1000);
            expect(resolveDailyLossLimit(config, 3000)).toBe(2000);
        });

        it('boundary: $5,999 vs $6,000 profit ($2,000 -> $3,000)', () => {
            expect(resolveDailyLossLimit(config, 5999)).toBe(2000);
            expect(resolveDailyLossLimit(config, 6000)).toBe(3000);
        });
    });

    describe('kind: tiered — 100K funded DLL table', () => {
        const config = { kind: 'tiered', tiers: FUNDED_TIERS_100K } as const;

        it('stays at $1,750 across the first three (equal) tiers', () => {
            expect(resolveDailyLossLimit(config, 0)).toBe(1750);
            expect(resolveDailyLossLimit(config, 2000)).toBe(1750);
            expect(resolveDailyLossLimit(config, 4999)).toBe(1750);
        });

        it('boundary: $4,999 vs $5,000 profit ($1,750 -> $2,500)', () => {
            expect(resolveDailyLossLimit(config, 4999)).toBe(1750);
            expect(resolveDailyLossLimit(config, 5000)).toBe(2500);
        });

        it('boundary: $9,999 vs $10,000 profit ($2,500 -> $3,500)', () => {
            expect(resolveDailyLossLimit(config, 9999)).toBe(2500);
            expect(resolveDailyLossLimit(config, 10_000)).toBe(3500);
        });
    });

    describe('kind: tiered — 150K funded DLL table', () => {
        const config = { kind: 'tiered', tiers: FUNDED_TIERS_150K } as const;

        it('stays at $2,500 across the first three (equal) tiers', () => {
            expect(resolveDailyLossLimit(config, 0)).toBe(2500);
            expect(resolveDailyLossLimit(config, 2000)).toBe(2500);
            expect(resolveDailyLossLimit(config, 4999)).toBe(2500);
        });

        it('boundary: $4,999 vs $5,000 profit ($2,500 -> $3,000)', () => {
            expect(resolveDailyLossLimit(config, 4999)).toBe(2500);
            expect(resolveDailyLossLimit(config, 5000)).toBe(3000);
        });

        it('boundary: $9,999 vs $10,000 profit ($3,000 -> $4,000)', () => {
            expect(resolveDailyLossLimit(config, 9999)).toBe(3000);
            expect(resolveDailyLossLimit(config, 10_000)).toBe(4000);
        });
    });
});
