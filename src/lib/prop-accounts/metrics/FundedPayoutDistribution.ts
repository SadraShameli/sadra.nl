import {
    isEndedStatus,
    isoDaysBetween,
    paidPayoutCash,
} from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';

import {
    finalState,
    fundedSince,
    type LedgerAccount,
    type PlanGroup,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
} from './PortfolioLedger';

export const PAYOUT_COUNT_CAP = 10;

export interface FundedPayoutDistribution {
    readonly horizonDays: number;
    readonly perPlan: readonly PlanPayoutCountDistribution[];
}

export interface PlanPayoutCountDistribution {
    readonly counts: readonly number[];
    readonly firmId: FirmId;
    readonly openAccounts: number;
    readonly planSerial: string;
    readonly realizedFundedValue: null | SampledEstimate;
}

export function fundedPayoutDistribution(
    ledger: PortfolioLedger,
    asOfDate: string,
    horizonDays: number,
): FundedPayoutDistribution {
    return {
        horizonDays,
        perPlan: ledger
            .planGroups()
            .map((group) => distributionOf(group, asOfDate, horizonDays)),
    };
}

export function isHorizonMaturedCohort(
    entry: LedgerAccount,
    fundedOn: string,
    asOfDate: string,
    horizonDays: number,
): boolean {
    const status = finalState(entry)?.status;
    const isEnded = status !== undefined && isEndedStatus(status);
    return (
        paidCountWithinHorizon(entry, fundedOn, horizonDays) > 0 ||
        isEnded ||
        isoDaysBetween(fundedOn, asOfDate) >= horizonDays
    );
}

export function paidCountWithinHorizon(
    entry: LedgerAccount,
    fundedOn: string,
    horizonDays: number,
): number {
    return entry.payouts.filter((row) => {
        const paid = paidPayoutCash(row);
        if (!paid?.paidOn) return false;
        const lag = isoDaysBetween(fundedOn, paid.paidOn);
        return lag >= 0 && lag <= horizonDays;
    }).length;
}

function distributionOf(
    group: PlanGroup,
    asOfDate: string,
    horizonDays: number,
): PlanPayoutCountDistribution {
    const counts: number[] = Array.from(
        { length: PAYOUT_COUNT_CAP + 1 },
        () => 0,
    );
    const values: number[] = [];
    let openAccounts = 0;
    for (const entry of group.accounts) {
        const funded = fundedSince(entry);
        if (funded === null) continue;
        if (!isHorizonMaturedCohort(entry, funded.on, asOfDate, horizonDays)) {
            openAccounts += 1;
            continue;
        }
        const k = paidCountWithinHorizon(entry, funded.on, horizonDays);
        const bucket = counts[Math.min(k, PAYOUT_COUNT_CAP)];
        counts[Math.min(k, PAYOUT_COUNT_CAP)] = (bucket ?? 0) + 1;
        values.push(paidCentsWithinHorizon(entry, funded.on, horizonDays));
    }
    return {
        counts,
        firmId: group.firmId,
        openAccounts,
        planSerial: group.planSerial,
        realizedFundedValue: sampledMean(values),
    };
}

function paidCentsWithinHorizon(
    entry: LedgerAccount,
    fundedOn: string,
    horizonDays: number,
): number {
    return entry.payouts.reduce((sum, row) => {
        const paid = paidPayoutCash(row);
        if (!paid?.paidOn) return sum;
        const lag = isoDaysBetween(fundedOn, paid.paidOn);
        return lag >= 0 && lag <= horizonDays ? sum + paid.cents : sum;
    }, 0);
}
