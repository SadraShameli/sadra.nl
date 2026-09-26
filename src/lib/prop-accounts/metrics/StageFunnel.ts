import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
    paidPayoutCash,
    sumUsdCents,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts/core';

import { attemptsOf } from './Attempts';
import {
    fundedSince,
    type LedgerAccount,
    type PortfolioLedger,
    signedFeeCents,
} from './PortfolioLedger';

export interface FirmFunnel {
    readonly attempts: number;
    readonly feesCents: UsdCents;
    readonly firmKey: FirmKey;
    readonly firstPayout: number;
    readonly funded: number;
    readonly movedLive: number;
    readonly netCents: UsdCents;
    readonly netPayoutsCents: UsdCents;
    readonly passed: number;
    readonly purchased: number;
}

export interface StageFunnel {
    readonly byFirm: readonly FirmFunnel[];
    readonly ledgerOnlyAccounts: number;
    readonly unresolvedAccounts: number;
}

interface FunnelFacts {
    readonly firstPayout: boolean;
    readonly funded: boolean;
    readonly movedLive: boolean;
    readonly passed: boolean;
    readonly purchased: boolean;
}

export function stageFunnel(ledger: PortfolioLedger): StageFunnel {
    const counted = [
        ...ledger.planGroups().flatMap((group) => group.accounts),
        ...ledger.ledgerOnlyAccounts,
    ];
    return {
        byFirm: groupByFirmKey(counted, (entry) => firmKeyOf(entry.row)).map(
            ({ firmKey, items }) => {
                const facts = items.map((entry) => funnelFacts(entry));
                const count = (stage: keyof FunnelFacts) =>
                    facts.filter((fact) => fact[stage]).length;
                const feesCents = sumUsdCents(
                    items.flatMap((entry) => entry.fees.map(signedFeeCents)),
                );
                const netPayoutsCents = sumUsdCents(
                    items.flatMap((entry) =>
                        entry.payouts.flatMap((row) => {
                            const paid = paidPayoutCash(row);
                            return paid === null ? [] : [paid.cents];
                        }),
                    ),
                );
                return {
                    attempts: items.reduce(
                        (total, entry) => total + attemptsFor(entry),
                        0,
                    ),
                    feesCents,
                    firmKey,
                    firstPayout: count('firstPayout'),
                    funded: count('funded'),
                    movedLive: count('movedLive'),
                    netCents: usdCents(netPayoutsCents - feesCents),
                    netPayoutsCents,
                    passed: count('passed'),
                    purchased: count('purchased'),
                };
            },
        ),
        ledgerOnlyAccounts: ledger.ledgerOnlyAccounts.length,
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

function attemptsFor(entry: LedgerAccount): number {
    return entry.row.tracking === AccountTracking.LedgerOnly
        ? 1
        : attemptsOf(entry);
}

function funnelFacts(entry: LedgerAccount): FunnelFacts {
    const hasPaidPayout = entry.payouts.some(
        (payout) => paidPayoutCash(payout) !== null,
    );
    switch (entry.row.tracking) {
        case AccountTracking.LedgerOnly: {
            return {
                firstPayout: hasPaidPayout,
                funded: hasPaidPayout || entry.row.stage !== AccountStage.Eval,
                movedLive: entry.row.stage === AccountStage.Live,
                passed: false,
                purchased: true,
            };
        }
        case AccountTracking.Modeled: {
            return {
                firstPayout: hasPaidPayout,
                funded: fundedSince(entry) !== null,
                movedLive: hasTransition(entry, AccountEventKind.MovedLive),
                passed: hasTransition(entry, AccountEventKind.EvalPassed),
                purchased: hasTransition(entry, AccountEventKind.Purchased),
            };
        }
    }
}

function hasTransition(entry: LedgerAccount, kind: AccountEventKind): boolean {
    return entry.transitions.some((transition) => transition.kind === kind);
}
