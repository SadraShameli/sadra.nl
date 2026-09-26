import {
    AccountStage,
    compareText,
    type StoredFirmId,
    sumUsdCents,
    type UsdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';

import {
    isActiveAccount,
    type LedgerAccountRow,
    type PortfolioLedger,
} from './PortfolioLedger';

export interface FirmFunding {
    readonly byStage: FundingByStage;
    readonly firmId: StoredFirmId;
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
    const firmIds = [...new Set(active.map((row) => row.firmId))].toSorted(
        compareText,
    );
    const byStage = fundingByStage(active);
    return {
        byFirm: firmIds.map((firmId) => ({
            byStage: fundingByStage(
                active.filter((row) => row.firmId === firmId),
            ),
            firmId,
        })),
        byStage,
        evalNominal: byStage[AccountStage.Eval].nominal,
        fundedNominal: fundedNominalOf(byStage),
    };
}

function fundingByStage(rows: readonly LedgerAccountRow[]): FundingByStage {
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
