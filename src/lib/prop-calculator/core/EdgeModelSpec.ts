import { z } from 'zod';

import { DriftEdge } from './DriftEdge';
import { type EdgeModel } from './EdgeModel';
import { FixedWinRateEdge } from './FixedWinRateEdge';
import { fraction, type Fraction0to1, fractionSchema } from './lib/units';

export enum EdgeModelKind {
    Drift = 'drift',
    Fixed = 'fixed',
}

export interface DriftEdgeModelSpec {
    readonly anchorRrRatio: number;
    readonly anchorWinrate: Fraction0to1;
    readonly kind: EdgeModelKind.Drift;
}

export type EdgeModelSpec = DriftEdgeModelSpec | FixedEdgeModelSpec;

export interface FixedEdgeModelSpec {
    readonly kind: EdgeModelKind.Fixed;
    readonly winrate: Fraction0to1;
}

export const edgeModelSpecSchema: z.ZodType<EdgeModelSpec> =
    z.discriminatedUnion('kind', [
        z.strictObject({
            anchorRrRatio: z.number().positive(),
            anchorWinrate: fractionSchema,
            kind: z.literal(EdgeModelKind.Drift),
        }),
        z.strictObject({
            kind: z.literal(EdgeModelKind.Fixed),
            winrate: fractionSchema,
        }),
    ]);

export function edgeModelFromSpec(spec: EdgeModelSpec): EdgeModel {
    switch (spec.kind) {
        case EdgeModelKind.Drift: {
            return DriftEdge.fittedTo(spec.anchorWinrate, spec.anchorRrRatio);
        }
        case EdgeModelKind.Fixed: {
            return new FixedWinRateEdge(fraction(spec.winrate));
        }
    }
}
