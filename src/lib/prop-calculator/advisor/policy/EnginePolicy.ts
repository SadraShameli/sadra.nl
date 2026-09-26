import { z } from 'zod';

import {
    CENT_ROUNDING_TOLERANCE_IN_CENTS,
    CENTS_PER_DOLLAR,
    InstrumentSymbol,
} from '~/lib/prop-calculator/core';

export enum LifetimePayoutCapBasis {
    LiveTriggersNotChecked = 'live-triggers-not-checked',
    VerifiedCountTrigger = 'verified-count-trigger',
    VerifiedNoCountTrigger = 'verified-no-count-trigger',
}

export enum RebuyLagBasis {
    AssumedZero = 'assumed-zero',
    Measured = 'measured',
}

export const MAX_INTRADAY_PATH_STEPS_PER_R = 200;
export const MAX_COMMISSION_PER_ROUND_TRIP = 100;

export interface EnginePolicy {
    readonly commissionPerRoundTrip: number;
    readonly fundedHorizonDays: number;
    readonly instrument?: InstrumentSymbol;
    readonly intradayPathStepsPerR?: number;
    readonly lifetimePayoutCapBasis: LifetimePayoutCapBasis;
    readonly lifetimePayoutCapOverride: null | number;
    readonly payoutRequestOverride: null | number;
    readonly rebuyLagBasis: RebuyLagBasis;
    readonly rebuyLagDays: number;
    readonly retainedCushionRequest: null | number;
    readonly stopPoints?: number;
}

const wholeCentDollarsSchema = z
    .number()
    .nonnegative()
    .refine(isWholeCents, { message: 'must be a whole number of cents' });

export const enginePolicySchema = z
    .strictObject({
        commissionPerRoundTrip: wholeCentDollarsSchema.max(
            MAX_COMMISSION_PER_ROUND_TRIP,
            {
                message: `must be at most $${MAX_COMMISSION_PER_ROUND_TRIP} per round trip, in dollars, not cents`,
            },
        ),
        fundedHorizonDays: z.number().int().nonnegative(),
        instrument: z.enum(InstrumentSymbol).optional(),
        intradayPathStepsPerR: z
            .number()
            .int()
            .positive()
            .max(MAX_INTRADAY_PATH_STEPS_PER_R)
            .optional(),
        lifetimePayoutCapBasis: z.enum(LifetimePayoutCapBasis),
        lifetimePayoutCapOverride: z.number().int().positive().nullable(),
        payoutRequestOverride: wholeCentDollarsSchema
            .refine((amount) => amount > 0, {
                message: 'must be more than zero',
            })
            .nullable(),
        rebuyLagBasis: z.enum(RebuyLagBasis),
        rebuyLagDays: z.number().nonnegative(),
        retainedCushionRequest: wholeCentDollarsSchema.nullable(),
        stopPoints: z.number().positive().optional(),
    })
    .superRefine((policy, context) => {
        if (
            policy.stopPoints !== undefined &&
            policy.instrument === undefined
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'stopPoints needs an instrument: a stop in points has no dollar size without one',
                path: ['stopPoints'],
            });
        }
        const hasCountTrigger =
            policy.lifetimePayoutCapBasis ===
            LifetimePayoutCapBasis.VerifiedCountTrigger;
        if (hasCountTrigger !== (policy.lifetimePayoutCapOverride !== null)) {
            context.addIssue({
                code: 'custom',
                message: hasCountTrigger
                    ? 'a verified count trigger needs its lifetime payout count'
                    : 'a lifetime payout cap override needs a verified count trigger as its basis',
                path: ['lifetimePayoutCapOverride'],
            });
        }
        if (
            policy.rebuyLagBasis === RebuyLagBasis.AssumedZero &&
            policy.rebuyLagDays !== 0
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'an assumed-zero rebuy lag must be 0 days; a measured lag needs the measured basis',
                path: ['rebuyLagDays'],
            });
        }
    }) satisfies z.ZodType<EnginePolicy>;

function isWholeCents(amount: number): boolean {
    const cents = amount * CENTS_PER_DOLLAR;
    return (
        Math.abs(cents - Math.round(cents)) <= CENT_ROUNDING_TOLERANCE_IN_CENTS
    );
}
