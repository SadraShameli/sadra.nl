import { z } from 'zod';

import { AssumptionKind } from './AssumptionKind';
import { SizingAssumption } from './DocumentedSizing';

export enum AssumptionBias {
    Conservative = 'conservative',
    Neutral = 'neutral',
    Optimistic = 'optimistic',
}

export type Assumption = InputAssumption | SizingRuleAssumption;

export interface InputAssumption {
    readonly bias: AssumptionBias;
    readonly kind: InputAssumptionKind;
}

export type InputAssumptionKind = Exclude<
    AssumptionKind,
    AssumptionKind.SizingRule
>;

export interface SizingRuleAssumption {
    readonly bias: AssumptionBias;
    readonly kind: AssumptionKind.SizingRule;
    readonly sizingAssumption: SizingAssumption;
}

const inputAssumptionKindSchema = z
    .enum(AssumptionKind)
    .exclude(['SizingRule']);

export const assumptionSchema = z.union([
    z.strictObject({
        bias: z.enum(AssumptionBias),
        kind: inputAssumptionKindSchema,
    }),
    z.strictObject({
        bias: z.enum(AssumptionBias),
        kind: z.literal(AssumptionKind.SizingRule),
        sizingAssumption: z.enum(SizingAssumption),
    }),
]) satisfies z.ZodType<Assumption>;

export function inputAssumption(
    kind: InputAssumptionKind,
    bias: AssumptionBias,
): InputAssumption {
    if (!inputAssumptionKindSchema.safeParse(kind).success) {
        throw new Error(
            'A SizingRule assumption wraps a SizingAssumption; build it with sizingRuleAssumption',
        );
    }
    return { bias, kind };
}

export function sizingRuleAssumption(
    sizingAssumption: SizingAssumption,
    bias: AssumptionBias,
): SizingRuleAssumption {
    return { bias, kind: AssumptionKind.SizingRule, sizingAssumption };
}
