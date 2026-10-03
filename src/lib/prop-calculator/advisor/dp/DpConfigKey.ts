import { type SizingObjective } from '../SizingObjective';
import {
    type AverageRewardConfig,
    type EvalGridConfig,
    type FundedGridConfig,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    type CouponDiscounts,
    type InstrumentSymbol,
    type Plan,
    type PlanOptIns,
} from '~/lib/prop-calculator/core';
import { type RenewalCycleObjectiveInit } from '~/lib/prop-calculator/core/RenewalCycleObjective';

export const DP_CONFIG_KEY_LENGTH = 64;

export enum FieldKeying {
    Keyed = 'keyed',
    KeyedViaPlanIdentity = 'keyed-via-plan-identity',
    NotResultAffecting = 'not-result-affecting',
    SharedAtTopLevel = 'shared-at-top-level',
    StopRuleNotModeled = 'stop-rule-not-modeled',
}

export const FUNDED_GRID_FIELD_KEYING = {} as unknown as Readonly<
    Record<keyof FundedGridConfig, FieldKeying>
>;
export const EVAL_GRID_FIELD_KEYING = {} as unknown as Readonly<
    Record<keyof EvalGridConfig, FieldKeying>
>;
export const AVERAGE_REWARD_FIELD_KEYING = {} as unknown as Readonly<
    Record<keyof AverageRewardConfig, FieldKeying>
>;
export const RENEWAL_OBJECTIVE_FIELD_KEYING = {} as unknown as Readonly<
    Record<keyof RenewalCycleObjectiveInit, FieldKeying>
>;

export type DpEvalGrid = Partial<EvalGridConfig>;
export type DpFundedGrid = Partial<FundedGridConfig>;

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

export function buildDpSolverCall(
    _config: DpSolveConfig,
    _plan: Plan,
    _runtime?: DpSolveRuntime,
): AverageRewardConfig {
    throw new Error('not implemented');
}

export function dpConfigKey(_config: DpSolveConfig): string {
    throw new Error('not implemented');
}
