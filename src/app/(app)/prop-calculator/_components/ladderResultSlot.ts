import {
    type DayPolicy,
    type DayStopRule,
    type InstrumentSymbol,
    type LadderGridConfig,
    type LadderScore,
    PolicySizing,
    type RungSizing,
} from '~/lib/prop-calculator';

import {
    LadderRunPhase,
    type LadderSearchInputs,
    type LadderSearchState,
} from './ladderSearchTypes';
import { simInputsCacheKey, SimInputsKeyField } from './simInputsCacheKey';

export enum LadderSlotEvent {
    Cancelled = 'cancelled',
    Completed = 'completed',
    Progress = 'progress',
    Unmounted = 'unmounted',
}

export type LadderDisplayInstrument = '' | InstrumentSymbol;

export interface LadderLabForm {
    displayInstrument: LadderDisplayInstrument;
    grid: LadderGridConfig;
    rungSizing: RungSizing;
    sims: number;
    stopRule: DayStopRule;
}

export interface LadderResultSlot {
    cancelledByNavigation: boolean;
    displayInstrument: LadderDisplayInstrument;
    inputs: LadderSearchInputs;
    result: LadderSlotResult;
}

export type LadderSlotResult = Extract<
    LadderSearchState,
    { phase: LadderRunPhase.Cancelled | LadderRunPhase.Succeeded }
>;

const LADDER_KEY_TRADES_PER_DAY = 0;

const LADDER_KEY_OMITTED_FIELDS: readonly SimInputsKeyField[] = [
    SimInputsKeyField.TradesPerDay,
    SimInputsKeyField.FundedHorizonDays,
    SimInputsKeyField.RiskPerTrade,
    SimInputsKeyField.EvalDayPolicy,
    SimInputsKeyField.FundedDayPolicy,
    SimInputsKeyField.FundedCushionPercent,
    SimInputsKeyField.FundedRiskPerTrade,
    SimInputsKeyField.FundedRrRatio,
    SimInputsKeyField.FundedTradesPerDay,
    SimInputsKeyField.IdleDayProbability,
    SimInputsKeyField.IntradayPathStepsPerR,
    SimInputsKeyField.Attempts,
    SimInputsKeyField.MinRetainedCushion,
    SimInputsKeyField.PayoutRequestSize,
    SimInputsKeyField.RebuyLagDays,
];

export function applyPolicy(
    slot: LadderResultSlot,
    row: LadderScore,
): DayPolicy {
    return {
        ladder: [...row.ladder],
        maxLossesPerDay: null,
        sizing: PolicySizing.ContractCapped,
        stopRule: slot.inputs.stopRule,
    };
}

export function describeLadderSlot(slot: LadderResultSlot): null | string {
    if (slot.result.phase !== LadderRunPhase.Cancelled) return null;
    return slot.cancelledByNavigation
        ? 'Search cancelled by navigation'
        : 'Search cancelled';
}

export function isSlotApplicable(
    slot: LadderResultSlot,
    currentInputs: LadderSearchInputs,
): boolean {
    return ladderInputsKey(slot.inputs) === ladderInputsKey(currentInputs);
}

export function isSlotWriteAllowed(event: LadderSlotEvent): boolean {
    switch (event) {
        case LadderSlotEvent.Cancelled:
        case LadderSlotEvent.Completed:
        case LadderSlotEvent.Unmounted: {
            return true;
        }
        case LadderSlotEvent.Progress: {
            return false;
        }
    }
}

export function ladderInputsKey(inputs: LadderSearchInputs): string {
    return simInputsCacheKey(
        {
            commissionPerRoundTrip: inputs.commission,
            copyAccounts: inputs.copyAccounts,
            dayStop: inputs.stopRule,
            discounts: inputs.discounts,
            instrument: inputs.instrument,
            maxEvalDays: inputs.maxDays,
            plan: inputs.plan,
            rrRatio: inputs.rrRatio,
            rungSizing: inputs.rungSizing,
            seed: inputs.seed,
            stopPoints: inputs.stopPoints,
            tradesPerDay: LADDER_KEY_TRADES_PER_DAY,
            trials: inputs.sims,
            winrate: inputs.winrate,
        },
        {
            extra: {
                grid: {
                    lo: inputs.grid.lo,
                    max: inputs.grid.max,
                    slots: inputs.grid.slots,
                    step: inputs.grid.step,
                },
            },
            omit: LADDER_KEY_OMITTED_FIELDS,
        },
    );
}

export function ladderSlotFor(
    event: LadderSlotEvent,
    search: LadderSearchState,
    inputs: LadderSearchInputs,
    displayInstrument: LadderDisplayInstrument,
): LadderResultSlot | null {
    const result = slotResultFor(event, search);
    return result === null
        ? null
        : {
              cancelledByNavigation:
                  event === LadderSlotEvent.Unmounted &&
                  search.phase === LadderRunPhase.Running,
              displayInstrument,
              inputs,
              result,
          };
}

export function restoreForm(slot: LadderResultSlot): LadderLabForm {
    return {
        displayInstrument: slot.displayInstrument,
        grid: { ...slot.inputs.grid },
        rungSizing: slot.inputs.rungSizing,
        sims: slot.inputs.sims,
        stopRule: slot.inputs.stopRule,
    };
}

function slotResultFor(
    event: LadderSlotEvent,
    search: LadderSearchState,
): LadderSlotResult | null {
    if (!isSlotWriteAllowed(event)) return null;
    switch (search.phase) {
        case LadderRunPhase.Cancelled: {
            return event === LadderSlotEvent.Completed ? null : search;
        }
        case LadderRunPhase.Failed:
        case LadderRunPhase.Idle: {
            return null;
        }
        case LadderRunPhase.Running: {
            return event === LadderSlotEvent.Unmounted
                ? { phase: LadderRunPhase.Cancelled, progress: search.progress }
                : null;
        }
        case LadderRunPhase.Succeeded: {
            return event === LadderSlotEvent.Cancelled ? null : search;
        }
    }
}
