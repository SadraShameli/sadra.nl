import { describe, expect, it } from 'vitest';

import {
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    resolveDailyLossLimit,
} from '~/lib/prop-calculator/core';
import { dollars, fraction } from '~/lib/prop-calculator/core/units';

function context(profit: number, isThresholdLocked = false) {
    return { isThresholdLocked, peakDayCloseProfit: profit, profit };
}

describe('the daily-loss-limit resolver cache does not leak across configs', () => {
    it('resolves two structurally identical but distinct configs independently', () => {
        const a: DailyLossLimitConfig = {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        };
        const b: DailyLossLimitConfig = {
            amount: dollars(2000),
            kind: DailyLossLimitKind.Flat,
        };

        expect(resolveDailyLossLimit(a, context(0))).toBe(1000);
        expect(resolveDailyLossLimit(b, context(0))).toBe(2000);
        expect(resolveDailyLossLimit(a, context(0))).toBe(1000);
    });

    it('resolves the same config object consistently across many calls', () => {
        const config: DailyLossLimitConfig = {
            kind: DailyLossLimitKind.PeakProfitShare,
            share: fraction(0.6),
        };

        for (const peak of [0, 1000, 2000, 500, 4000]) {
            expect(resolveDailyLossLimit(config, context(peak))).toBeCloseTo(
                peak * 0.6,
                9,
            );
        }
    });

    it('caches both branches of a staged config independently', () => {
        const config: DailyLossLimitConfig = {
            afterLock: {
                kind: DailyLossLimitKind.PeakProfitShare,
                share: fraction(0.6),
            },
            beforeLock: {
                amount: dollars(1200),
                kind: DailyLossLimitKind.Flat,
            },
            kind: DailyLossLimitKind.AfterThresholdLock,
        };

        expect(resolveDailyLossLimit(config, context(4000, false))).toBe(1200);
        expect(resolveDailyLossLimit(config, context(4000, true))).toBe(2400);
        expect(resolveDailyLossLimit(config, context(4000, false))).toBe(1200);
        expect(resolveDailyLossLimit(config, context(4000, true))).toBe(2400);
    });

    it('does not mutate a shared config object across resolutions', () => {
        const config: DailyLossLimitConfig = {
            amount: dollars(500),
            kind: DailyLossLimitKind.Flat,
        };
        const before = JSON.stringify(config);

        for (let index = 0; index < 50; index++)
            resolveDailyLossLimit(config, context(index));

        expect(JSON.stringify(config)).toBe(before);
    });
});
