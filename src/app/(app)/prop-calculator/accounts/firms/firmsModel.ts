import { type ScaleGate, scaleGateOf } from '~/lib/prop-accounts/bankroll';
import {
    type FirmRoster,
    firmRosterOf,
    type LiveTransferRate,
    liveTransferRate,
} from '~/lib/prop-accounts/firms';
import {
    attemptsOf,
    fundedSince,
    pooledEndedCohortMultiple,
    type PortfolioLedger,
    realizedNetPerSlot,
} from '~/lib/prop-accounts/metrics';
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
    const netPerSlot = realizedNetPerSlot(ledger, asOf);
    const evalAttempts = ledger.accounts.reduce(
        (sum, entry) => sum + attemptsOf(entry),
        0,
    );
    const fundedAccounts = ledger.resolvedAccounts.filter(
        (entry) => fundedSince(entry) !== null,
    ).length;
    return {
        roster: firmRosterOf(ledger),
        scaleGate: scaleGateOf({
            cohortMultiple: pooledEndedCohortMultiple(ledger),
            evalAttempts,
            fundedAccounts,
            pooledNetPerSlot: netPerSlot.pooled,
            thresholds,
            trades,
        }),
        transferRate: liveTransferRate(ledger, asOf),
    };
}
