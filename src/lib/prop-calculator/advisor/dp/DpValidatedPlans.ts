import { type DpGateRun, type DpValidationVerdict } from './DpValidationGate';

export const DP_G2_RECORDED_ON: null | string = null;

export const DP_GATE_RUNS: readonly DpGateRun[] = [];

export interface DpValidationLookup {
    readonly g2RecordedOn?: null | string;
    readonly runs?: readonly DpGateRun[];
}

export function dpValidationFor(
    _planSerial: string,
    _lookup?: DpValidationLookup,
): DpValidationVerdict {
    throw new Error('not implemented');
}
