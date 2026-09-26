import { z } from 'zod';

import { InstrumentSymbol } from '../core/Instruments';
import { oneContractRisk, resolvePositionSizing } from '../core/PositionSizing';
import { type SimInputs } from './types';

export type FundedDayPolicyConflictInputs = Pick<
    SimInputs,
    | 'fundedCushionPercent'
    | 'fundedDayPolicy'
    | 'fundedRiskPerTrade'
    | 'fundedTradesPerDay'
>;

export type SimInputsSizingInputs = Pick<
    SimInputs,
    | 'fundedCushionPercent'
    | 'fundedDayPolicy'
    | 'fundedRiskPerTrade'
    | 'instrument'
    | 'riskPerTrade'
    | 'stopPoints'
>;

const simInputsSizingSchema = z
    .object({
        fundedCushionPercent: z.number().optional(),
        fundedDayPolicy: z.unknown().optional(),
        fundedRiskPerTrade: z.number().optional(),
        instrument: z.enum(InstrumentSymbol).optional().catch(undefined),
        riskPerTrade: z.number(),
        stopPoints: z.number().optional().catch(undefined),
    })
    .superRefine((value, context) => {
        const positionSizing = resolvePositionSizing(
            value.instrument,
            value.stopPoints,
        );
        if (value.fundedCushionPercent !== undefined) {
            if (positionSizing === null) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'fundedCushionPercent needs position sizing: set stopPoints (a positive stop distance in points) and instrument, so percent-of-cushion risk is placed in whole contracts, at least one and at most the funded contract limit.',
                    path: ['stopPoints'],
                });
            }
            return;
        }
        if (positionSizing === null || value.fundedDayPolicy !== undefined) {
            return;
        }
        const field =
            value.fundedRiskPerTrade === undefined
                ? 'riskPerTrade'
                : 'fundedRiskPerTrade';
        const risk = value.fundedRiskPerTrade ?? value.riskPerTrade;
        const contractRisk = oneContractRisk(positionSizing);
        if (risk > 0 && risk < contractRisk) {
            context.addIssue({
                code: 'custom',
                message: `${field} $${risk} is below one ${positionSizing.instrument.symbol} contract's risk at a ${positionSizing.stopPoints} point stop ($${contractRisk}): funded flat risk is placed in whole contracts and rounded down, so it would never trade, and rounding it up would risk more than asked. Raise it to at least $${contractRisk}, or use a micro instrument or a tighter stop.`,
                path: [field],
            });
        }
    });

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
    if (!result.success) throwInvalidSimInputs(result.error);
}

export function assertSimInputsSized(inputs: SimInputsSizingInputs): void {
    const issue = simInputsSizingIssue(inputs);
    if (issue !== null) throw new Error(`Invalid SimInputs: ${issue}`);
}

export function simInputsSizingIssue(
    inputs: SimInputsSizingInputs,
): null | string {
    const result = simInputsSizingSchema.safeParse(inputs);
    return result.success ? null : issueText(result.error);
}

function issueText(error: z.ZodError): string {
    return error.issues.map((issue) => issue.message).join(' ');
}

function throwInvalidSimInputs(error: z.ZodError): never {
    throw new Error(`Invalid SimInputs: ${issueText(error)}`);
}
