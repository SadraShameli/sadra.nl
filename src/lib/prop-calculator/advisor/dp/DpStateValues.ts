import {
    DpSampleStage,
    DpSamplesUnavailableReason,
} from '~/lib/prop-calculator/advisor/DpAdviceRow';
import { type DocumentedPolicySpec } from '~/lib/prop-calculator/advisor/policy';
import {
    VALUE_CHAIN_STEP_ORDER,
    valueChainStepAccount,
    ValueChainStepKind,
} from '~/lib/prop-calculator/advisor/value';
import {
    type AccountState,
    type DpTradeValue,
    type DpValueReading,
    type EvalStateValueResult,
    type FundedCycleSnapshot,
} from '~/lib/prop-calculator/core';
import { centsOf } from '~/lib/prop-calculator/core/EvalDayTopology';
import { type FundedStateValueResult } from '~/lib/prop-calculator/core/FundedStateValue';

import {
    type DpAdviceAccount,
    dpEvalDayIndex,
    dpSampleStageOf,
    fundedFailureReason,
} from './DpAdviceSource';

export enum DpStateValuesKind {
    Read = 'read',
    Unavailable = 'unavailable',
}

export interface DpDocumentedRungValue extends DpTradeValueCents {
    readonly intendedRiskCents: number;
}

export type DpStateValueRead =
    | {
          readonly kind: DpStateValuesKind.Read;
          readonly report: DpStateValueReport;
      }
    | {
          readonly kind: DpStateValuesKind.Unavailable;
          readonly reason: DpSamplesUnavailableReason;
      };

export interface DpStateValueReport {
    readonly bestRiskCents: number;
    readonly candidates: readonly DpTradeValueCents[];
    readonly documentedRung: DpDocumentedRungValue | null;
    readonly isBeyondGrid: boolean;
    readonly noTrade: DpValueCents;
    readonly value: DpValueCents;
}

export interface DpStateValues {
    readonly chain: readonly DpValueChainEntry[];
    readonly ratePerDayCents: number;
    readonly stage: DpSampleStage;
    readonly state: DpStateValueRead;
}

export interface DpStateValuesInput {
    readonly account: DpAdviceAccount;
    readonly chainSpec: DocumentedPolicySpec;
    readonly documentedRungDollars: number;
    readonly solution: DpValuesSolution;
}

export interface DpTradeValueCents {
    readonly afterLoss: DpValueCents;
    readonly afterWin: DpValueCents;
    readonly expected: DpValueCents;
    readonly riskCents: number;
}

export interface DpValueCents {
    readonly rateAdjustedCents: number;
    readonly rateZeroCashCents: null | number;
}

export type DpValueChainEntry =
    | {
          readonly kind: ValueChainStepKind;
          readonly reason: string;
      }
    | {
          readonly kind: ValueChainStepKind;
          readonly value: DpValueCents;
      };

export interface DpValuesSolution extends DpValuesSolve {
    readonly ratePerDay: number;
    readonly rateZero: DpValuesSolve | null;
}

interface DpValuesSolve {
    readonly evalResult: Pick<
        EvalStateValueResult,
        'initialValue' | 'valuesAtReachedState'
    >;
    readonly fundedResult: Pick<
        FundedStateValueResult,
        'isGridSaturated' | 'valuesAt'
    >;
}

interface StageReader {
    readonly isBeyondGrid: boolean;
    readonly read: (
        solve: DpValuesSolve,
        intendedRisks: readonly number[],
    ) => DpValueReading | null;
}

const NO_TRADE_INDEX = 0;

export function dpStateValuesOf(input: DpStateValuesInput): DpStateValues {
    const { account, solution } = input;
    const stage = dpSampleStageOf(account);
    return {
        chain: chainOf(input),
        ratePerDayCents: centsOf(solution.ratePerDay),
        stage,
        state: stateValuesOf(input, stage),
    };
}

function cashOf(
    solution: DpValuesSolution,
    readValue: (solve: DpValuesSolve) => null | number,
): DpValueCents | null {
    const rateAdjusted = readValue(solution);
    if (rateAdjusted === null) return null;
    return valueCentsOf(
        rateAdjusted,
        solution.rateZero === null ? null : readValue(solution.rateZero),
    );
}

function chainOf(input: DpStateValuesInput): DpValueChainEntry[] {
    const { account, chainSpec, solution } = input;
    const { plan } = account;
    const valueOfStep = (kind: ValueChainStepKind): DpValueCents | string => {
        if (kind === ValueChainStepKind.EvalStart) {
            return (
                cashOf(solution, (solve) => solve.evalResult.initialValue) ??
                'the eval DP has no start value'
            );
        }
        try {
            const { fundedTracker, state } = valueChainStepAccount(
                kind,
                plan,
                chainSpec,
            );
            const cycle = fundedTracker?.cycleSnapshot(plan, state);
            return (
                cashOf(
                    solution,
                    (solve) =>
                        solve.fundedResult.valuesAt(
                            state,
                            NO_TRADE_INDEX,
                            cycle,
                        )?.value ?? null,
                ) ?? 'the DP has no decision at this state'
            );
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    };
    return VALUE_CHAIN_STEP_ORDER.map((kind): DpValueChainEntry => {
        const value = valueOfStep(kind);
        return typeof value === 'string'
            ? { kind, reason: value }
            : { kind, value };
    });
}

function evalReader(state: AccountState, day: number): StageReader {
    const dayState = { ...state, elapsedDays: day };
    return {
        isBeyondGrid: false,
        read: (solve, intendedRisks) =>
            solve.evalResult.valuesAtReachedState(
                dayState,
                NO_TRADE_INDEX,
                intendedRisks,
            ),
    };
}

function fundedReader(
    solution: DpValuesSolution,
    state: AccountState,
    cycle: FundedCycleSnapshot | undefined,
): StageReader {
    return {
        isBeyondGrid: solution.fundedResult.isGridSaturated(state, cycle),
        read: (solve, intendedRisks) =>
            solve.fundedResult.valuesAt(
                state,
                NO_TRADE_INDEX,
                cycle,
                intendedRisks,
            ),
    };
}

function readerOf(
    input: DpStateValuesInput,
    stage: DpSampleStage,
): DpSamplesUnavailableReason | StageReader {
    const { account, solution } = input;
    const { plan, state } = account;
    switch (stage) {
        case DpSampleStage.Eval: {
            const day = dpEvalDayIndex(state);
            return day === null
                ? DpSamplesUnavailableReason.EvalElapsedDaysMissing
                : evalReader(state, day);
        }
        case DpSampleStage.Funded: {
            return fundedReader(
                solution,
                state,
                account.fundedTracker?.cycleSnapshot(plan, state),
            );
        }
    }
}

function stateValuesOf(
    input: DpStateValuesInput,
    stage: DpSampleStage,
): DpStateValueRead {
    const reader = readerOf(input, stage);
    if (typeof reader === 'string') {
        return { kind: DpStateValuesKind.Unavailable, reason: reader };
    }
    const unreached: DpStateValueRead = {
        kind: DpStateValuesKind.Unavailable,
        reason:
            stage === DpSampleStage.Eval
                ? DpSamplesUnavailableReason.EvalStateUnreached
                : DpSamplesUnavailableReason.FundedLevelUnreachable,
    };
    const { documentedRungDollars, solution } = input;
    const intendedRisks =
        documentedRungDollars > 0 ? [documentedRungDollars] : [];
    let reading: DpValueReading | null;
    try {
        reading = reader.read(solution, intendedRisks);
    } catch (error) {
        const reason = fundedFailureReason(error);
        if (reason === null) throw error;
        return { kind: DpStateValuesKind.Unavailable, reason };
    }
    if (reading === null) return unreached;
    const rateZero =
        solution.rateZero === null
            ? null
            : reader.read(solution.rateZero, intendedRisks);
    const rateZeroByRisk = new Map(
        (rateZero?.trades ?? []).map((trade) => [trade.risk, trade]),
    );
    const [rung] = reading.requested;
    return {
        kind: DpStateValuesKind.Read,
        report: {
            bestRiskCents: centsOf(reading.bestRisk),
            candidates: reading.trades.map((trade) =>
                tradeCentsOf(trade, rateZeroByRisk.get(trade.risk) ?? null),
            ),
            documentedRung:
                rung === undefined
                    ? null
                    : {
                          ...tradeCentsOf(rung, rateZero?.requested[0] ?? null),
                          intendedRiskCents: centsOf(documentedRungDollars),
                      },
            isBeyondGrid: reader.isBeyondGrid,
            noTrade: valueCentsOf(
                reading.noTradeValue,
                rateZero?.noTradeValue ?? null,
            ),
            value: valueCentsOf(reading.value, rateZero?.value ?? null),
        },
    };
}

function tradeCentsOf(
    trade: DpTradeValue,
    rateZero: DpTradeValue | null,
): DpTradeValueCents {
    return {
        afterLoss: valueCentsOf(
            trade.valueAfterLoss,
            rateZero?.valueAfterLoss ?? null,
        ),
        afterWin: valueCentsOf(
            trade.valueAfterWin,
            rateZero?.valueAfterWin ?? null,
        ),
        expected: valueCentsOf(trade.value, rateZero?.value ?? null),
        riskCents: centsOf(trade.risk),
    };
}

function valueCentsOf(
    rateAdjusted: number,
    rateZeroCash: null | number,
): DpValueCents {
    return {
        rateAdjustedCents: centsOf(rateAdjusted),
        rateZeroCashCents: rateZeroCash === null ? null : centsOf(rateZeroCash),
    };
}
