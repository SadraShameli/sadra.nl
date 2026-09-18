import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    DailyLossLimitShape,
    describeDailyLossLimit,
    FirmId,
    LucidVariant,
    resolveDailyLossLimit,
    scaleDailyLossLimit,
} from '~/lib/prop-calculator/core';
import {
    contracts,
    dollars,
    fraction,
} from '~/lib/prop-calculator/core/lib/units';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';

const HALF = fraction(0.5);

const FLAT: DailyLossLimitConfig = {
    amount: dollars(1200),
    kind: DailyLossLimitKind.Flat,
};

const NONE: DailyLossLimitConfig = { kind: DailyLossLimitKind.None };

const PEAK_SHARE: DailyLossLimitConfig = {
    kind: DailyLossLimitKind.PeakProfitShare,
    share: fraction(0.6),
};

const STAGED: DailyLossLimitConfig = {
    afterLock: PEAK_SHARE,
    beforeLock: FLAT,
    kind: DailyLossLimitKind.AfterThresholdLock,
};

const VARYING_TIERS: DailyLossLimitConfig = {
    kind: DailyLossLimitKind.Tiered,
    tiers: [
        {
            dailyLossLimit: dollars(1000),
            maxContracts: contracts(6),
            minProfit: 0,
        },
        {
            dailyLossLimit: dollars(3000),
            maxContracts: contracts(6),
            minProfit: 6000,
        },
    ],
};

const EQUAL_TIERS: DailyLossLimitConfig = {
    kind: DailyLossLimitKind.Tiered,
    tiers: [
        {
            dailyLossLimit: dollars(1000),
            maxContracts: contracts(6),
            minProfit: 0,
        },
        {
            dailyLossLimit: dollars(1000),
            maxContracts: contracts(6),
            minProfit: 5000,
        },
    ],
};

function context(options: {
    locked?: boolean;
    peak?: number;
    profit?: number;
}) {
    return {
        isThresholdLocked: options.locked ?? false,
        peakDayCloseProfit: options.peak ?? 0,
        profit: options.profit ?? 0,
    };
}

describe('describeDailyLossLimit', () => {
    it('reports a flat limit as a fixed amount', () => {
        expect(describeDailyLossLimit(FLAT)).toStrictEqual({
            amount: 1200,
            kind: DailyLossLimitShape.Fixed,
        });
    });

    it('reports an absent limit as none', () => {
        expect(describeDailyLossLimit(NONE)).toStrictEqual({
            kind: DailyLossLimitShape.None,
        });
    });

    it('reports a peak-share limit with its share, not a dollar figure', () => {
        expect(describeDailyLossLimit(PEAK_SHARE)).toStrictEqual({
            kind: DailyLossLimitShape.ShareOfPeak,
            share: 0.6,
        });
    });

    it('reports a varying tier table as a range from floor to ceiling', () => {
        expect(describeDailyLossLimit(VARYING_TIERS)).toStrictEqual({
            kind: DailyLossLimitShape.Range,
            max: 3000,
            min: 1000,
        });
    });

    it('collapses an all-equal tier table to a degenerate range', () => {
        expect(describeDailyLossLimit(EQUAL_TIERS)).toStrictEqual({
            kind: DailyLossLimitShape.Range,
            max: 1000,
            min: 1000,
        });
    });

    it('throws for an empty tier table instead of silently describing it as none', () => {
        expect(() =>
            describeDailyLossLimit({
                kind: DailyLossLimitKind.Tiered,
                tiers: [],
            }),
        ).toThrow('tiers must not be empty');
    });

    it('nests both regimes of a staged limit', () => {
        expect(describeDailyLossLimit(STAGED)).toStrictEqual({
            after: { kind: DailyLossLimitShape.ShareOfPeak, share: 0.6 },
            before: { amount: 1200, kind: DailyLossLimitShape.Fixed },
            kind: DailyLossLimitShape.Staged,
        });
    });

    it('describes the real Lucid Pro funded limit as staged', () => {
        const plan = new LucidTrading().findPlan({
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Pro,
        });
        if (!plan) throw new Error('LucidPro 50K plan not found');

        expect(describeDailyLossLimit(plan.fundedDailyLossLimit)).toStrictEqual(
            {
                after: { kind: DailyLossLimitShape.ShareOfPeak, share: 0.6 },
                before: { amount: 1200, kind: DailyLossLimitShape.Fixed },
                kind: DailyLossLimitShape.Staged,
            },
        );
    });

    it('describes the real Apex funded tier table as a range', () => {
        const plan = new ApexTraderFunding().findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!plan) throw new Error('Apex EOD 50K plan not found');

        const descriptor = describeDailyLossLimit(plan.fundedDailyLossLimit);
        expect(descriptor.kind).toBe(DailyLossLimitShape.Range);
    });
});

describe('scaleDailyLossLimit', () => {
    it('scales a flat amount', () => {
        expect(scaleDailyLossLimit(FLAT, HALF)).toStrictEqual({
            amount: 600,
            kind: DailyLossLimitKind.Flat,
        });
    });

    it('leaves an absent limit untouched', () => {
        expect(scaleDailyLossLimit(NONE, HALF)).toStrictEqual(NONE);
    });

    it('scales the share of a peak-share limit, not a dollar figure', () => {
        expect(scaleDailyLossLimit(PEAK_SHARE, HALF)).toStrictEqual({
            kind: DailyLossLimitKind.PeakProfitShare,
            share: 0.3,
        });
    });

    it('scales every tier while preserving thresholds and contract caps', () => {
        const scaled = scaleDailyLossLimit(VARYING_TIERS, HALF);
        if (scaled.kind !== DailyLossLimitKind.Tiered) {
            throw new Error('expected a tiered config');
        }
        expect(scaled.tiers).toStrictEqual([
            { dailyLossLimit: 500, maxContracts: 6, minProfit: 0 },
            { dailyLossLimit: 1500, maxContracts: 6, minProfit: 6000 },
        ]);
    });

    it('recurses into both regimes of a staged limit', () => {
        expect(scaleDailyLossLimit(STAGED, HALF)).toStrictEqual({
            afterLock: {
                kind: DailyLossLimitKind.PeakProfitShare,
                share: 0.3,
            },
            beforeLock: { amount: 600, kind: DailyLossLimitKind.Flat },
            kind: DailyLossLimitKind.AfterThresholdLock,
        });
    });

    it('is an identity transform at a factor of one', () => {
        for (const config of [FLAT, NONE, PEAK_SHARE, STAGED, VARYING_TIERS]) {
            expect(scaleDailyLossLimit(config, fraction(1))).toStrictEqual(
                config,
            );
        }
    });

    it('halves the resolved limit in both regimes of a staged limit', () => {
        const scaled = scaleDailyLossLimit(STAGED, HALF);
        const preLock = context({ locked: false, peak: 4000 });
        const postLock = context({ locked: true, peak: 4000 });

        expect(resolveDailyLossLimit(STAGED, preLock)).toBe(1200);
        expect(resolveDailyLossLimit(scaled, preLock)).toBe(600);
        expect(resolveDailyLossLimit(STAGED, postLock)).toBe(2400);
        expect(resolveDailyLossLimit(scaled, postLock)).toBe(1200);
    });

    it('halves the real Lucid Pro limit the stress-test panel feeds it', () => {
        const plan = new LucidTrading().findPlan({
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Pro,
        });
        if (!plan) throw new Error('LucidPro 50K plan not found');

        const scaled = scaleDailyLossLimit(plan.fundedDailyLossLimit, HALF);
        expect(
            resolveDailyLossLimit(
                scaled,
                context({ locked: true, peak: 4000 }),
            ),
        ).toBe(1200);
        expect(
            resolveDailyLossLimit(
                scaled,
                context({ locked: false, peak: 4000 }),
            ),
        ).toBe(600);
    });
});
