import { z } from 'zod';

import { CENTS_PER_DOLLAR } from '~/lib/prop-calculator/core';

import {
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    type RulebookParameters,
    rulebookSchema,
} from '../Rulebook';
import { type EnginePolicy, enginePolicySchema } from './EnginePolicy';

export interface DocumentedPolicyRun {
    readonly maxAttempts?: number;
    readonly maxEvalDays: number;
    readonly seed: number;
    readonly trials: number;
}

export interface DocumentedPolicySpec {
    readonly enginePolicy: EnginePolicy;
    readonly planSerial?: string;
    readonly rulebook: RulebookParameters;
    readonly run: DocumentedPolicyRun;
}

const runSchema = z.strictObject({
    maxAttempts: z.number().int().positive().optional(),
    maxEvalDays: z.number().int().positive(),
    seed: z.number().int(),
    trials: z.number().int().positive(),
}) satisfies z.ZodType<DocumentedPolicyRun>;

export const documentedPolicySpecSchema = z
    .strictObject({
        enginePolicy: enginePolicySchema,
        planSerial: z.string().min(1).optional(),
        rulebook: rulebookSchema,
        run: runSchema,
    })
    .superRefine((spec, context) => {
        const request = spec.enginePolicy.retainedCushionRequest;
        if (
            request === null ||
            spec.rulebook.payout.allowBelowHardRule2 ||
            request * CENTS_PER_DOLLAR >= HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS
        ) {
            return;
        }
        context.addIssue({
            code: 'custom',
            message: `a retained cushion request below $${HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS / CENTS_PER_DOLLAR} breaks Hard Rule 2; set the rulebook allowBelowHardRule2 to keep it`,
            path: ['enginePolicy', 'retainedCushionRequest'],
        });
    }) satisfies z.ZodType<DocumentedPolicySpec>;
