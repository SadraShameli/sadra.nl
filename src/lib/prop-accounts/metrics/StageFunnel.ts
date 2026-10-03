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

import { attemptsOf, isFundedAccount } from './Attempts';
import { independentSampleCount } from './IndependentSamples';
import {
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

export interface FirmFunnel extends PerStage<number> {
    readonly attempts: number;
    readonly feesCents: UsdCents;
    readonly firmKey: FirmKey;
    readonly independent: PerStage<number>;
    readonly netCents: UsdCents;
    readonly netPayoutsCents: UsdCents;
    readonly stages: PerStage<StageDollars>;
}

export interface StageFunnel {
    readonly byFirm: readonly FirmFunnel[];
    readonly ledgerOnlyAccounts: number;
    readonly unresolvedAccounts: number;
}

interface PerStage<T> {
    readonly firstPayout: T;
    readonly funded: T;
    readonly movedLive: T;
    readonly passed: T;
    readonly purchased: T;
}

interface StageDollars {
    readonly feesCents: UsdCents;
    readonly netCents: UsdCents;
    readonly netPayoutsCents: UsdCents;
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
            const members = stageMembersOf(items);
            const totals = dollarsOf(items);
            return {
                attempts: items.reduce(
                    (total, entry) => total + attemptsOf(entry),
                    0,
                ),
                feesCents: totals.feesCents,
                firmKey,
                firstPayout: members.firstPayout.length,
                funded: members.funded.length,
                independent: mapStages(members, (accounts) =>
                    independentSampleCount(
                        accounts.map((entry) => ({
                            copyGroupId: entry.row.copyGroupId,
                            purchasedOn: entry.row.purchasedOn,
                        })),
                    ),
                ),
                movedLive: members.movedLive.length,
                netCents: totals.netCents,
                netPayoutsCents: totals.netPayoutsCents,
                passed: members.passed.length,
                purchased: members.purchased.length,
                stages: mapStages(members, dollarsOf),
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

function countedAccounts(ledger: PortfolioLedger): readonly LedgerAccount[] {
    return [
        ...ledger.planGroups().flatMap((group) => group.accounts),
        ...ledger.ledgerOnlyAccounts,
    ];
}

function dollarsOf(accounts: readonly LedgerAccount[]): StageDollars {
    const feesCents = sumUsdCents(
        accounts.flatMap((entry) => entry.fees.map(signedFeeCents)),
    );
    const netPayoutsCents = sumUsdCents(
        accounts.flatMap((entry) =>
            entry.payouts.flatMap((row) => {
                const paid = paidPayoutCash(row);
                return paid === null ? [] : [paid.cents];
            }),
        ),
    );
    return {
        feesCents,
        netCents: usdCents(netPayoutsCents - feesCents),
        netPayoutsCents,
    };
}

function hasMovedLive(entry: LedgerAccount): boolean {
    switch (entry.row.tracking) {
        case AccountTracking.LedgerOnly: {
            return entry.row.stage === AccountStage.Live;
        }
        case AccountTracking.Modeled: {
            return hasTransition(entry, AccountEventKind.MovedLive);
        }
    }
}

function hasPaidPayout(entry: LedgerAccount): boolean {
    return entry.payouts.some((payout) => paidPayoutCash(payout) !== null);
}

function hasPurchased(entry: LedgerAccount): boolean {
    switch (entry.row.tracking) {
        case AccountTracking.LedgerOnly: {
            return true;
        }
        case AccountTracking.Modeled: {
            return hasTransition(entry, AccountEventKind.Purchased);
        }
    }
}

function hasTransition(entry: LedgerAccount, kind: AccountEventKind): boolean {
    return entry.transitions.some((transition) => transition.kind === kind);
}

function isWithinWindow(date: string, start: string, end: string): boolean {
    return compareText(date, start) >= 0 && compareText(date, end) <= 0;
}

function mapStages<T>(
    members: PerStage<readonly LedgerAccount[]>,
    project: (accounts: readonly LedgerAccount[]) => T,
): PerStage<T> {
    return {
        firstPayout: project(members.firstPayout),
        funded: project(members.funded),
        movedLive: project(members.movedLive),
        passed: project(members.passed),
        purchased: project(members.purchased),
    };
}

function stageMembersOf(
    items: readonly LedgerAccount[],
): PerStage<readonly LedgerAccount[]> {
    return {
        firstPayout: items.filter(hasPaidPayout),
        funded: items.filter(isFundedAccount),
        movedLive: items.filter((entry) => hasMovedLive(entry)),
        passed: items.filter((entry) =>
            hasTransition(entry, AccountEventKind.EvalPassed),
        ),
        purchased: items.filter((entry) => hasPurchased(entry)),
    };
}
