import { z } from 'zod';

import {
    type AccountState,
    type ContractCount,
    contractCountSchema,
    contractLimitAt,
    type Dollars,
    dollars,
    dollarsSchema,
    type Fraction0to1,
    INSTRUMENTS,
    InstrumentSymbol,
    isAtOrBelowWithinCentTolerance,
    ONE_CENT,
    type Plan,
    resolveDailyLossLimit,
    resolveLiveFloorTradeRisk,
    TradingPhase,
} from '~/lib/prop-calculator/core';

import { type CappedAmount, SizingConstraint } from './DocumentedSizing';
import {
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    personalCapsSchema,
    positiveDollarsSchema,
} from './PersonalCaps';
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
    readonly floorTradeRisk: Dollars;
    readonly liveCushionPercent: Fraction0to1 | null;
    readonly stage: SizingStage.Live;
    readonly thresholdLocked: boolean;
}

export type PlanPhaseStage = SizingStage.Eval | SizingStage.Funded;

export type RuleContext = EvalRuleContext | FundedRuleContext | LiveRuleContext;

export interface RuleContextCaps {
    readonly ceiling?: Dollars | null;
    readonly instrument: InstrumentSymbol | null;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll: Dollars | null;
    readonly placeableMinimum?: Dollars;
}

interface SharedRuleContext {
    readonly ceiling: Dollars | null;
    readonly contractLimit: ContractCount | null;
    readonly cushion: Dollars;
    readonly dayStartDllRoom: Dollars | null;
    readonly instrument: InstrumentSymbol | null;
    readonly personalCaps: PersonalCaps;
    readonly personalDll: Dollars | null;
    readonly placeableMinimum: Dollars;
}

const nonNegativeDollarsSchema = dollarsSchema.refine((amount) => amount >= 0, {
    message: 'must be zero or more',
});

const sharedRuleContextShape = {
    ceiling: dollarsSchema.nullable(),
    contractLimit: contractCountSchema.nullable(),
    cushion: dollarsSchema,
    dayStartDllRoom: dollarsSchema.nullable(),
    instrument: z.enum(InstrumentSymbol).nullable(),
    personalCaps: personalCapsSchema,
    personalDll: positiveDollarsSchema.nullable(),
    placeableMinimum: positiveDollarsSchema,
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

export const liveRuleContextSchema = z
    .strictObject({
        ...sharedRuleContextShape,
        floorTradeRisk: nonNegativeDollarsSchema,
        liveCushionPercent: liveFractionSchema.nullable(),
        stage: z.literal(SizingStage.Live),
        thresholdLocked: z.boolean(),
    })
    .refine(
        (context) =>
            context.floorTradeRisk === 0 ||
            resolveLiveFloorTradeRisk(
                context.cushion,
                true,
                context.floorTradeRisk,
            ) === context.floorTradeRisk,
        {
            message:
                'a floor trade risk only exists on a floor still alive at a cushion of zero',
            path: ['floorTradeRisk'],
        },
    ) satisfies z.ZodType<LiveRuleContext>;

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
            return context.ceiling === null
                ? null
                : {
                      amount: context.ceiling,
                      constraint: SizingConstraint.CeilingCap,
                  };
        }
    }
}

export function ruleContextAt(
    plan: Plan,
    stage: SizingStage.Eval,
    state: AccountState,
    caps: RuleContextCaps,
): EvalRuleContext;
export function ruleContextAt(
    plan: Plan,
    stage: SizingStage.Funded,
    state: AccountState,
    caps: RuleContextCaps,
): FundedRuleContext;
export function ruleContextAt(
    plan: Plan,
    stage: PlanPhaseStage,
    state: AccountState,
    caps: RuleContextCaps,
): EvalRuleContext | FundedRuleContext;
export function ruleContextAt(
    plan: Plan,
    stage: PlanPhaseStage,
    state: AccountState,
    caps: RuleContextCaps,
): EvalRuleContext | FundedRuleContext {
    const phase = planPhaseOf(stage);
    const dllRoom = resolveDailyLossLimit(
        plan.dailyLossLimitFor(phase),
        plan.dailyLossLimitContext(state),
    );
    const shared: SharedRuleContext = {
        ceiling: caps.ceiling ?? null,
        contractLimit:
            caps.instrument === null
                ? null
                : contractLimitAt(
                      plan.contractLimits,
                      phase,
                      INSTRUMENTS[caps.instrument].isMicro,
                      plan.tierProfitContext(state),
                  ),
        cushion: dollars(state.balance - state.threshold),
        dayStartDllRoom: dllRoom === null ? null : dollars(dllRoom),
        instrument: caps.instrument,
        personalCaps: caps.personalCaps ?? NO_PERSONAL_CAPS,
        personalDll: caps.personalDll,
        placeableMinimum: caps.placeableMinimum ?? ONE_CENT,
    };
    switch (stage) {
        case SizingStage.Eval: {
            const consistency = plan.evalConsistencyRule();
            return {
                ...shared,
                consistencyDailyCap:
                    consistency === null
                        ? null
                        : dollars(
                              consistency.maxBestDayShare * plan.profitTarget,
                          ),
                remainingProfitToTarget: dollars(
                    plan.profitTarget - plan.accountProfit(state),
                ),
                stage,
            };
        }
        case SizingStage.Funded: {
            return { ...shared, stage };
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

function planPhaseOf(stage: PlanPhaseStage): TradingPhase {
    switch (stage) {
        case SizingStage.Eval: {
            return TradingPhase.Eval;
        }
        case SizingStage.Funded: {
            return TradingPhase.Funded;
        }
    }
}
