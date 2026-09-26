import {
    AccountEventKind,
    compareText,
    paidPayoutCash,
} from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';

import {
    fundedSince,
    type LedgerAccount,
    type PortfolioLedger,
} from './PortfolioLedger';

export interface FirmFunnel {
    readonly firmId: FirmId;
    readonly firstPayout: number;
    readonly funded: number;
    readonly movedLive: number;
    readonly passed: number;
    readonly purchased: number;
}

export interface StageFunnel {
    readonly byFirm: readonly FirmFunnel[];
    readonly unresolvedAccounts: number;
}

export function stageFunnel(ledger: PortfolioLedger): StageFunnel {
    const groups = ledger.planGroups();
    const firmIds = [...new Set(groups.map((group) => group.firmId))].toSorted(
        compareText,
    );
    return {
        byFirm: firmIds.map((firmId) => {
            const accounts = groups
                .filter((group) => group.firmId === firmId)
                .flatMap((group) => group.accounts);
            const count = (isMatch: (entry: LedgerAccount) => boolean) =>
                accounts.filter((entry) => isMatch(entry)).length;
            return {
                firmId,
                firstPayout: count((entry) =>
                    entry.payouts.some(
                        (payout) => paidPayoutCash(payout) !== null,
                    ),
                ),
                funded: count((entry) => fundedSince(entry) !== null),
                movedLive: count((entry) =>
                    hasTransition(entry, AccountEventKind.MovedLive),
                ),
                passed: count((entry) =>
                    hasTransition(entry, AccountEventKind.EvalPassed),
                ),
                purchased: count((entry) =>
                    hasTransition(entry, AccountEventKind.Purchased),
                ),
            };
        }),
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

function hasTransition(entry: LedgerAccount, kind: AccountEventKind): boolean {
    return entry.transitions.some((transition) => transition.kind === kind);
}
