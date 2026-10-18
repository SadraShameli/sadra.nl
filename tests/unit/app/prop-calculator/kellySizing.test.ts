import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    averageTradeSize,
    KellyIndexStatus,
    kellySizing,
} from '~/app/(app)/prop-calculator/_components/kellySizing';
import { dollars, type Dollars } from '~/lib/prop-calculator';

describe('kellySizing (N-18, T22)', () => {
    it('sizes the Kelly index on the realized average risk when a ladder sizes below the configured risk', () => {
        const sizing = kellySizing(
            { riskPerTrade: 500, rrRatio: 2, winrate: 0.5 },
            { averageRiskPerTrade: 350, riskBasis: dollars(50_000) },
        );
        expect(sizing.fullKelly).toBeCloseTo(0.25, 12);
        expect(sizing.halfKelly).toBeCloseTo(0.125, 12);
        expect(sizing.currentRiskFraction).toBeCloseTo(0.007, 12);
        expect(sizing.kellyIndex).toEqual({
            status: KellyIndexStatus.Sized,
            value: expect.closeTo(0.028, 12) as number,
        });
    });

    it('ignores the configured risk entirely when realized risk is larger', () => {
        const sizing = kellySizing(
            { riskPerTrade: 250, rrRatio: 2, winrate: 0.5 },
            { averageRiskPerTrade: 500, riskBasis: dollars(50_000) },
        );
        expect(sizing.currentRiskFraction).toBeCloseTo(0.01, 12);
        expect(sizing.kellyIndex).toEqual({
            status: KellyIndexStatus.Sized,
            value: expect.closeTo(0.04, 12) as number,
        });
    });

    it('shows the Kelly index as n/a (not hidden) when no trade was taken', () => {
        const sizing = kellySizing(
            { riskPerTrade: 500, rrRatio: 2, winrate: 0.5 },
            { averageRiskPerTrade: 0, riskBasis: dollars(50_000) },
        );
        expect(sizing.currentRiskFraction).toBeNull();
        expect(sizing.kellyIndex).toEqual({
            status: KellyIndexStatus.NotApplicable,
        });
    });

    it('shows n/a ahead of no edge when no trade was taken and there is no edge', () => {
        const sizing = kellySizing(
            { riskPerTrade: 500, rrRatio: 1, winrate: 0.4 },
            { averageRiskPerTrade: 0, riskBasis: dollars(50_000) },
        );
        expect(sizing.kellyIndex).toEqual({
            status: KellyIndexStatus.NotApplicable,
        });
    });

    it('reports no edge when the full Kelly fraction is not positive', () => {
        const sizing = kellySizing(
            { riskPerTrade: 250, rrRatio: 1, winrate: 0.4 },
            { averageRiskPerTrade: 250, riskBasis: dollars(50_000) },
        );
        expect(sizing.fullKelly).toBeLessThan(0);
        expect(sizing.kellyIndex).toEqual({ status: KellyIndexStatus.NoEdge });
    });

    it('reports no edge at exactly break-even', () => {
        const sizing = kellySizing(
            { riskPerTrade: 250, rrRatio: 1, winrate: 0.5 },
            { averageRiskPerTrade: 250, riskBasis: dollars(50_000) },
        );
        expect(sizing.fullKelly).toBe(0);
        expect(sizing.kellyIndex).toEqual({ status: KellyIndexStatus.NoEdge });
    });

    it('shows the Kelly index as n/a on a zero account size', () => {
        const sizing = kellySizing(
            { riskPerTrade: 250, rrRatio: 2, winrate: 0.5 },
            { averageRiskPerTrade: 250, riskBasis: dollars(0) },
        );
        expect(sizing.currentRiskFraction).toBeNull();
        expect(sizing.kellyIndex).toEqual({
            status: KellyIndexStatus.NotApplicable,
        });
    });

    it('treats a non-positive reward ratio as no edge', () => {
        const sizing = kellySizing(
            { riskPerTrade: 250, rrRatio: 0, winrate: 0.9 },
            { averageRiskPerTrade: 250, riskBasis: dollars(50_000) },
        );
        expect(sizing.fullKelly).toBe(0);
        expect(sizing.kellyIndex).toEqual({ status: KellyIndexStatus.NoEdge });
    });
});

describe('averageTradeSize (T22)', () => {
    it('sizes the average win and loss on the realized average risk, not the configured risk', () => {
        expect(
            averageTradeSize(
                { riskPerTrade: 500, rrRatio: 2, winrate: 0.5 },
                { averageRiskPerTrade: 350 },
            ),
        ).toEqual({ loss: 350, win: 700 });
    });

    it('is n/a instead of +$0 / -$0 when no trade was taken', () => {
        expect(
            averageTradeSize(
                { riskPerTrade: 500, rrRatio: 2, winrate: 0.5 },
                { averageRiskPerTrade: 0 },
            ),
        ).toBeNull();
    });

    it('agrees with the Kelly rows on when no trade was taken', () => {
        const inputs = { riskPerTrade: 500, rrRatio: 2, winrate: 0.5 };
        const result = { averageRiskPerTrade: 0, riskBasis: dollars(50_000) };
        expect(averageTradeSize(inputs, result)).toBeNull();
        expect(kellySizing(inputs, result).kellyIndex).toEqual({
            status: KellyIndexStatus.NotApplicable,
        });
    });
});

describe('kellySizing risk basis (F-V22, PT-86b)', () => {
    it('takes the basis the risk is measured against as a Dollars riskBasis, and no account size', () => {
        type Result = Parameters<typeof kellySizing>[1];
        expectTypeOf<Result['riskBasis']>().toEqualTypeOf<Dollars>();
        expectTypeOf<Result>().not.toHaveProperty('accountSize');
        expectTypeOf<Result['averageRiskPerTrade']>().toEqualTypeOf<number>();
    });

    it('measures the average risk against the riskBasis it is given', () => {
        const inputs = { riskPerTrade: 500, rrRatio: 2, winrate: 0.5 };
        const sizing = kellySizing(inputs, {
            averageRiskPerTrade: 300,
            riskBasis: dollars(2000),
        });
        expect(sizing.currentRiskFraction).toBeCloseTo(0.15, 12);
    });
});
