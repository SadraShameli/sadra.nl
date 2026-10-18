import {
    AccountStage,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
    sumUsdCents,
    type UsdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';

import {
    isActiveAccount,
    type LedgerAccount,
    type PortfolioLedger,
} from './PortfolioLedger';

export interface FirmFunding {
    readonly byStage: FundingByStage;
    readonly firmKey: FirmKey;
}

export type FundingByStage = Readonly<Record<AccountStage, StageFunding>>;

export interface FundingTotals {
    readonly byFirm: readonly FirmFunding[];
    readonly byStage: FundingByStage;
    readonly evalNominal: UsdCents;
    readonly fundedNominal: UsdCents;
}

export interface StageFunding {
    readonly accounts: number;
    readonly nominal: UsdCents;
}

export function fundedNominalOf(byStage: FundingByStage): UsdCents {
    return sumUsdCents([
        byStage[AccountStage.Funded].nominal,
        byStage[AccountStage.Live].nominal,
    ]);
}

export function fundingTotals(ledger: PortfolioLedger): FundingTotals {
    const active = ledger.accounts
        .map((entry) => entry.row)
        .filter((row) => isActiveAccount(row));
    const byStage = fundingByStage(active);
    return {
        byFirm: groupByFirmKey(active, (row) => firmKeyOf(row)).map(
            ({ firmKey, items }) => ({
                byStage: fundingByStage(items),
                firmKey,
            }),
        ),
        byStage,
        evalNominal: byStage[AccountStage.Eval].nominal,
        fundedNominal: fundedNominalOf(byStage),
    };
}

function fundingByStage(rows: readonly LedgerAccount['row'][]): FundingByStage {
    const stageFunding = (stage: AccountStage): StageFunding => {
        const inStage = rows.filter((row) => row.stage === stage);
        return {
            accounts: inStage.length,
            nominal: sumUsdCents(
                inStage.map((row) => usdCentsFromDollars(row.accountSize)),
            ),
        };
    };
    return {
        [AccountStage.Eval]: stageFunding(AccountStage.Eval),
        [AccountStage.Funded]: stageFunding(AccountStage.Funded),
        [AccountStage.Live]: stageFunding(AccountStage.Live),
    };
}
