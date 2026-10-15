import { DpGateFailureCode } from '~/lib/prop-calculator/advisor';
import { PayoutRequestPolicy } from '~/lib/prop-calculator/core';
import { RateSearchStatus } from '~/lib/prop-calculator/core/AverageRewardSolver';

import {
    DpEvalObjective,
    type DpGateRun,
    type DpValidationVerdict,
    evaluateDpGateRun,
} from './DpValidationGate';

const DP_GATE_FILE = 'engine-results/2026-10-15-dp-gate.md';

const DP_GATE_ENGINE_REF = '7037fcfa';

export const DP_G2_RECORDED_ON: null | string = '2026-10-15';

export const DP_GATE_RUNS: readonly DpGateRun[] = [
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'alphafutures advanced',
        },
        dp: { creditFree: 2497, creditInclusive: 2558 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 1000,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 1940, creditInclusive: 1997 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 1000,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'alphafutures-50000-advanced',
        ranOn: '2026-10-15T06:28Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'e8futures zero-max-100',
        },
        dp: { creditFree: 480, creditInclusive: 480 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 112, creditInclusive: 112 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'e8futures-50000-zero-max-100',
        ranOn: '2026-10-15T06:53Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'e8futures zero-max-80',
        },
        dp: { creditFree: 404, creditInclusive: 404 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 107, creditInclusive: 107 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'e8futures-50000-zero-max-80',
        ranOn: '2026-10-15T07:16Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'e8futures zero-starter-100',
        },
        dp: { creditFree: 882, creditInclusive: 882 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 374, creditInclusive: 374 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'e8futures-50000-zero-starter-100',
        ranOn: '2026-10-15T07:16Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'ftmo-futures growth',
        },
        dp: { creditFree: 1137, creditInclusive: 1144 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 1035, creditInclusive: 1046 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'ftmo-futures-50000-growth',
        ranOn: '2026-10-15T08:50Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'ftmo-futures pro',
        },
        dp: { creditFree: 372, creditInclusive: 372 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 850, creditInclusive: 861 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'ftmo-futures-50000-pro',
        ranOn: '2026-10-15T08:58Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'fundednext flex',
        },
        dp: { creditFree: 593, creditInclusive: 593 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 461, creditInclusive: 461 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'fundednext-50000-flex',
        ranOn: '2026-10-15T09:27Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'fundednext rapid-daily',
        },
        dp: { creditFree: 1167, creditInclusive: 1167 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 396, creditInclusive: 396 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'fundednext-50000-rapid-daily',
        ranOn: '2026-10-15T09:32Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: { date: '2026-10-15', file: DP_GATE_FILE, row: 'mffu pro' },
        dp: { creditFree: 1355, creditInclusive: 1391 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 1000,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 915, creditInclusive: 935 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 1000,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'mffu-50000-pro',
        ranOn: '2026-10-15T08:20Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'topstep no-fee-standard',
        },
        dp: { creditFree: 1006, creditInclusive: 1007 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 824, creditInclusive: 836 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'topstep-50000-no-fee-standard',
        ranOn: '2026-10-15T10:19Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'topstep standard-standard',
        },
        dp: { creditFree: 995, creditInclusive: 996 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 814, creditInclusive: 825 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'topstep-50000-standard-standard',
        ranOn: '2026-10-15T10:23Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'tradeify select-daily',
        },
        dp: { creditFree: 4225, creditInclusive: 4225 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 2084, creditInclusive: 2084 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'tradeify-50000-select-daily',
        ranOn: '2026-10-15T08:59Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
    {
        citation: {
            date: '2026-10-15',
            file: DP_GATE_FILE,
            row: 'tradeify select-flex',
        },
        dp: { creditFree: 1137, creditInclusive: 1138 },
        dpBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        engineRef: DP_GATE_ENGINE_REF,
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 830, creditInclusive: 842 },
        flatBasis: {
            instrument: null,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            retainedCushion: 2000,
            stopPoints: null,
        },
        planSerial: 'tradeify-50000-select-flex',
        ranOn: '2026-10-15T08:43Z',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
    },
];

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
              failure: DpGateFailureCode.NoGateRun,
              result: null,
              validated: false,
          }
        : evaluateDpGateRun(latest, g2RecordedOn);
}
