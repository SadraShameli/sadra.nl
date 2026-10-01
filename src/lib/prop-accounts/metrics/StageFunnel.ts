import {
    type BustDiagnosis,
    type BustDiagnosisDecision,
    BustDiagnosisKind,
    bustDiagnosisOf,
    type BustDiagnosisViolation,
} from '~/lib/prop-accounts/conduct';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    BustCause,
    compareText,
    type FirmKey,
    firmKeyId,
    firmKeyOf,
    groupByFirmKey,
    paidPayoutCash,
    readAccountEventDetail,
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

export interface AccountBustDecision extends BustAttemptDecision {
    readonly accountId: string;
}

export interface AccountBustViolation extends BustDiagnosisViolation {
    readonly accountId: string;
}

export interface BustAttempt {
    readonly events: readonly BustAttemptEvent[];
    readonly purchasedOn: string;
}

export interface BustAttemptDecision extends BustDiagnosisDecision {
    readonly decidedOn: string;
}

export interface BustAttemptEvent {
    readonly detail?: unknown;
    readonly kind: AccountEventKind;
    readonly occurredOn: string;
}

export interface BustSplit {
    readonly structuralBusts: number;
    readonly unknownBusts: number;
    readonly withinPlanBusts: number;
}

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

export function bustDiagnosisOfAttempt(
    attempt: BustAttempt,
    decisions: readonly BustAttemptDecision[],
    violations: readonly BustDiagnosisViolation[],
): BustDiagnosis | null {
    const bustEvent = attempt.events
        .filter((event) => event.kind === AccountEventKind.Busted)
        .toSorted((a, b) => compareText(b.occurredOn, a.occurredOn))[0];
    if (bustEvent === undefined) return null;
    const windowStart = attempt.purchasedOn;
    const windowEnd = bustEvent.occurredOn;
    return bustDiagnosisOf({
        bustCause:
            readAccountEventDetail(bustEvent.detail ?? {}).bustCause ??
            BustCause.Unknown,
        decisions: decisions
            .filter((decision) =>
                isWithinWindow(decision.decidedOn, windowStart, windowEnd),
            )
            .map((decision) => ({
                acceptedRiskCents: decision.acceptedRiskCents,
                actualRiskCents: decision.actualRiskCents,
            })),
        violations: violations
            .filter((violation) =>
                isWithinWindow(violation.occurredOn, windowStart, windowEnd),
            )
            .map((violation) => ({
                kind: violation.kind,
                occurredOn: violation.occurredOn,
            })),
    });
}

export function bustSplitByFirm(
    ledger: PortfolioLedger,
    decisions: readonly AccountBustDecision[],
    violations: readonly AccountBustViolation[],
): ReadonlyMap<string, BustSplit> {
    const violationsByAccount = Map.groupBy(
        violations,
        (violation) => violation.accountId,
    );
    const decisionsByAccount = Map.groupBy(
        decisions,
        (decision) => decision.accountId,
    );
    const byFirm = new Map<string, BustSplit>();
    for (const entry of countedAccounts(ledger)) {
        if (entry.row.status !== AccountStatus.Busted) continue;
        const key = firmKeyId(firmKeyOf(entry.row));
        const kind =
            bustDiagnosisOfAttempt(
                { events: entry.events, purchasedOn: entry.row.purchasedOn },
                decisionsByAccount.get(entry.row.id) ?? [],
                violationsByAccount.get(entry.row.id) ?? [],
            )?.kind ?? BustDiagnosisKind.Unknown;
        byFirm.set(
            key,
            addBustCount(
                byFirm.get(key) ?? {
                    structuralBusts: 0,
                    unknownBusts: 0,
                    withinPlanBusts: 0,
                },
                kind,
            ),
        );
    }
    return byFirm;
}

export function stageFunnel(ledger: PortfolioLedger): StageFunnel {
    return {
        byFirm: groupByFirmKey(countedAccounts(ledger), (entry) =>
            firmKeyOf(entry.row),
        ).map(({ firmKey, items }) => {
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
        }),
        ledgerOnlyAccounts: ledger.ledgerOnlyAccounts.length,
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

function addBustCount(counts: BustSplit, kind: BustDiagnosisKind): BustSplit {
    switch (kind) {
        case BustDiagnosisKind.Structural: {
            return { ...counts, structuralBusts: counts.structuralBusts + 1 };
        }
        case BustDiagnosisKind.Unknown: {
            return { ...counts, unknownBusts: counts.unknownBusts + 1 };
        }
        case BustDiagnosisKind.WithinPlan: {
            return { ...counts, withinPlanBusts: counts.withinPlanBusts + 1 };
        }
    }
}

function attemptsFor(entry: LedgerAccount): number {
    return entry.row.tracking === AccountTracking.LedgerOnly
        ? 1
        : attemptsOf(entry);
}

function countedAccounts(ledger: PortfolioLedger): readonly LedgerAccount[] {
    return [
        ...ledger.planGroups().flatMap((group) => group.accounts),
        ...ledger.ledgerOnlyAccounts,
    ];
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

function isWithinWindow(date: string, start: string, end: string): boolean {
    return compareText(date, start) >= 0 && compareText(date, end) <= 0;
}
