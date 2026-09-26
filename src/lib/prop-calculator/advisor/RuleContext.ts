import { z } from 'zod';

import {
    type ContractCount,
    contractCountSchema,
    type Dollars,
    dollarsSchema,
    type Fraction0to1,
    InstrumentSymbol,
    isAtOrBelowWithinCentTolerance,
} from '../core';
import { type CappedAmount, SizingConstraint } from './DocumentedSizing';
import { liveFractionSchema } from './Rulebook';
import { SizingStage } from './SizingStage';

export interface DayProgress {
    readonly dayPnL: Dollars;
    readonly losses: number;
    readonly runningLoss: Dollars;
    readonly wins: number;
}

export interface EvalRuleContext extends SharedRuleContext {
    readonly consistencyDailyCap: Dollars | null;
    readonly remainingProfitToTarget: Dollars;
    readonly stage: SizingStage.Eval;
}

export interface FundedRuleContext extends SharedRuleContext {
    readonly stage: SizingStage.Funded;
}

export interface LiveRuleContext extends SharedRuleContext {
    readonly liveCushionPercent: Fraction0to1 | null;
    readonly stage: SizingStage.Live;
    readonly thresholdLocked: boolean;
}

export type RuleContext = EvalRuleContext | FundedRuleContext | LiveRuleContext;

interface SharedRuleContext {
    readonly contractLimit: ContractCount | null;
    readonly cushion: Dollars;
    readonly dayStartDllRoom: Dollars | null;
    readonly instrument: InstrumentSymbol | null;
    readonly personalDll: Dollars | null;
}

const nonNegativeDollarsSchema = dollarsSchema.refine((amount) => amount >= 0, {
    message: 'must be zero or more',
});

const positiveDollarsSchema = dollarsSchema.refine((amount) => amount > 0, {
    message: 'must be more than zero',
});

const sharedRuleContextShape = {
    contractLimit: contractCountSchema.nullable(),
    cushion: dollarsSchema,
    dayStartDllRoom: dollarsSchema.nullable(),
    instrument: z.enum(InstrumentSymbol).nullable(),
    personalDll: positiveDollarsSchema.nullable(),
};

export const evalRuleContextSchema = z.strictObject({
    ...sharedRuleContextShape,
    consistencyDailyCap: nonNegativeDollarsSchema.nullable(),
    remainingProfitToTarget: dollarsSchema,
    stage: z.literal(SizingStage.Eval),
}) satisfies z.ZodType<EvalRuleContext>;

export const fundedRuleContextSchema = z.strictObject({
    ...sharedRuleContextShape,
    stage: z.literal(SizingStage.Funded),
}) satisfies z.ZodType<FundedRuleContext>;

export const liveRuleContextSchema = z.strictObject({
    ...sharedRuleContextShape,
    liveCushionPercent: liveFractionSchema.nullable(),
    stage: z.literal(SizingStage.Live),
    thresholdLocked: z.boolean(),
}) satisfies z.ZodType<LiveRuleContext>;

export const ruleContextSchema = z.discriminatedUnion('stage', [
    evalRuleContextSchema,
    fundedRuleContextSchema,
    liveRuleContextSchema,
]) satisfies z.ZodType<RuleContext>;

export const dayProgressSchema = z
    .strictObject({
        dayPnL: dollarsSchema,
        losses: z.number().int().nonnegative(),
        runningLoss: nonNegativeDollarsSchema,
        wins: z.number().int().nonnegative(),
    })
    .refine(
        (day) =>
            isAtOrBelowWithinCentTolerance(0, day.dayPnL + day.runningLoss),
        {
            message: 'the day cannot be down more than its running loss',
            path: ['dayPnL'],
        },
    ) satisfies z.ZodType<DayProgress>;

export function dailyLossRoom(context: RuleContext): CappedAmount | null {
    return tighterOf(
        tighterOf(null, context.dayStartDllRoom, SizingConstraint.DailyLossCap),
        context.personalDll,
        SizingConstraint.PersonalCap,
    );
}

export function lossBudget(context: RuleContext): CappedAmount {
    const cushion = {
        amount: context.cushion,
        constraint: SizingConstraint.CushionCap,
    };
    const room = dailyLossRoom(context);
    return room !== null && room.amount < cushion.amount ? room : cushion;
}

export function profitCeiling(context: RuleContext): CappedAmount | null {
    switch (context.stage) {
        case SizingStage.Eval: {
            return tighterOf(
                tighterOf(
                    null,
                    context.consistencyDailyCap,
                    SizingConstraint.ConsistencyCap,
                ),
                context.remainingProfitToTarget,
                SizingConstraint.RemainingTargetCap,
            );
        }
        case SizingStage.Funded:
        case SizingStage.Live: {
            return null;
        }
    }
}

export function tighterOf(
    current: CappedAmount | null,
    amount: Dollars | null,
    constraint: SizingConstraint,
): CappedAmount | null {
    if (amount === null) return current;
    return current === null || amount < current.amount
        ? { amount, constraint }
        : current;
}
