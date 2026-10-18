import { createHash } from 'node:crypto';

import { SizingObjective } from '~/lib/prop-calculator/advisor';
import {
    type CouponDiscounts,
    dollars,
    fraction,
    type InstrumentSymbol,
    type Plan,
    type PlanOptIns,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core';
import {
    type AverageRewardConfig,
    type EvalGridConfig,
    type FundedGridConfig,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    RenewalCycleObjective,
    type RenewalCycleObjectiveInit,
} from '~/lib/prop-calculator/core/RenewalCycleObjective';
import { stableJson } from '~/lib/stableJson';

export const DP_CONFIG_KEY_LENGTH = 64;

export enum FieldKeying {
    Keyed = 'keyed',
    KeyedViaPlanIdentity = 'keyed-via-plan-identity',
    NotResultAffecting = 'not-result-affecting',
    SharedAtTopLevel = 'shared-at-top-level',
    StopRuleNotModeled = 'stop-rule-not-modeled',
}

export const FUNDED_GRID_FIELD_KEYING = {
    actionStepMultiple: FieldKeying.Keyed,
    commission: FieldKeying.SharedAtTopLevel,
    convergenceTolerance: FieldKeying.Keyed,
    cushionStepMultiple: FieldKeying.Keyed,
    cycleBestDayBucketCount: FieldKeying.Keyed,
    maxActionMultiple: FieldKeying.Keyed,
    maxCushionMultiple: FieldKeying.Keyed,
    maxIterationsPerLevel: FieldKeying.Keyed,
    maxPreLockOffsetMultiple: FieldKeying.Keyed,
    maxTailCushionMultiple: FieldKeying.Keyed,
    minRetainedCushion: FieldKeying.Keyed,
    payoutRegimeCap: FieldKeying.Keyed,
    payoutRequestPolicy: FieldKeying.Keyed,
    payoutRequestSize: FieldKeying.Keyed,
    positionSizing: FieldKeying.SharedAtTopLevel,
    rungSizing: FieldKeying.Keyed,
    stopRule: FieldKeying.StopRuleNotModeled,
    tailCushionStepMultiple: FieldKeying.Keyed,
    tradesPerDay: FieldKeying.SharedAtTopLevel,
} as const satisfies Readonly<Record<keyof FundedGridConfig, FieldKeying>>;

export const EVAL_GRID_FIELD_KEYING = {
    actionStepDollars: FieldKeying.Keyed,
    commission: FieldKeying.SharedAtTopLevel,
    cushionStepDollars: FieldKeying.Keyed,
    maxActionDollars: FieldKeying.Keyed,
    positionSizing: FieldKeying.SharedAtTopLevel,
    profitStepDollars: FieldKeying.Keyed,
    rungSizing: FieldKeying.Keyed,
    stopRule: FieldKeying.StopRuleNotModeled,
    tradesPerDay: FieldKeying.SharedAtTopLevel,
} as const satisfies Readonly<Record<keyof EvalGridConfig, FieldKeying>>;

export const AVERAGE_REWARD_FIELD_KEYING = {
    evalGrid: FieldKeying.Keyed,
    fundedGrid: FieldKeying.Keyed,
    fundedWorkers: FieldKeying.NotResultAffecting,
    maxSolves: FieldKeying.Keyed,
    maxWorkers: FieldKeying.NotResultAffecting,
    objective: FieldKeying.Keyed,
    rateTolerancePerDay: FieldKeying.Keyed,
    rrRatio: FieldKeying.Keyed,
    startRatePerDay: FieldKeying.Keyed,
    winrate: FieldKeying.Keyed,
} as const satisfies Readonly<Record<keyof AverageRewardConfig, FieldKeying>>;

export const RENEWAL_OBJECTIVE_FIELD_KEYING = {
    copyAccounts: FieldKeying.Keyed,
    discounts: FieldKeying.Keyed,
    fundedHorizonDays: FieldKeying.Keyed,
    maxEvalDays: FieldKeying.Keyed,
    plan: FieldKeying.KeyedViaPlanIdentity,
    rebuyLagDays: FieldKeying.Keyed,
} as const satisfies Readonly<
    Record<keyof RenewalCycleObjectiveInit, FieldKeying>
>;

export type DpEvalGrid = Partial<
    Pick<EvalGridConfig, KeyedFieldsOf<typeof EVAL_GRID_FIELD_KEYING>>
>;

export type DpFundedGrid = Partial<
    Pick<FundedGridConfig, KeyedFieldsOf<typeof FUNDED_GRID_FIELD_KEYING>>
>;

export interface DpPositionSizing {
    readonly instrument: InstrumentSymbol;
    readonly stopPoints: number;
}

export interface DpSolveConfig {
    readonly commission: number;
    readonly copyAccounts: number;
    readonly discounts: CouponDiscounts | null;
    readonly evalGrid: DpEvalGrid;
    readonly fundedGrid: DpFundedGrid;
    readonly fundedHorizonDays: number;
    readonly lifetimePayoutCapOverride: null | number;
    readonly maxEvalDays: number;
    readonly maxSolves: number;
    readonly objective: SizingObjective;
    readonly optIns: PlanOptIns;
    readonly planRulesFingerprint: string;
    readonly planSerial: string;
    readonly positionSizing: DpPositionSizing | null;
    readonly rateTolerancePerDay: null | number;
    readonly rebuyLagDays: number;
    readonly rrRatio: number;
    readonly startRatePerDay: null | number;
    readonly tradesPerDay: number;
    readonly winrate: number;
}

export interface DpSolveRuntime {
    readonly maxWorkers?: number;
}

type KeyedFieldsOf<Table> = {
    [Field in keyof Table]: Table[Field] extends FieldKeying.Keyed
        ? Field
        : never;
}[keyof Table];

export function buildDpSolverCall(
    config: DpSolveConfig,
    plan: Plan,
    runtime: DpSolveRuntime = {},
): AverageRewardConfig {
    const solvedPlan =
        config.lifetimePayoutCapOverride === null
            ? plan
            : plan.withMaxLifetimePayouts(config.lifetimePayoutCapOverride);
    const positionSizing =
        config.positionSizing === null
            ? null
            : resolvePositionSizing(
                  config.positionSizing.instrument,
                  config.positionSizing.stopPoints,
              );
    const shared = {
        commission: dollars(config.commission),
        positionSizing,
        tradesPerDay: config.tradesPerDay,
    };
    const call: AverageRewardConfig = {
        evalGrid: { ...config.evalGrid, ...shared },
        fundedGrid: { ...config.fundedGrid, ...shared },
        maxSolves: config.maxSolves,
        ...(runtime.maxWorkers !== undefined && {
            maxWorkers: runtime.maxWorkers,
        }),
        objective: new RenewalCycleObjective({
            copyAccounts: config.copyAccounts,
            ...(config.discounts !== null && { discounts: config.discounts }),
            fundedHorizonDays: config.fundedHorizonDays,
            maxEvalDays: config.maxEvalDays,
            plan: solvedPlan,
            rebuyLagDays: config.rebuyLagDays,
        }),
        ...(config.rateTolerancePerDay !== null && {
            rateTolerancePerDay: config.rateTolerancePerDay,
        }),
        rrRatio: config.rrRatio,
        ...(config.startRatePerDay !== null && {
            startRatePerDay: config.startRatePerDay,
        }),
        winrate: fraction(config.winrate),
    };
    return objectiveSolverCall(call, config.objective);
}

export function dpConfigKey(config: DpSolveConfig): string {
    return createHash('sha256').update(stableJson(config)).digest('hex');
}

function objectiveSolverCall(
    call: AverageRewardConfig,
    objective: SizingObjective,
): AverageRewardConfig {
    switch (objective) {
        case SizingObjective.CycleCash: {
            return { ...call, maxSolves: 1, startRatePerDay: 0 };
        }
        case SizingObjective.MonthlyNet:
        case SizingObjective.RuinFirst: {
            return call;
        }
    }
}
