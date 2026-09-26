import {
    compareText,
    daysInIsoMonth,
    type FirmKey,
    firmKeyId,
    firmKeyOf,
    isEndedStatus,
    isoMonthOf,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import { percentile } from '~/lib/prop-calculator/stats';

import {
    earliestActivityMonth,
    filledMonths,
} from './MonthlyStatement';
import {
    finalState,
    type LedgerAccount,
    type PortfolioLedger,
} from './PortfolioLedger';
import { payoutMultiple } from './PortfolioRoi';
import { summarizeCash } from './SpendAndPayouts';

const BOOTSTRAP_RESAMPLES = 500;
const BOOTSTRAP_SEED = 20_260_926;
const INTERVAL_LOWER_PERCENTILE = 10;
const INTERVAL_UPPER_PERCENTILE = 90;

export interface BootstrapInterval {
    readonly lower: number;
    readonly upper: number;
}

export interface CohortMultiple {
    readonly interval: BootstrapInterval;
    readonly n: number;
    readonly value: null | number;
}

export interface PurchaseCohort {
    readonly endedAccounts: number;
    readonly inProgressCount: number;
    readonly payouts: UsdCents;
    readonly realizedMultiple: CohortMultiple | null;
    readonly spend: UsdCents;
    readonly toDateMultiple: null | number;
}

export interface PurchaseCohortMonth extends PurchaseCohort {
    readonly month: string;
}

export function cohortByPurchaseWindow(
    ledger: PortfolioLedger,
    from: string,
    to: string,
    firmKey?: FirmKey,
): PurchaseCohort {
    const accounts = ledger.resolvedAccounts.filter(
        (entry) =>
            compareText(entry.row.purchasedOn, from) >= 0 &&
            compareText(entry.row.purchasedOn, to) <= 0 &&
            (firmKey === undefined ||
                firmKeyId(firmKeyOf(entry.row)) === firmKeyId(firmKey)),
    );
    const ended = accounts.filter(isEnded);
    const cash = summarizeCash(
        accounts.flatMap((entry) => entry.fees),
        accounts.flatMap((entry) => entry.payouts),
    );
    return {
        endedAccounts: ended.length,
        inProgressCount: accounts.length - ended.length,
        payouts: cash.payouts,
        realizedMultiple: bootstrapCohortMultiple(ended),
        spend: cash.spend,
        toDateMultiple: payoutMultiple(cash.payouts, cash.spend),
    };
}

export function pooledEndedCohortMultiple(
    ledger: PortfolioLedger,
): CohortMultiple | null {
    return bootstrapCohortMultiple(
        ledger.resolvedAccounts.filter(isEnded),
    );
}

export function purchaseCohorts(
    ledger: PortfolioLedger,
    asOf: string,
): readonly PurchaseCohortMonth[] {
    const months = filledMonths(earliestActivityMonth(ledger), isoMonthOf(asOf));
    return months.map((month) => ({
        month,
        ...cohortByPurchaseWindow(
            ledger,
            `${month}-01`,
            `${month}-${String(daysInIsoMonth(month)).padStart(2, '0')}`,
        ),
    }));
}

function accountNetCents(entry: LedgerAccount): {
    readonly payouts: number;
    readonly spend: number;
} {
    const cash = summarizeCash(entry.fees, entry.payouts);
    return { payouts: cash.payouts, spend: cash.spend };
}

function bootstrapCohortMultiple(
    accounts: readonly LedgerAccount[],
): CohortMultiple | null {
    if (accounts.length === 0) return null;
    const cash = accounts.map(accountNetCents);
    const value = payoutMultiple(
        usdCents(cash.reduce((sum, c) => sum + c.payouts, 0)),
        usdCents(cash.reduce((sum, c) => sum + c.spend, 0)),
    );
    const rng = mulberry32(BOOTSTRAP_SEED);
    const resampleValues: number[] = [];
    for (let sample = 0; sample < BOOTSTRAP_RESAMPLES; sample += 1) {
        const draws = Array.from(
            { length: cash.length },
            () => cash[Math.floor(rng() * cash.length)],
        );
        const spend = draws.reduce((sum, pick) => sum + (pick?.spend ?? 0), 0);
        const payouts = draws.reduce(
            (sum, pick) => sum + (pick?.payouts ?? 0),
            0,
        );
        resampleValues.push(spend === 0 ? 0 : payouts / spend);
    }
    return {
        interval: {
            lower: percentile(resampleValues, INTERVAL_LOWER_PERCENTILE),
            upper: percentile(resampleValues, INTERVAL_UPPER_PERCENTILE),
        },
        n: accounts.length,
        value,
    };
}

function isEnded(entry: LedgerAccount): boolean {
    const status = finalState(entry)?.status;
    return status !== undefined && isEndedStatus(status);
}
