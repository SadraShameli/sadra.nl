import {
    DpGateFailure,
    type DpGateRun,
    type DpValidationVerdict,
    evaluateDpGateRun,
} from './DpValidationGate';

export const DP_G2_RECORDED_ON: null | string = null;

export const DP_GATE_RUNS: readonly DpGateRun[] = [];

export interface DpValidationLookup {
    readonly g2RecordedOn?: null | string;
    readonly runs?: readonly DpGateRun[];
}

export function dpValidationFor(
    planSerial: string,
    lookup: DpValidationLookup = {},
): DpValidationVerdict {
    const { g2RecordedOn = DP_G2_RECORDED_ON, runs = DP_GATE_RUNS } = lookup;
    const latest = runs
        .filter((run) => run.planSerial === planSerial)
        .toSorted((a, b) => b.ranOn.localeCompare(a.ranOn))
        .at(0);
    return latest === undefined
        ? {
              citation: null,
              failure: DpGateFailure.NoGateRun,
              result: null,
              validated: false,
          }
        : evaluateDpGateRun(latest, g2RecordedOn);
}
