import {
    compareText,
    type FirmKey,
    firmKeyId,
    firmKeyOf,
    groupByFirmKey,
    paidPayoutCash,
    type UsdCents,
} from '~/lib/prop-accounts/core';
import {
    type NoiseVerdict,
    noiseVerdict,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

import { attemptsOf } from './Attempts';
import {
    fundedSince,
    type LedgerAccount,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
} from './PortfolioLedger';
import { payoutMultiple } from './PortfolioRoi';
import { summarizeCash } from './SpendAndPayouts';

export interface FirmReturn {
    readonly accounts: number;
    readonly accountsWithPayout: number;
    readonly attempts: number;
    readonly firmKey: FirmKey;
    readonly firstPayoutOn: null | string;
    readonly fundedAccounts: number;
    readonly lastPayoutOn: null | string;
    readonly multiple: null | number;
    readonly net: UsdCents;
    readonly payouts: UsdCents;
    readonly spend: UsdCents;
    readonly verdict: NoiseVerdict;
}

export interface FirmReturns {
    readonly firms: readonly FirmReturn[];
}

export function firmReturns(ledger: PortfolioLedger): FirmReturns {
    const groups = groupByFirmKey(
        ledger.resolvedAccounts,
        (entry) => firmKeyOf(entry.row),
    );
    return {
        firms: groups.map(({ firmKey, items }) => {
            const otherAccounts = groups
                .filter((group) => firmKeyId(group.firmKey) !== firmKeyId(firmKey))
                .flatMap((group) => group.items);
            return firmReturn(firmKey, items, otherAccounts);
        }),
    };
}

function asUncertain(estimate: null | SampledEstimate): UncertainValue {
    return estimate ?? { standardError: null, value: 0 };
}

function firmReturn(
    firmKey: FirmKey,
    accounts: readonly LedgerAccount[],
    otherAccounts: readonly LedgerAccount[],
): FirmReturn {
    const fees = accounts.flatMap((entry) => entry.fees);
    const payouts = accounts.flatMap((entry) => entry.payouts);
    const cash = summarizeCash(fees, payouts);
    const paidDates = paidPayoutDates(accounts);
    const ownMean = asUncertain(sampledMean(accounts.map(netCentsOf)));
    const otherMean = asUncertain(sampledMean(otherAccounts.map(netCentsOf)));
    return {
        accounts: accounts.length,
        accountsWithPayout: accounts.filter((entry) =>
            entry.payouts.some((row) => paidPayoutCash(row) !== null),
        ).length,
        attempts: accounts.reduce((sum, entry) => sum + attemptsOf(entry), 0),
        firmKey,
        firstPayoutOn: paidDates.at(0) ?? null,
        fundedAccounts: accounts.filter(
            (entry) => fundedSince(entry) !== null,
        ).length,
        lastPayoutOn: paidDates.at(-1) ?? null,
        multiple: payoutMultiple(cash.payouts, cash.spend),
        net: cash.net,
        payouts: cash.payouts,
        spend: cash.spend,
        verdict: noiseVerdict(ownMean, otherMean, { sharedSeed: false }),
    };
}

function netCentsOf(entry: LedgerAccount): number {
    return summarizeCash(entry.fees, entry.payouts).net;
}

function paidPayoutDates(
    accounts: readonly LedgerAccount[],
): readonly string[] {
    return accounts
        .flatMap((entry) => entry.payouts)
        .flatMap((row) => (row.paidOn === null ? [] : [row.paidOn]))
        .toSorted(compareText);
}
