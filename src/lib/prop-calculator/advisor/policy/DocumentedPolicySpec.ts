import { z } from 'zod';

import {
    type AccountState,
    accountStateSchema,
    CENTS_PER_DOLLAR,
    fundedCycleSeedSchema,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { type SimStart } from '~/lib/prop-calculator/simulator';

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
    readonly start?: SimStart;
}

const runSchema = z.strictObject({
    maxAttempts: z.number().int().positive().optional(),
    maxEvalDays: z.number().int().positive(),
    seed: z.number().int(),
    trials: z.number().int().positive(),
}) satisfies z.ZodType<DocumentedPolicyRun>;

function isAccountStateShaped(value: unknown): value is AccountState {
    return accountStateSchema.safeParse(value).success;
}

const simStartSchema = z.custom<SimStart>((value) => {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as {
        phase?: unknown;
        seed?: unknown;
        state?: unknown;
    };
    return (
        isAccountStateShaped(candidate.state) &&
        (candidate.phase === TradingPhase.Eval ||
            (candidate.phase === TradingPhase.Funded &&
                fundedCycleSeedSchema.safeParse(candidate.seed).success))
    );
}, 'start must be a valid eval or funded SimStart') satisfies z.ZodType<SimStart>;

export const documentedPolicySpecSchema = z
    .strictObject({
        enginePolicy: enginePolicySchema,
        planSerial: z.string().min(1).optional(),
        rulebook: rulebookSchema,
        run: runSchema,
        start: simStartSchema.optional(),
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
