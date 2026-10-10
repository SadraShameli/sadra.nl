import {
    compareText,
    isEndedStatus,
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
    readonly endedWithoutPayout: number;
    readonly firmId: FirmId;
    readonly fundedWithoutPayout: number;
    readonly oldestUnpaidDays: null | number;
    readonly planSerial: string;
    readonly toFirstPayout: null | SampledEstimate;
}

export function payoutTiming(
    ledger: PortfolioLedger,
    today: string,
): PayoutTiming {
    return {
        perPlan: ledger
            .planGroups()
            .map((group) => planPayoutTiming(group, today)),
    };
}

function paidDatesOf(entry: LedgerAccount): readonly string[] {
    return entry.payouts
        .map((row) => paidPayoutCash(row)?.paidOn)
        .filter((paidOn): paidOn is string => Boolean(paidOn))
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

function planPayoutTiming(group: PlanGroup, today: string): PlanPayoutTiming {
    const toFirst: number[] = [];
    const between: number[] = [];
    const unpaidDays: number[] = [];
    let endedWithoutPayout = 0;
    for (const entry of group.accounts) {
        const funded = fundedSince(entry);
        if (funded === null) continue;
        const paidDates = paidDatesSinceFunded(entry, funded.on);
        const first = paidDates[0];
        if (first === undefined) {
            if (isEndedStatus(entry.row.status)) {
                endedWithoutPayout += 1;
            } else {
                unpaidDays.push(Math.max(0, isoDaysBetween(funded.on, today)));
            }
        } else {
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
        endedWithoutPayout,
        firmId: group.firmId,
        fundedWithoutPayout: unpaidDays.length,
        oldestUnpaidDays:
            unpaidDays.length === 0 ? null : Math.max(...unpaidDays),
        planSerial: group.planSerial,
        toFirstPayout: sampledMean(toFirst),
    };
}
