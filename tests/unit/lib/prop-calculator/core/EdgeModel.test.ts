import { describe, expect, it } from 'vitest';

import {
    DriftEdge,
    DriftEdgeFitError,
    EdgeModel,
    edgeModelFromSpec,
    EdgeModelKind,
    type EdgeModelSpec,
    edgeModelSpecSchema,
    FixedWinRateEdge,
    fraction,
} from '~/lib/prop-calculator/core';

describe('FixedWinRateEdge', () => {
    it('returns its fixed rate for every rr', () => {
        const edge = new FixedWinRateEdge(fraction(0.4));
        expect(edge.winProbability(1)).toBeCloseTo(0.4, 10);
        expect(edge.winProbability(2)).toBeCloseTo(0.4, 10);
        expect(edge.winProbability(5)).toBeCloseTo(0.4, 10);
    });

    it('is an EdgeModel', () => {
        expect(new FixedWinRateEdge(fraction(0.4))).toBeInstanceOf(EdgeModel);
    });
});

describe('DriftEdge', () => {
    it('at mu = 0 gives the zero-drift rate 1 / (1 + rr)', () => {
        const zeroDrift = DriftEdge.withMu(0);
        expect(zeroDrift.winProbability(1)).toBeCloseTo(0.5, 10);
        expect(zeroDrift.winProbability(2)).toBeCloseTo(1 / 3, 10);
    });

    it('is an EdgeModel', () => {
        expect(DriftEdge.withMu(0)).toBeInstanceOf(EdgeModel);
    });

    it('fittedTo(0.40, 2) fits mu 0.097475 and derives 0.5486 at 1:1 and 0.3271 at 1:3', () => {
        const edge = DriftEdge.fittedTo(0.4, 2);
        expect(edge.mu).toBeCloseTo(0.097475, 5);
        expect(edge.winProbability(2)).toBeCloseTo(0.4, 6);
        expect(edge.winProbability(1)).toBeCloseTo(0.5486, 4);
        expect(edge.winProbability(3)).toBeCloseTo(0.3271, 4);
    });

    it('fitting a rate at or below 1 / (1 + rr) gives mu <= 0, not a thrown error', () => {
        const floor = 1 / (1 + 2);
        expect(() => DriftEdge.fittedTo(floor, 2)).not.toThrow();
        expect(DriftEdge.fittedTo(floor, 2).mu).toBeLessThanOrEqual(1e-6);
        expect(DriftEdge.fittedTo(0.2, 2).mu).toBeLessThan(0);
    });

    it('rejects a rate outside (0, 1) with a typed error', () => {
        expect(() => DriftEdge.fittedTo(0, 2)).toThrow(DriftEdgeFitError);
        expect(() => DriftEdge.fittedTo(1, 2)).toThrow(DriftEdgeFitError);
        expect(() => DriftEdge.fittedTo(-0.1, 2)).toThrow(DriftEdgeFitError);
        expect(() => DriftEdge.fittedTo(1.1, 2)).toThrow(DriftEdgeFitError);
    });

    it('rejects a non-positive anchor rr with a typed error', () => {
        expect(() => DriftEdge.fittedTo(0.4, 0)).toThrow(DriftEdgeFitError);
        expect(() => DriftEdge.fittedTo(0.4, -1)).toThrow(DriftEdgeFitError);
    });

    it.each([
        [0.5, 1],
        [1 / 3, 2],
        [0.25, 3],
        [0.2, 4],
        [0.4, 1.5],
    ])(
        'round-trips winProbability(anchorRr) back to the fitted rate near the 1/(1+rr) baseline for winrate=%s, rr=%s',
        (winrate, anchorRrRatio) => {
            const edge = DriftEdge.fittedTo(winrate, anchorRrRatio);
            expect(edge.winProbability(anchorRrRatio)).toBeCloseTo(winrate, 6);
        },
    );

    it('does not accumulate catastrophic-cancellation error when evaluated far from a near-baseline anchor rr', () => {
        const anchorRrRatio = 0.15;
        const baselineWinrate = 1 / (1 + anchorRrRatio);
        const edge = DriftEdge.fittedTo(baselineWinrate, anchorRrRatio);
        expect(edge.winProbability(10)).toBeCloseTo(1 / 11, 6);
        expect(edge.winProbability(3)).toBeCloseTo(0.25, 6);
    });

    it('throws instead of silently pinning mu at the search boundary for an unfittable combination', () => {
        expect(() => DriftEdge.fittedTo(0.001, 0.001)).toThrow(DriftEdgeFitError);
    });
});

describe('edgeModelFromSpec', () => {
    it('builds a FixedWinRateEdge from a fixed spec', () => {
        const spec: EdgeModelSpec = {
            kind: EdgeModelKind.Fixed,
            winrate: fraction(0.4),
        };
        const edge = edgeModelFromSpec(spec);
        expect(edge).toBeInstanceOf(FixedWinRateEdge);
        expect(edge.winProbability(3)).toBeCloseTo(0.4, 10);
    });

    it('builds a DriftEdge fitted to the anchor point from a drift spec', () => {
        const spec: EdgeModelSpec = {
            anchorRrRatio: 2,
            anchorWinrate: fraction(0.4),
            kind: EdgeModelKind.Drift,
        };
        const edge = edgeModelFromSpec(spec);
        expect(edge).toBeInstanceOf(DriftEdge);
        expect(edge.winProbability(1)).toBeCloseTo(0.5486, 4);
    });
});

describe('edgeModelSpecSchema (serializable, crosses the worker boundary)', () => {
    it('parses a fixed spec', () => {
        const parsed = edgeModelSpecSchema.parse({
            kind: EdgeModelKind.Fixed,
            winrate: 0.4,
        });
        expect(parsed).toStrictEqual({ kind: EdgeModelKind.Fixed, winrate: 0.4 });
    });

    it('parses a drift spec', () => {
        const parsed = edgeModelSpecSchema.parse({
            anchorRrRatio: 2,
            anchorWinrate: 0.4,
            kind: EdgeModelKind.Drift,
        });
        expect(parsed).toStrictEqual({
            anchorRrRatio: 2,
            anchorWinrate: 0.4,
            kind: EdgeModelKind.Drift,
        });
    });

    it('rejects an unknown field (strict object)', () => {
        expect(() =>
            edgeModelSpecSchema.parse({
                kind: EdgeModelKind.Fixed,
                unexpected: true,
                winrate: 0.4,
            }),
        ).toThrow();
    });

    it('round-trips through JSON, as a value crossing a worker postMessage boundary must', () => {
        const spec: EdgeModelSpec = {
            anchorRrRatio: 2,
            anchorWinrate: fraction(0.4),
            kind: EdgeModelKind.Drift,
        };
        const roundTripped = edgeModelSpecSchema.parse(structuredClone(spec));
        expect(roundTripped).toStrictEqual(spec);
    });
});
