import { z } from 'zod';

import { type SimInputs } from './types';

export type FundedDayPolicyConflictInputs = Pick<
    SimInputs,
    | 'fundedCushionPercent'
    | 'fundedDayPolicy'
    | 'fundedRiskPerTrade'
    | 'fundedTradesPerDay'
>;

const fundedDayPolicyConflictSchema = z
    .object({
        fundedCushionPercent: z.number().optional(),
        fundedDayPolicy: z.unknown().optional(),
        fundedRiskPerTrade: z.number().optional(),
        fundedTradesPerDay: z.number().optional(),
    })
    .superRefine((value, context) => {
        const hasLadder = value.fundedDayPolicy !== undefined;
        const hasCushion = value.fundedCushionPercent !== undefined;
        if (hasLadder && hasCushion) {
            context.addIssue({
                code: 'custom',
                message:
                    'fundedDayPolicy and fundedCushionPercent cannot both be set: resolveDayPolicy returns fundedDayPolicy before fundedCushionPercent is ever read, so fundedCushionPercent would be silently ignored.',
                path: ['fundedCushionPercent'],
            });
        }
        if (hasLadder && value.fundedRiskPerTrade !== undefined) {
            context.addIssue({
                code: 'custom',
                message:
                    'fundedDayPolicy and fundedRiskPerTrade cannot both be set: fundedRiskPerTrade is never read once fundedDayPolicy is set.',
                path: ['fundedRiskPerTrade'],
            });
        }
        if (hasLadder && value.fundedTradesPerDay !== undefined) {
            context.addIssue({
                code: 'custom',
                message:
                    'fundedDayPolicy and fundedTradesPerDay cannot both be set: fundedTradesPerDay is never read once fundedDayPolicy is set.',
                path: ['fundedTradesPerDay'],
            });
        }
        if (
            !hasLadder &&
            hasCushion &&
            value.fundedRiskPerTrade !== undefined
        ) {
            context.addIssue({
                code: 'custom',
                message:
                    'fundedCushionPercent and fundedRiskPerTrade cannot both be set: fundedCushionPercent always wins inside resolveDayPolicy, so fundedRiskPerTrade is silently ignored.',
                path: ['fundedRiskPerTrade'],
            });
        }
    });

export function assertNoFundedDayPolicyConflict(
    inputs: FundedDayPolicyConflictInputs,
): void {
    const result = fundedDayPolicyConflictSchema.safeParse(inputs);
    if (!result.success) {
        throw new Error(
            `Invalid SimInputs: ${result.error.issues.map((issue) => issue.message).join(' ')}`,
        );
    }
}
