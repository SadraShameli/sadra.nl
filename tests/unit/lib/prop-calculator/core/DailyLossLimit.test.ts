import { describe, expect, it } from 'vitest';

import {
    type DailyLossLimitConfig,
    type DailyLossLimitContext,
    DailyLossLimitKind,
    DailyLossLimitShape,
    dailyLossLimitTierBreakpoints,
    describeDailyLossLimit,
    type DllTier,
    hasPeakShareDependency,
    resolveDailyLossLimit,
    scaleDailyLossLimit,
} from '~/lib/prop-calculator/core/DailyLossLimit';
import {
    contracts,
    dollars,
    fraction,
} from '~/lib/prop-calculator/core/lib/units';
import { TierBasis } from '~/lib/prop-calculator/core/TierBasis';
import { APEX_LIVE_DAILY_LOSS_LIMIT } from '~/lib/prop-calculator/firms';

function atProfit(profit: number): DailyLossLimitContext {
    return {
        isThresholdLocked: false,
        peakDayCloseProfit: 0,
        peakIntradayProfit: null,
        profit,
        sessionOpenProfit: profit,
    };
}

const LEVEL_TIERS: readonly DllTier[] = [
    { dailyLossLimit: dollars(1000), maxContracts: contracts(6), minProfit: 0 },
    {
        dailyLossLimit: dollars(2000),
        maxContracts: contracts(6),
        minProfit: 3000,
    },
];

function levelsOn(tierBasis?: TierBasis): DailyLossLimitConfig {
    return tierBasis === undefined
        ? { kind: DailyLossLimitKind.Tiered, tiers: LEVEL_TIERS }
        : { kind: DailyLossLimitKind.Tiered, tierBasis, tiers: LEVEL_TIERS };
}

const FUNDED_TIERS_25K: readonly DllTier[] = [
    { dailyLossLimit: dollars(500), maxContracts: contracts(4), minProfit: 0 },
    {
        dailyLossLimit: dollars(500),
        maxContracts: contracts(4),
        minProfit: 1000,
    },
    {
        dailyLossLimit: dollars(1250),
        maxContracts: contracts(4),
        minProfit: 2000,
    },
];

const FUNDED_TIERS_50K: readonly DllTier[] = [
    { dailyLossLimit: dollars(1000), maxContracts: contracts(6), minProfit: 0 },
    {
        dailyLossLimit: dollars(1000),
        maxContracts: contracts(6),
        minProfit: 1500,
    },
    {
        dailyLossLimit: dollars(2000),
        maxContracts: contracts(6),
        minProfit: 3000,
    },
    {
        dailyLossLimit: dollars(3000),
        maxContracts: contracts(6),
        minProfit: 6000,
    },
];

const FUNDED_TIERS_100K: readonly DllTier[] = [
    { dailyLossLimit: dollars(1750), maxContracts: contracts(8), minProfit: 0 },
    {
        dailyLossLimit: dollars(1750),
        maxContracts: contracts(8),
        minProfit: 2000,
    },
    {
        dailyLossLimit: dollars(1750),
        maxContracts: contracts(8),
        minProfit: 3000,
    },
    {
        dailyLossLimit: dollars(2500),
        maxContracts: contracts(8),
        minProfit: 5000,
    },
    {
        dailyLossLimit: dollars(3500),
        maxContracts: contracts(8),
        minProfit: 10_000,
    },
];

const FUNDED_TIERS_150K: readonly DllTier[] = [
    {
        dailyLossLimit: dollars(2500),
        maxContracts: contracts(12),
        minProfit: 0,
    },
    {
        dailyLossLimit: dollars(2500),
        maxContracts: contracts(12),
        minProfit: 2000,
    },
    {
        dailyLossLimit: dollars(2500),
        maxContracts: contracts(12),
        minProfit: 3000,
    },
    {
        dailyLossLimit: dollars(3000),
        maxContracts: contracts(12),
        minProfit: 5000,
    },
    {
        dailyLossLimit: dollars(4000),
        maxContracts: contracts(12),
        minProfit: 10_000,
    },
];

describe('resolveDailyLossLimit', () => {
    describe('kind: flat', () => {
        it('returns the flat amount regardless of profit-in-cycle', () => {
            const config = {
                amount: dollars(500),
                kind: DailyLossLimitKind.Flat,
            } as const;
            expect(resolveDailyLossLimit(config, atProfit(-10_000))).toBe(500);
            expect(resolveDailyLossLimit(config, atProfit(0))).toBe(500);
            expect(resolveDailyLossLimit(config, atProfit(10_000))).toBe(500);
        });
    });

    describe('kind: none', () => {
        it('always returns null', () => {
            const config = { kind: DailyLossLimitKind.None } as const;
            expect(resolveDailyLossLimit(config, atProfit(-10_000))).toBeNull();
            expect(resolveDailyLossLimit(config, atProfit(0))).toBeNull();
            expect(resolveDailyLossLimit(config, atProfit(10_000))).toBeNull();
        });
    });

    describe('kind: tiered, no tiers', () => {
        it('throws instead of silently behaving like no daily loss limit', () => {
            expect(() =>
                resolveDailyLossLimit(
                    { kind: DailyLossLimitKind.Tiered, tiers: [] },
                    atProfit(5000),
                ),
            ).toThrow('tiers must not be empty');
        });
    });

    describe('kind: tiered, 25K funded DLL table', () => {
        const config = {
            kind: DailyLossLimitKind.Tiered,
            tiers: FUNDED_TIERS_25K,
        } as const;

        it('floors at the lowest tier for profit below every threshold', () => {
            expect(resolveDailyLossLimit(config, atProfit(-50_000))).toBe(500);
            expect(resolveDailyLossLimit(config, atProfit(0))).toBe(500);
        });

        it('stays at $500 through the $1,000 tier', () => {
            expect(resolveDailyLossLimit(config, atProfit(999))).toBe(500);
            expect(resolveDailyLossLimit(config, atProfit(1000))).toBe(500);
        });

        it('boundary: $1,999 vs $2,000 profit ($500 -> $1,250)', () => {
            expect(resolveDailyLossLimit(config, atProfit(1999))).toBe(500);
            expect(resolveDailyLossLimit(config, atProfit(2000))).toBe(1250);
        });

        it('stays at the top tier far beyond the last threshold', () => {
            expect(resolveDailyLossLimit(config, atProfit(1_000_000))).toBe(
                1250,
            );
        });
    });

    describe('kind: tiered, 50K funded DLL table', () => {
        const config = {
            kind: DailyLossLimitKind.Tiered,
            tiers: FUNDED_TIERS_50K,
        } as const;

        it('stays at $1,000 across the first two (equal) tiers', () => {
            expect(resolveDailyLossLimit(config, atProfit(0))).toBe(1000);
            expect(resolveDailyLossLimit(config, atProfit(1500))).toBe(1000);
            expect(resolveDailyLossLimit(config, atProfit(2999))).toBe(1000);
        });

        it('boundary: $2,999 vs $3,000 profit ($1,000 -> $2,000)', () => {
            expect(resolveDailyLossLimit(config, atProfit(2999))).toBe(1000);
            expect(resolveDailyLossLimit(config, atProfit(3000))).toBe(2000);
        });

        it('boundary: $5,999 vs $6,000 profit ($2,000 -> $3,000)', () => {
            expect(resolveDailyLossLimit(config, atProfit(5999))).toBe(2000);
            expect(resolveDailyLossLimit(config, atProfit(6000))).toBe(3000);
        });
    });

    describe('kind: tiered, 100K funded DLL table', () => {
        const config = {
            kind: DailyLossLimitKind.Tiered,
            tiers: FUNDED_TIERS_100K,
        } as const;

        it('stays at $1,750 across the first three (equal) tiers', () => {
            expect(resolveDailyLossLimit(config, atProfit(0))).toBe(1750);
            expect(resolveDailyLossLimit(config, atProfit(2000))).toBe(1750);
            expect(resolveDailyLossLimit(config, atProfit(4999))).toBe(1750);
        });

        it('boundary: $4,999 vs $5,000 profit ($1,750 -> $2,500)', () => {
            expect(resolveDailyLossLimit(config, atProfit(4999))).toBe(1750);
            expect(resolveDailyLossLimit(config, atProfit(5000))).toBe(2500);
        });

        it('boundary: $9,999 vs $10,000 profit ($2,500 -> $3,500)', () => {
            expect(resolveDailyLossLimit(config, atProfit(9999))).toBe(2500);
            expect(resolveDailyLossLimit(config, atProfit(10_000))).toBe(3500);
        });
    });

    describe('kind: tiered, 150K funded DLL table', () => {
        const config = {
            kind: DailyLossLimitKind.Tiered,
            tiers: FUNDED_TIERS_150K,
        } as const;

        it('stays at $2,500 across the first three (equal) tiers', () => {
            expect(resolveDailyLossLimit(config, atProfit(0))).toBe(2500);
            expect(resolveDailyLossLimit(config, atProfit(2000))).toBe(2500);
            expect(resolveDailyLossLimit(config, atProfit(4999))).toBe(2500);
        });

        it('boundary: $4,999 vs $5,000 profit ($2,500 -> $3,000)', () => {
            expect(resolveDailyLossLimit(config, atProfit(4999))).toBe(2500);
            expect(resolveDailyLossLimit(config, atProfit(5000))).toBe(3000);
        });

        it('boundary: $9,999 vs $10,000 profit ($3,000 -> $4,000)', () => {
            expect(resolveDailyLossLimit(config, atProfit(9999))).toBe(3000);
            expect(resolveDailyLossLimit(config, atProfit(10_000))).toBe(4000);
        });
    });
});

describe('unsorted tiered configs', () => {
    it('picks the highest applicable tier regardless of array order', () => {
        const ascending: DailyLossLimitConfig = {
            kind: DailyLossLimitKind.Tiered,
            tiers: [
                {
                    dailyLossLimit: dollars(1000),
                    maxContracts: contracts(6),
                    minProfit: 0,
                },
                {
                    dailyLossLimit: dollars(2000),
                    maxContracts: contracts(6),
                    minProfit: 3000,
                },
                {
                    dailyLossLimit: dollars(3000),
                    maxContracts: contracts(6),
                    minProfit: 6000,
                },
            ],
        };
        const shuffled: DailyLossLimitConfig = {
            kind: DailyLossLimitKind.Tiered,
            tiers: [
                {
                    dailyLossLimit: dollars(3000),
                    maxContracts: contracts(6),
                    minProfit: 6000,
                },
                {
                    dailyLossLimit: dollars(1000),
                    maxContracts: contracts(6),
                    minProfit: 0,
                },
                {
                    dailyLossLimit: dollars(2000),
                    maxContracts: contracts(6),
                    minProfit: 3000,
                },
            ],
        };
        for (const profit of [-500, 0, 2999, 3000, 5999, 6000, 99_999]) {
            expect(resolveDailyLossLimit(shuffled, atProfit(profit))).toBe(
                resolveDailyLossLimit(ascending, atProfit(profit)),
            );
        }
        expect(resolveDailyLossLimit(shuffled, atProfit(4000))).toBe(2000);
        expect(resolveDailyLossLimit(shuffled, atProfit(10_000))).toBe(3000);
    });

    it('falls back to the lowest-threshold tier when no tier qualifies', () => {
        const config: DailyLossLimitConfig = {
            kind: DailyLossLimitKind.Tiered,
            tiers: [
                {
                    dailyLossLimit: dollars(2000),
                    maxContracts: contracts(6),
                    minProfit: 5000,
                },
                {
                    dailyLossLimit: dollars(1000),
                    maxContracts: contracts(6),
                    minProfit: 1000,
                },
            ],
        };
        expect(resolveDailyLossLimit(config, atProfit(-1))).toBe(1000);
    });
});

describe('tiered daily loss limit basis', () => {
    it('SessionOpenProfit keeps the level the session opened on through an intraday loss', () => {
        expect(
            resolveDailyLossLimit(levelsOn(TierBasis.SessionOpenProfit), {
                isThresholdLocked: true,
                peakDayCloseProfit: 5000,
                peakIntradayProfit: null,
                profit: 0,
                sessionOpenProfit: 3100,
            }),
        ).toBe(2000);
    });

    it('SessionOpenProfit ignores both an intraday gain and the peak', () => {
        expect(
            resolveDailyLossLimit(levelsOn(TierBasis.SessionOpenProfit), {
                isThresholdLocked: true,
                peakDayCloseProfit: 5000,
                peakIntradayProfit: null,
                profit: 5000,
                sessionOpenProfit: 100,
            }),
        ).toBe(1000);
    });

    it('PeakSessionCloseProfit keeps the level the best session close reached', () => {
        expect(
            resolveDailyLossLimit(levelsOn(TierBasis.PeakSessionCloseProfit), {
                isThresholdLocked: true,
                peakDayCloseProfit: 3100,
                peakIntradayProfit: null,
                profit: 0,
                sessionOpenProfit: 100,
            }),
        ).toBe(2000);
    });

    it('an unset basis resolves on live profit', () => {
        expect(
            resolveDailyLossLimit(levelsOn(), {
                isThresholdLocked: true,
                peakDayCloseProfit: 0,
                peakIntradayProfit: null,
                profit: 3050,
                sessionOpenProfit: 2900,
            }),
        ).toBe(2000);
    });

    it('scaleDailyLossLimit preserves the basis', () => {
        const scaled = scaleDailyLossLimit(
            levelsOn(TierBasis.SessionOpenProfit),
            fraction(0.5),
        );
        expect(
            scaled.kind === DailyLossLimitKind.Tiered && scaled.tierBasis,
        ).toBe(TierBasis.SessionOpenProfit);
        expect(
            resolveDailyLossLimit(scaled, {
                isThresholdLocked: true,
                peakDayCloseProfit: 0,
                peakIntradayProfit: null,
                profit: 0,
                sessionOpenProfit: 3100,
            }),
        ).toBe(1000);
    });
});

describe('dailyLossLimitTierBreakpoints', () => {
    it('returns the sorted tier thresholds only for the basis the tiers use', () => {
        const config = levelsOn(TierBasis.SessionOpenProfit);
        expect(
            dailyLossLimitTierBreakpoints(config, TierBasis.SessionOpenProfit),
        ).toStrictEqual([0, 3000]);
        expect(
            dailyLossLimitTierBreakpoints(
                config,
                TierBasis.PeakSessionCloseProfit,
            ),
        ).toStrictEqual([]);
        expect(
            dailyLossLimitTierBreakpoints(levelsOn(), TierBasis.LiveProfit),
        ).toStrictEqual([0, 3000]);
    });

    it('returns no thresholds for flat, none and peak-share limits', () => {
        for (const config of [
            { amount: dollars(500), kind: DailyLossLimitKind.Flat },
            { kind: DailyLossLimitKind.None },
            {
                kind: DailyLossLimitKind.PeakProfitShare,
                share: fraction(0.6),
            },
        ] as const) {
            expect(
                dailyLossLimitTierBreakpoints(config, TierBasis.LiveProfit),
            ).toStrictEqual([]);
        }
    });

    it('combines both stages of a threshold-lock limit', () => {
        const config: DailyLossLimitConfig = {
            afterLock: {
                kind: DailyLossLimitKind.Tiered,
                tierBasis: TierBasis.PeakSessionCloseProfit,
                tiers: [
                    {
                        dailyLossLimit: dollars(3000),
                        maxContracts: contracts(6),
                        minProfit: 6000,
                    },
                    ...LEVEL_TIERS,
                ],
            },
            beforeLock: levelsOn(TierBasis.PeakSessionCloseProfit),
            kind: DailyLossLimitKind.AfterThresholdLock,
        };
        expect(
            dailyLossLimitTierBreakpoints(
                config,
                TierBasis.PeakSessionCloseProfit,
            ),
        ).toStrictEqual([0, 3000, 6000]);
    });
});

function isContinuouslyPeakDependent(config: DailyLossLimitConfig): boolean {
    return hasPeakShareDependency(describeDailyLossLimit(config));
}

describe('hasPeakShareDependency flags exactly the continuously peak-dependent limit', () => {
    it('flags PeakProfitShare on its own and inside a staged limit', () => {
        const peakShare: DailyLossLimitConfig = {
            kind: DailyLossLimitKind.PeakProfitShare,
            share: fraction(0.6),
        };
        expect(isContinuouslyPeakDependent(peakShare)).toBe(true);
        expect(
            isContinuouslyPeakDependent({
                afterLock: peakShare,
                beforeLock: {
                    amount: dollars(1200),
                    kind: DailyLossLimitKind.Flat,
                },
                kind: DailyLossLimitKind.AfterThresholdLock,
            }),
        ).toBe(true);
    });

    it('does not flag a peak-session-close tiered limit, which is piecewise constant in the peak', () => {
        expect(
            isContinuouslyPeakDependent({
                kind: DailyLossLimitKind.Tiered,
                tierBasis: TierBasis.PeakSessionCloseProfit,
                tiers: LEVEL_TIERS,
            }),
        ).toBe(false);
    });

    it('does not flag a flat or absent limit', () => {
        expect(
            isContinuouslyPeakDependent({
                amount: dollars(1000),
                kind: DailyLossLimitKind.Flat,
            }),
        ).toBe(false);
        expect(
            isContinuouslyPeakDependent({ kind: DailyLossLimitKind.None }),
        ).toBe(false);
    });
});

describe('a tier with no daily loss limit (null)', () => {
    const OPEN_THEN_CAPPED: readonly DllTier[] = [
        { dailyLossLimit: null, maxContracts: contracts(10), minProfit: 0 },
        {
            dailyLossLimit: dollars(5000),
            maxContracts: contracts(25),
            minProfit: 10_000,
        },
        {
            dailyLossLimit: dollars(10_000),
            maxContracts: contracts(30),
            minProfit: 25_000,
        },
    ];
    const config: DailyLossLimitConfig = {
        kind: DailyLossLimitKind.Tiered,
        tiers: OPEN_THEN_CAPPED,
    };

    it('resolves to null, the engine-wide "no limit", on the unlimited tier', () => {
        expect(resolveDailyLossLimit(config, atProfit(0))).toBeNull();
        expect(resolveDailyLossLimit(config, atProfit(9999))).toBeNull();
        expect(resolveDailyLossLimit(config, atProfit(10_000))).toBe(5000);
    });

    it('describes the limited tiers as a range with an unlimited tier, its own shape so every describer must render it (WP22b)', () => {
        expect(describeDailyLossLimit(config)).toStrictEqual({
            kind: DailyLossLimitShape.RangeWithUnlimitedTier,
            max: dollars(10_000),
            min: dollars(5000),
        });
        expect(hasPeakShareDependency(describeDailyLossLimit(config))).toBe(
            false,
        );
    });

    it('describes the real Apex Live Levels (Level 1 has no DLL) as a range with an unlimited tier', () => {
        expect(
            describeDailyLossLimit(APEX_LIVE_DAILY_LOSS_LIMIT),
        ).toStrictEqual({
            kind: DailyLossLimitShape.RangeWithUnlimitedTier,
            max: dollars(10_000),
            min: dollars(5000),
        });
    });

    it('describes a tiered limit whose every tier is unlimited as no limit', () => {
        expect(
            describeDailyLossLimit({
                kind: DailyLossLimitKind.Tiered,
                tiers: [
                    {
                        dailyLossLimit: null,
                        maxContracts: contracts(1),
                        minProfit: 0,
                    },
                ],
            }),
        ).toStrictEqual({ kind: DailyLossLimitShape.None });
    });

    it('keeps the unlimited tier unlimited when scaled', () => {
        const scaled = scaleDailyLossLimit(config, fraction(0.5));
        expect(scaled).toStrictEqual({
            kind: DailyLossLimitKind.Tiered,
            tiers: [
                {
                    dailyLossLimit: null,
                    maxContracts: contracts(10),
                    minProfit: 0,
                },
                {
                    dailyLossLimit: dollars(2500),
                    maxContracts: contracts(25),
                    minProfit: 10_000,
                },
                {
                    dailyLossLimit: dollars(5000),
                    maxContracts: contracts(30),
                    minProfit: 25_000,
                },
            ],
        });
        expect(resolveDailyLossLimit(scaled, atProfit(0))).toBeNull();
    });
});
