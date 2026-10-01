import { z } from 'zod';

import { type DayPolicy, policySizingOf } from '~/lib/prop-calculator/core/DayPolicy';
import { InstrumentSymbol } from '~/lib/prop-calculator/core/Instruments';
import {
    formatOneContractRisk,
    formatWholeCentDollars,
} from '~/lib/prop-calculator/core/PlacedFundedRisk';
import {
    isBelowOneContract,
    type PositionSizingConfig,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core/PositionSizing';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';

import { type SimInputs } from './types';

export enum PercentSizingScope {
    Funded = 'funded',
    Live = 'live',
}

export type DeclaredSizingInputs = Pick<SimInputs, 'instrument' | 'stopPoints'>;

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

export const SIM_INPUTS_REFUSAL_PREFIX = 'Invalid SimInputs: ';

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
                    message: positionSizingRequiredIssue(
                        PercentSizingScope.Funded,
                    ),
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
        if (!isBelowOneContract(risk, positionSizing)) return;
        const contractRisk = formatOneContractRisk(positionSizing);
        context.addIssue({
            code: 'custom',
            message: `${field} ${formatWholeCentDollars(risk)} is below one ${positionSizing.instrument.symbol} contract's risk at a ${positionSizing.stopPoints} point stop (${contractRisk}): funded flat risk is placed in whole contracts and rounded down, so it would never trade, and rounding it up would risk more than asked. Raise it to at least ${contractRisk}, or use a micro instrument or a tighter stop.`,
            path: [field],
        });
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

export function assertDeclaredSizingMatchesPhase(
    inputs: DeclaredSizingInputs,
    declared: DayPolicy,
    phase: TradingPhase,
): void {
    const sizing = policySizingOf(phase);
    if (
        declared.sizing === sizing ||
        resolvePositionSizing(inputs.instrument, inputs.stopPoints) === null
    ) {
        return;
    }
    throw new Error(
        `${SIM_INPUTS_REFUSAL_PREFIX}${declaredPolicyField(phase)}.sizing is ${declared.sizing}, but ${phaseArticle(phase)} ${phase} policy with position sizing (instrument and stopPoints) is placed as ${sizing}. Declare sizing ${sizing}, so simulate and the portfolio timeline place it the same way.`,
    );
}

export function assertNoFundedDayPolicyConflict(
    inputs: FundedDayPolicyConflictInputs,
): void {
    const result = fundedDayPolicyConflictSchema.safeParse(inputs);
    if (!result.success) throwInvalidSimInputs(result.error);
}

export function assertSimInputsSized(inputs: SimInputsSizingInputs): void {
    const issue = simInputsSizingIssue(inputs);
    if (issue !== null) throw new Error(`${SIM_INPUTS_REFUSAL_PREFIX}${issue}`);
}

export function requirePositionSizing(
    scope: PercentSizingScope,
    inputs: DeclaredSizingInputs,
): PositionSizingConfig {
    const positionSizing = resolvePositionSizing(
        inputs.instrument,
        inputs.stopPoints,
    );
    if (positionSizing === null) {
        throw new Error(
            `${SIM_INPUTS_REFUSAL_PREFIX}${positionSizingRequiredIssue(scope)}`,
        );
    }
    return positionSizing;
}

export function simInputsSizingIssue(
    inputs: SimInputsSizingInputs,
): null | string {
    const result = simInputsSizingSchema.safeParse(inputs);
    return result.success ? null : issueText(result.error);
}

function declaredPolicyField(phase: TradingPhase): string {
    switch (phase) {
        case TradingPhase.Eval: {
            return 'evalDayPolicy';
        }
        case TradingPhase.Funded: {
            return 'fundedDayPolicy';
        }
    }
}

function issueText(error: z.ZodError): string {
    return error.issues.map((issue) => issue.message).join(' ');
}

function percentSizingField(scope: PercentSizingScope): string {
    switch (scope) {
        case PercentSizingScope.Funded: {
            return 'fundedCushionPercent';
        }
        case PercentSizingScope.Live: {
            return 'live cushionPercent';
        }
    }
}

function phaseArticle(phase: TradingPhase): string {
    switch (phase) {
        case TradingPhase.Eval: {
            return 'an';
        }
        case TradingPhase.Funded: {
            return 'a';
        }
    }
}

function positionSizingRequiredIssue(scope: PercentSizingScope): string {
    return `${percentSizingField(scope)} needs position sizing: set stopPoints (a positive stop distance in points) and instrument, so percent-of-cushion risk is placed in whole contracts, at least one and at most the ${scope} contract limit.`;
}

function throwInvalidSimInputs(error: z.ZodError): never {
    throw new Error(`${SIM_INPUTS_REFUSAL_PREFIX}${issueText(error)}`);
}
