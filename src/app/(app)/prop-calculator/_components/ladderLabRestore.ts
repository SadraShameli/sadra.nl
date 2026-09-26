import {
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    defaultLadderGridMax,
    InstrumentSymbol,
    type LadderScore,
    type RungSizing,
    SIM_DEFAULTS,
    type SimInputs,
} from '~/lib/prop-calculator';

import {
    applyPolicy,
    describeLadderSlot,
    isSlotApplicable,
    type LadderDisplayInstrument,
    type LadderLabForm,
    type LadderResultSlot,
    LadderSlotEvent,
    ladderSlotFor,
    restoreForm,
} from './ladderResultSlot';
import {
    type LadderProgress,
    LadderRunPhase,
    type LadderSearchInputs,
    type LadderSearchRun,
    type LadderSearchState,
} from './ladderSearchTypes';

export enum LadderLabViewKind {
    Cancelled = 'cancelled',
    Empty = 'empty',
    InputsChanged = 'inputs-changed',
    Restored = 'restored',
}

export enum LadderRowActionKind {
    Apply = 'apply',
    Clear = 'clear',
    Unavailable = 'unavailable',
}

export type LadderLabView =
    | (LadderSlotView & {
          kind: LadderLabViewKind.Cancelled;
          notice: string;
          progress: LadderProgress;
      })
    | (LadderSlotView & {
          kind: LadderLabViewKind.InputsChanged;
          notice: string;
          result: LadderSearchRun;
      })
    | (LadderSlotView & {
          kind: LadderLabViewKind.Restored;
          result: LadderSearchRun;
      })
    | { kind: LadderLabViewKind.Empty };

export type LadderRowAction =
    | {
          kind: LadderRowActionKind.Apply;
          policy: DayPolicy;
          rungSizing: RungSizing;
      }
    | { kind: LadderRowActionKind.Clear }
    | { kind: LadderRowActionKind.Unavailable };

interface LadderSlotView {
    form: LadderLabForm;
    slot: LadderResultSlot;
}

const DEFAULT_GRID_LO = 100;
const DEFAULT_GRID_STEP = 100;
const DEFAULT_GRID_SLOTS = 4;
const DEFAULT_SIMS_PER_LADDER = 4000;

const INPUTS_CHANGED_NOTICE =
    'Inputs changed since this run, so Apply is off. Run the search again to score ladders on the current inputs.';

export function displayedLadderSlot(
    search: LadderSearchState,
    runInputs: LadderSearchInputs | null,
    displayInstrument: LadderDisplayInstrument,
    storedSlot: LadderResultSlot | null,
): LadderResultSlot | null {
    if (search.phase === LadderRunPhase.Idle) return storedSlot;
    const event = settledSlotEvent(search.phase);
    return event === null || runInputs === null
        ? null
        : ladderSlotFor(event, search, runInputs, displayInstrument);
}

export function initialLadderLabForm(
    slot: LadderResultSlot | null,
    cushion: number,
    calculatorRungSizing: RungSizing,
): LadderLabForm {
    return slot === null
        ? {
              displayInstrument: InstrumentSymbol.NQ,
              grid: {
                  lo: DEFAULT_GRID_LO,
                  max: defaultLadderGridMax(cushion),
                  slots: DEFAULT_GRID_SLOTS,
                  step: DEFAULT_GRID_STEP,
              },
              rungSizing: calculatorRungSizing,
              sims: DEFAULT_SIMS_PER_LADDER,
              stopRule: { kind: DayStopRuleKind.DayGreen },
          }
        : restoreForm(slot);
}

export function isActiveLadderRow(
    view: LadderLabView,
    row: LadderScore,
    activePolicy: DayPolicy | null,
    activeRungSizing: RungSizing,
): boolean {
    if (activePolicy === null) return false;
    switch (view.kind) {
        case LadderLabViewKind.Cancelled:
        case LadderLabViewKind.Empty: {
            return false;
        }
        case LadderLabViewKind.InputsChanged:
        case LadderLabViewKind.Restored: {
            return (
                view.slot.inputs.rungSizing === activeRungSizing &&
                isSameDayPolicy(applyPolicy(view.slot, row), activePolicy)
            );
        }
    }
}

export function labViewForSlot(
    slot: LadderResultSlot | null,
    currentInputs: LadderSearchInputs,
): LadderLabView {
    if (slot === null) return { kind: LadderLabViewKind.Empty };
    const form = restoreForm(slot);
    switch (slot.result.phase) {
        case LadderRunPhase.Cancelled: {
            const { progress } = slot.result;
            return {
                form,
                kind: LadderLabViewKind.Cancelled,
                notice: `${describeLadderSlot(slot) ?? 'Search cancelled'} after ${progress.completed} of ${progress.total} ladders. Run the search again to score the full grid.`,
                progress,
                slot,
            };
        }
        case LadderRunPhase.Succeeded: {
            const { result } = slot.result;
            return isSlotApplicable(slot, currentInputs)
                ? { form, kind: LadderLabViewKind.Restored, result, slot }
                : {
                      form,
                      kind: LadderLabViewKind.InputsChanged,
                      notice: INPUTS_CHANGED_NOTICE,
                      result,
                      slot,
                  };
        }
    }
}

export function ladderRowAction(
    view: LadderLabView,
    row: LadderScore,
    activePolicy: DayPolicy | null,
    activeRungSizing: RungSizing,
): LadderRowAction {
    if (isActiveLadderRow(view, row, activePolicy, activeRungSizing)) {
        return { kind: LadderRowActionKind.Clear };
    }
    return view.kind === LadderLabViewKind.Restored
        ? {
              kind: LadderRowActionKind.Apply,
              policy: applyPolicy(view.slot, row),
              rungSizing: view.slot.inputs.rungSizing,
          }
        : { kind: LadderRowActionKind.Unavailable };
}

export function ladderSearchInputsFor(
    baseInputs: SimInputs,
    form: LadderLabForm,
): LadderSearchInputs {
    return {
        commission:
            baseInputs.commissionPerRoundTrip ??
            SIM_DEFAULTS.commissionPerRoundTrip,
        copyAccounts: baseInputs.copyAccounts ?? SIM_DEFAULTS.copyAccounts,
        discounts: baseInputs.discounts,
        grid: { ...form.grid },
        instrument: baseInputs.instrument,
        maxDays: baseInputs.maxEvalDays,
        plan: baseInputs.plan,
        rrRatio: baseInputs.rrRatio,
        rungSizing: form.rungSizing,
        seed: baseInputs.seed,
        sims: form.sims,
        stopPoints: baseInputs.stopPoints,
        stopRule: form.stopRule,
        winrate: baseInputs.winrate,
    };
}

export function settledSlotEvent(
    phase: LadderRunPhase,
): LadderSlotEvent | null {
    switch (phase) {
        case LadderRunPhase.Cancelled: {
            return LadderSlotEvent.Cancelled;
        }
        case LadderRunPhase.Failed:
        case LadderRunPhase.Idle:
        case LadderRunPhase.Running: {
            return null;
        }
        case LadderRunPhase.Succeeded: {
            return LadderSlotEvent.Completed;
        }
    }
}

function isSameDayPolicy(a: DayPolicy, b: DayPolicy): boolean {
    return (
        a.ladder.join(',') === b.ladder.join(',') &&
        a.maxLossesPerDay === b.maxLossesPerDay &&
        a.computeRisk === b.computeRisk &&
        isSameStopRule(a.stopRule, b.stopRule)
    );
}

function isSameStopRule(a: DayStopRule, b: DayStopRule): boolean {
    switch (a.kind) {
        case DayStopRuleKind.AfterKLosses: {
            return b.kind === a.kind && b.k === a.k;
        }
        case DayStopRuleKind.AfterTarget: {
            return b.kind === a.kind && b.dollars === a.dollars;
        }
        case DayStopRuleKind.DayGreen:
        case DayStopRuleKind.FirstWin:
        case DayStopRuleKind.None: {
            return b.kind === a.kind;
        }
    }
}
