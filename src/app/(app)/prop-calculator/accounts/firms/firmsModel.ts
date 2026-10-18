import {
    type ScaleGate,
    scaleGateFromLedger,
} from '~/lib/prop-accounts/bankroll';
import {
    type FirmRoster,
    firmRosterOf,
    type LiveTransferRate,
    liveTransferRate,
} from '~/lib/prop-accounts/firms';
import { type PortfolioLedger } from '~/lib/prop-accounts/metrics';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

export interface FirmsModel {
    readonly roster: FirmRoster;
    readonly scaleGate: ScaleGate;
    readonly transferRate: LiveTransferRate;
}

export interface FirmsModelInputs {
    readonly asOf: string;
    readonly ledger: PortfolioLedger;
    readonly thresholds: SampleThresholds;
    readonly trades: number;
}

export function firmsModelOf(inputs: FirmsModelInputs): FirmsModel {
    const { asOf, ledger, thresholds, trades } = inputs;
    return {
        roster: firmRosterOf(ledger),
        scaleGate: scaleGateFromLedger(ledger, asOf, thresholds, trades),
        transferRate: liveTransferRate(ledger, asOf),
    };
}
