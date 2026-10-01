import {
    compareText,
    isoDaysBetween,
    paidPayoutCash,
    RoundStatus,
    sampleAdequacy,
    SampleKind,
    type SampleLevel,
} from '~/lib/prop-accounts/core';
import {
    type LedgerRoundRow,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
} from '~/lib/prop-accounts/metrics';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

const HALFWAY_SHARE = 0.5;
const MOST_SHARE = 0.9;

export interface RoundCycleStats {
    readonly cycleDays: null | SampledEstimate;
    readonly daysTo50Percent: null | SampledEstimate;
    readonly daysTo90Percent: null | SampledEstimate;
    readonly sampleLevel: null | SampleLevel;
}

interface RoundMeasurement {
    readonly cycleDays: number;
    readonly daysTo50: number;
    readonly daysTo90: number;
}

export function roundCycle(
    ledger: PortfolioLedger,
    sampleThresholds: SampleThresholds,
): RoundCycleStats {
    const closedRounds = ledger.rounds.filter(
        (row) => row.status === RoundStatus.Closed,
    );
    const measurements = closedRounds
        .map((round) => measureRound(ledger, round))
        .filter((measurement) => measurement !== null);
    return {
        cycleDays: sampledMean(measurements.map((m) => m.cycleDays)),
        daysTo50Percent: sampledMean(measurements.map((m) => m.daysTo50)),
        daysTo90Percent: sampledMean(measurements.map((m) => m.daysTo90)),
        sampleLevel: sampleAdequacy(
            SampleKind.ClosedRounds,
            measurements.length,
            sampleThresholds,
        ),
    };
}

function daysToShare(
    firstOn: string,
    sortedPayouts: readonly {
        readonly cents: number;
        readonly paidOn: string;
    }[],
    totalCents: number,
    share: number,
): null | number {
    if (totalCents <= 0) return null;
    let cumulative = 0;
    for (const payout of sortedPayouts) {
        cumulative += payout.cents;
        if (cumulative / totalCents >= share) {
            return isoDaysBetween(firstOn, payout.paidOn);
        }
    }
    return null;
}

function measureRound(
    ledger: PortfolioLedger,
    round: LedgerRoundRow,
): null | RoundMeasurement {
    const memberAccounts = ledger.membersOfRound(round.id);
    const firstFeeOn = memberAccounts
        .flatMap((entry) => entry.fees.map((fee) => fee.paidOn))
        .toSorted(compareText)[0];
    const paidPayouts = memberAccounts
        .flatMap((entry) => entry.payouts)
        .flatMap((row) => {
            const paid = paidPayoutCash(row);
            return paid?.paidOn == null
                ? []
                : [{ cents: paid.cents, paidOn: paid.paidOn }];
        })
        .toSorted((a, b) => compareText(a.paidOn, b.paidOn));
    if (firstFeeOn === undefined || paidPayouts.length === 0) return null;
    const lastPayoutOn = paidPayouts.at(-1)?.paidOn;
    if (lastPayoutOn === undefined) return null;
    const totalCents = paidPayouts.reduce((sum, row) => sum + row.cents, 0);
    const daysTo50 = daysToShare(
        firstFeeOn,
        paidPayouts,
        totalCents,
        HALFWAY_SHARE,
    );
    const daysTo90 = daysToShare(
        firstFeeOn,
        paidPayouts,
        totalCents,
        MOST_SHARE,
    );
    if (daysTo50 === null || daysTo90 === null) return null;
    return {
        cycleDays: isoDaysBetween(firstFeeOn, lastPayoutOn),
        daysTo50,
        daysTo90,
    };
}
