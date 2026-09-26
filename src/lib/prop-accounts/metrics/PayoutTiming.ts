import {
    compareText,
    isoDaysBetween,
    paidPayoutCash,
} from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';

import {
    fundedSince,
    type LedgerAccount,
    type PlanGroup,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
} from './PortfolioLedger';

export interface PayoutTiming {
    readonly perPlan: readonly PlanPayoutTiming[];
}

export interface PlanPayoutTiming {
    readonly betweenPayouts: null | SampledEstimate;
    readonly firmId: FirmId;
    readonly planSerial: string;
    readonly toFirstPayout: null | SampledEstimate;
}

export function payoutTiming(ledger: PortfolioLedger): PayoutTiming {
    return {
        perPlan: ledger.planGroups().map((group) => planPayoutTiming(group)),
    };
}

function paidDatesOf(entry: LedgerAccount): readonly string[] {
    return entry.payouts
        .map((row) => paidPayoutCash(row))
        .flatMap((paid) => (paid?.paidOn ? [paid.paidOn] : []))
        .toSorted(compareText);
}

function paidDatesSinceFunded(
    entry: LedgerAccount,
    fundedOn: string,
): readonly string[] {
    return paidDatesOf(entry).filter(
        (paidOn) => isoDaysBetween(fundedOn, paidOn) >= 0,
    );
}

function planPayoutTiming(group: PlanGroup): PlanPayoutTiming {
    const toFirst: number[] = [];
    const between: number[] = [];
    for (const entry of group.accounts) {
        const funded = fundedSince(entry);
        if (funded === null) continue;
        const paidDates = paidDatesSinceFunded(entry, funded.on);
        const first = paidDates[0];
        if (first !== undefined) {
            toFirst.push(isoDaysBetween(funded.on, first));
        }
        for (let index = 1; index < paidDates.length; index += 1) {
            const previous = paidDates[index - 1];
            const current = paidDates[index];
            if (previous !== undefined && current !== undefined) {
                between.push(isoDaysBetween(previous, current));
            }
        }
    }
    return {
        betweenPayouts: sampledMean(between),
        firmId: group.firmId,
        planSerial: group.planSerial,
        toFirstPayout: sampledMean(toFirst),
    };
}
