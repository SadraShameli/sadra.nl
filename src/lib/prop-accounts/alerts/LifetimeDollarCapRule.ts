import {
    AccountStage,
    compareText,
    findStoredFirm,
    formatUsdCents,
    joinWithAnd,
    PayoutStatus,
    PlanKeyResolutionKind,
    sumUsdCents,
    usdCents,
    type UsdCents,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '~/lib/prop-accounts/core';
import {
    effectivePayoutRequest,
    LifetimeCapScope,
    PayoutGate,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator/core';

import { type AccountAlert } from './AccountAlert';
import {
    type AlertContext,
    type AlertSnapshotRow,
    grossDisclosureOf,
    isActive,
    type MonitoredAccount,
    paidLedgerTotal,
    type PayoutLedgerTotal,
    payoutsTakenOf,
    requestedLedgerTotal,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AccountAlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

enum PoolIdentity {
    LedgerOnlyAtFirm = 'ledger-only-at-firm',
    OtherPlan = 'other-plan',
    SamePlan = 'same-plan',
    UnidentifiedAtFirm = 'unidentified-at-firm',
    UnresolvedSamePlan = 'unresolved-same-plan',
}

enum PoolRole {
    Certain = 'certain',
    MovedLive = 'moved-live',
    UnresolvedPlan = 'unresolved-plan',
}

const PER_ACCOUNT_OUTCOME =
    "the engine treats the cap as a hard stop, and profit beyond it can be forfeited (check the firm's rules for this plan)";
const POOLED_OUTCOME =
    "profit beyond the cap can be forfeited (check the firm's rules for this plan), and the calculator's projections apply the cap to one account at a time, so they do not stop at this pooled total";
const PER_USER_POOL =
    'the firm states this cap per user; this alert assumes that means your accounts on this plan only, since the source does not say whether other plans at the firm count, so it pools your funded, moved-live and archived accounts on this plan; other plans and ledger-only accounts are not counted, and an account at a size the calculator does not model can only be tracked as ledger-only';
const PER_ACCOUNT_POOL =
    'the cap applies to each account on its own, so no other account is counted';
const UNCONFIRMED_POOL =
    "the firm's source does not say whether this cap applies per account or per user, so this alert counts this account only, and your other accounts on this plan may count toward the cap too";
const WARNING_ONLY =
    'payouts the alert cannot confirm can raise this warning but never a critical alert';
const NEXT_PAYOUT_THRESHOLD = 'the default threshold is one next payout';
const POOLED_STAGES: ReadonlySet<AccountStage> = new Set([
    AccountStage.Funded,
    AccountStage.Live,
]);

interface CapPool {
    readonly ledgerOnly: readonly MonitoredAccount[];
    readonly members: readonly PoolMember[];
    readonly unidentifiedAccounts: number;
    readonly unreadableArchivedAccounts: number;
}

interface PoolMember {
    readonly isArchived: boolean;
    readonly monitored: MonitoredAccount;
    readonly role: PoolRole;
}

interface ReceivedPayouts {
    readonly accounts: number;
    readonly certainCents: UsdCents;
    readonly countedCents: UsdCents;
    readonly exclusions: readonly string[];
    readonly grossCounted: number;
    readonly movedLiveAccounts: number;
    readonly requestedCents: UsdCents;
    readonly requestedGrossCounted: number;
    readonly undatedGrossCounted: number;
    readonly undatedPaidPayouts: number;
    readonly unresolvedAccounts: number;
}

interface ScopeText {
    readonly outcome: string;
    readonly pool: string;
}

interface UnconfirmedCount {
    readonly full: string;
    readonly short: string;
}

type UndatedPaid = PayoutLedgerTotal & { readonly count: number };

export class LifetimeDollarCapRule extends AccountAlertRule {
    readonly kind = AlertKind.LifetimeDollarCapNear;

    protected evaluateAccount(
        monitored: MonitoredAccount,
        context: AlertContext,
    ): AccountAlert | null {
        if (
            !isActive(monitored) ||
            monitored.account.stage !== AccountStage.Funded ||
            monitored.plan.kind !== PlanKeyResolutionKind.Resolved
        ) {
            return null;
        }
        const plan = monitored.plan.plan;
        const cap = plan.lifetimeConclusion.maxLifetimePayoutDollars;
        const scope = plan.lifetimeConclusion.dollarCapScope;
        if (cap === null || scope === null) return null;
        const taken = payoutsTakenOf(monitored);
        const pool = capPoolOf(monitored, plan, scope, context);
        const received = receivedIn(pool);
        const text = scopeTextOf(scope);
        const tail = [text.outcome, text.pool, ...received.exclusions].join(
            '; ',
        );
        const isAtCap = (cents: UsdCents): boolean =>
            plan.conclusionGate(taken, usdCentsToDollars(cents)) ===
            PayoutGate.LifetimeDollarCapReached;
        const capCents = usdCentsFromDollars(cap);
        const progressOf = (cents: UsdCents): string =>
            `${formatUsdCents(cents)} of the plan's ${formatUsdCents(capCents)} lifetime payout cap received ${scopeOf(received.accounts)}`;
        const unconfirmed = unconfirmedCounts(received);
        if (isAtCap(received.certainCents)) {
            const uncounted =
                unconfirmed.length > 0
                    ? `, not counting ${joinWithAnd(unconfirmed.map((entry) => entry.short))}`
                    : '';
            return this.alertFor(
                monitored,
                AlertSeverity.Critical,
                `${progressOf(received.certainCents)}${uncounted}; no further payout fits under the cap; ${tail}`,
            );
        }
        const disclosures = grossDisclosureOf(
            received.grossCounted +
                received.requestedGrossCounted +
                received.undatedGrossCounted,
        );
        const progress = progressOf(received.countedCents);
        if (isAtCap(received.countedCents)) {
            return this.alertFor(
                monitored,
                AlertSeverity.Warning,
                `${progress}, counting ${joinWithAnd([...grossCountOf(received), ...unconfirmed.map((entry) => entry.full)])}, so the cap may already be reached; ${WARNING_ONLY}; ${tail}`,
                disclosures,
            );
        }
        const committedCents = sumUsdCents([
            received.countedCents,
            received.requestedCents,
        ]);
        const rulebookRequest = usdCentsToDollars(
            usdCents(context.rulebook.payout.requestCents),
        );
        const request = effectivePayoutRequest(plan, rulebookRequest);
        const nextNetCents = usdCentsFromDollars(
            plan.payoutFromProfit(request, taken + requestedCountOf(monitored)),
        );
        if (!isAtCap(sumUsdCents([committedCents, nextNetCents]))) {
            const staleRequestNotice = staleRequestNoticeOf(pool);
            return staleRequestNotice === null
                ? null
                : this.alertFor(
                      monitored,
                      AlertSeverity.Warning,
                      `${staleRequestNotice}; ${text.outcome}; ${text.pool}`,
                  );
        }
        const requested =
            received.requestedCents > 0
                ? `, plus ${formatUsdCents(received.requestedCents)} requested and not yet paid`
                : '';
        const counting =
            unconfirmed.length > 0
                ? `, counting ${joinWithAnd(unconfirmed.map((entry) => entry.full))}`
                : '';
        const leftCents = usdCents(Math.max(0, capCents - committedCents));
        const reach = isAtCap(committedCents)
            ? 'the requested payouts reach the cap'
            : `the next payout would reach the cap: ${requestSourceOf(rulebookRequest, request)} pays ${formatUsdCents(nextNetCents)} after the split (${NEXT_PAYOUT_THRESHOLD})`;
        return this.alertFor(
            monitored,
            AlertSeverity.Warning,
            `${progress}${requested}${counting}, ${formatUsdCents(leftCents)} left; ${reach}; ${tail}`,
            disclosures,
        );
    }
}

function accountsOf(count: number, noun: string): string {
    return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function afterMovedLiveOf(
    monitored: MonitoredAccount,
    cutoff: string,
): PayoutLedgerTotal {
    return paidLedgerTotal(
        monitored.payouts.filter(
            (payout) =>
                payout.paidOn !== null &&
                compareText(payout.paidOn, cutoff) >= 0,
        ),
    );
}

function anchoredFigure(
    ledger: PayoutLedgerTotal,
    snapshot: AlertSnapshotRow,
    afterSnapshot: PayoutLedgerTotal,
): PayoutLedgerTotal {
    if (snapshot.cumulativePayoutCents == null) return ledger;
    const anchored: PayoutLedgerTotal = {
        cents: sumUsdCents([
            snapshot.cumulativePayoutCents,
            afterSnapshot.cents,
        ]),
        grossCounted: afterSnapshot.grossCounted,
        netCents: sumUsdCents([
            snapshot.cumulativePayoutCents,
            afterSnapshot.netCents,
        ]),
    };
    const counted = largerFigure(anchored, ledger);
    return {
        ...counted,
        netCents: usdCents(Math.max(anchored.netCents, ledger.netCents)),
    };
}

function capFamilyOf(id: PlanId): string {
    return 'variant' in id ? `${id.firm}-${id.variant}` : id.firm;
}

function capPoolOf(
    monitored: MonitoredAccount,
    plan: Plan,
    scope: LifetimeCapScope,
    context: AlertContext,
): CapPool {
    switch (scope) {
        case LifetimeCapScope.PerAccount:
        case LifetimeCapScope.Unconfirmed: {
            return {
                ledgerOnly: [],
                members: [
                    { isArchived: false, monitored, role: PoolRole.Certain },
                ],
                unidentifiedAccounts: 0,
                unreadableArchivedAccounts: 0,
            };
        }
        case LifetimeCapScope.PerUserAcrossVariant: {
            return perUserPoolOf(plan, context);
        }
    }
}

function exclusionsOf(pool: CapPool): readonly string[] {
    const staleRequests = staleRequestsIn(pool);
    const movedLiveExclusions = movedLiveExclusionsIn(pool);
    const paidLedgerOnly = pool.ledgerOnly.filter(
        (monitored) => receivedOf(monitored).cents > 0,
    );
    return [
        ...(pool.unidentifiedAccounts > 0
            ? [
                  `not counting ${accountsOf(pool.unidentifiedAccounts, 'account')} at this firm whose plan could not be identified`,
              ]
            : []),
        ...(pool.unreadableArchivedAccounts > 0
            ? [
                  `not counting ${accountsOf(pool.unreadableArchivedAccounts, 'archived account')} whose stored data could not be read`,
              ]
            : []),
        ...(paidLedgerOnly.length > 0
            ? [
                  `not counting ${formatUsdCents(sumUsdCents(paidLedgerOnly.map((monitored) => receivedOf(monitored).cents)))} paid on ${accountsOf(paidLedgerOnly.length, 'ledger-only account')} at this firm that may belong to this plan`,
              ]
            : []),
        ...(movedLiveExclusions.accounts > 0
            ? [
                  `not counting ${formatUsdCents(movedLiveExclusions.cents)} paid on ${accountsOf(movedLiveExclusions.accounts, 'account')} after moving live, since the cap only counts sim-funded payouts`,
              ]
            : []),
        ...(staleRequests.count > 0
            ? [
                  `not counting ${formatUsdCents(staleRequests.cents)} requested on ${accountsOf(staleRequests.count, 'archived account')} and never marked paid or denied`,
              ]
            : []),
    ];
}

function figureOf(
    monitored: MonitoredAccount,
    role: PoolRole,
): PayoutLedgerTotal {
    return role === PoolRole.Certain && monitored.movedLiveOn !== null
        ? receivedBeforeOf(monitored, monitored.movedLiveOn)
        : receivedOf(monitored);
}

function grossCountOf(received: ReceivedPayouts): readonly string[] {
    return received.grossCounted > 0
        ? [
              `${paidPayoutCount(received.grossCounted)} at gross because no net amount is recorded`,
          ]
        : [];
}

function hasPayouts(monitored: MonitoredAccount): boolean {
    return (
        receivedOf(monitored).cents > 0 ||
        requestedCountOf(monitored) > 0 ||
        undatedPaidOf(monitored).cents > 0
    );
}

function identityOf(monitored: MonitoredAccount, plan: Plan): PoolIdentity {
    const family = capFamilyOf(plan.id);
    switch (monitored.plan.kind) {
        case PlanKeyResolutionKind.LedgerOnly: {
            return monitored.account.firmId === plan.id.firm
                ? PoolIdentity.LedgerOnlyAtFirm
                : PoolIdentity.OtherPlan;
        }
        case PlanKeyResolutionKind.Resolved: {
            return capFamilyOf(monitored.plan.plan.id) === family
                ? PoolIdentity.SamePlan
                : PoolIdentity.OtherPlan;
        }
        case PlanKeyResolutionKind.Unresolved: {
            const stored =
                monitored.planKey === null
                    ? null
                    : (findStoredFirm(
                          monitored.planKey.firmId,
                      )?.findPlanBySerial(monitored.planKey.planSerial) ??
                      null);
            if (stored !== null) {
                return capFamilyOf(stored.id) === family
                    ? PoolIdentity.UnresolvedSamePlan
                    : PoolIdentity.OtherPlan;
            }
            return monitored.account.firmId === plan.id.firm
                ? PoolIdentity.UnidentifiedAtFirm
                : PoolIdentity.OtherPlan;
        }
    }
}

function largerFigure(
    left: PayoutLedgerTotal,
    right: PayoutLedgerTotal,
): PayoutLedgerTotal {
    return right.cents > left.cents ? right : left;
}

function movedLiveCount(accounts: number): string {
    return accounts === 1
        ? '1 account that moved live'
        : `${accounts} accounts that moved live`;
}

function movedLiveExclusionsIn(pool: CapPool): {
    readonly accounts: number;
    readonly cents: UsdCents;
} {
    const excludedCents = pool.members.flatMap((member) => {
        const cutoff =
            member.role === PoolRole.Certain
                ? member.monitored.movedLiveOn
                : null;
        if (cutoff === null) return [];
        const cents = afterMovedLiveOf(member.monitored, cutoff).cents;
        return cents > 0 ? cents : [];
    });
    return {
        accounts: excludedCents.length,
        cents: sumUsdCents(excludedCents),
    };
}

function paidPayoutCount(count: number): string {
    return count === 1 ? '1 paid payout' : `${count} paid payouts`;
}

function perUserPoolOf(plan: Plan, context: AlertContext): CapPool {
    const candidates = [
        ...context.accounts.map((monitored) => ({
            isArchived: false,
            monitored,
        })),
        ...context.archivedAccounts.map((monitored) => ({
            isArchived: true,
            monitored,
        })),
    ]
        .filter((candidate) =>
            POOLED_STAGES.has(candidate.monitored.account.stage),
        )
        .map((candidate) => ({
            ...candidate,
            identity: identityOf(candidate.monitored, plan),
        }));
    return {
        ledgerOnly: candidates
            .filter(
                (candidate) =>
                    candidate.identity === PoolIdentity.LedgerOnlyAtFirm,
            )
            .map((candidate) => candidate.monitored),
        members: candidates.flatMap((candidate) => {
            const role = roleOf(candidate.identity, candidate.monitored);
            return role === null
                ? []
                : {
                      isArchived: candidate.isArchived,
                      monitored: candidate.monitored,
                      role,
                  };
        }),
        unidentifiedAccounts: candidates.filter(
            (candidate) =>
                candidate.identity === PoolIdentity.UnidentifiedAtFirm,
        ).length,
        unreadableArchivedAccounts: context.unreadableArchivedAccounts.filter(
            (account) =>
                POOLED_STAGES.has(account.stage) &&
                (account.firmId === null || account.firmId === plan.id.firm),
        ).length,
    };
}

function receivedBeforeOf(
    monitored: MonitoredAccount,
    cutoff: string,
): PayoutLedgerTotal {
    const preCutoffLedger = paidLedgerTotal(
        monitored.payouts.filter(
            (payout) =>
                payout.paidOn !== null &&
                compareText(payout.paidOn, cutoff) < 0,
        ),
    );
    const snapshot = monitored.latestSnapshot;
    if (snapshot?.cumulativePayoutCents == null) return preCutoffLedger;
    if (compareText(snapshot.asOf, cutoff) >= 0) {
        return reconstructedBeforeOf(
            monitored,
            cutoff,
            snapshot,
            snapshot.cumulativePayoutCents,
            preCutoffLedger,
        );
    }
    const afterSnapshotBeforeCutoff = paidLedgerTotal(
        monitored.payouts.filter(
            (payout) =>
                payout.paidOn !== null &&
                compareText(payout.paidOn, snapshot.asOf) > 0 &&
                compareText(payout.paidOn, cutoff) < 0,
        ),
    );
    return anchoredFigure(preCutoffLedger, snapshot, afterSnapshotBeforeCutoff);
}

function receivedIn(pool: CapPool): ReceivedPayouts {
    const figures = pool.members.map((member) => ({
        figure: figureOf(member.monitored, member.role),
        hasPayouts: hasPayouts(member.monitored),
        member,
        undated: undatedPaidOf(member.monitored),
    }));
    const requested = requestedLedgerTotal(
        pool.members
            .filter((member) => !member.isArchived)
            .flatMap((member) => member.monitored.payouts),
    );
    const withPayoutsIn = (role: PoolRole): number =>
        figures.filter(
            (entry) => entry.member.role === role && entry.hasPayouts,
        ).length;
    return {
        accounts: pool.members.length,
        certainCents: sumUsdCents(
            figures
                .filter((entry) => entry.member.role === PoolRole.Certain)
                .map((entry) => entry.figure.netCents),
        ),
        countedCents: sumUsdCents(
            figures.flatMap((entry) => [
                entry.figure.cents,
                entry.undated.cents,
            ]),
        ),
        exclusions: exclusionsOf(pool),
        grossCounted: figures.reduce(
            (total, entry) => total + entry.figure.grossCounted,
            0,
        ),
        movedLiveAccounts: withPayoutsIn(PoolRole.MovedLive),
        requestedCents: requested.cents,
        requestedGrossCounted: requested.grossCounted,
        undatedGrossCounted: figures.reduce(
            (total, entry) => total + entry.undated.grossCounted,
            0,
        ),
        undatedPaidPayouts: figures.reduce(
            (total, entry) => total + entry.undated.count,
            0,
        ),
        unresolvedAccounts: withPayoutsIn(PoolRole.UnresolvedPlan),
    };
}

function receivedOf(monitored: MonitoredAccount): PayoutLedgerTotal {
    const ledger = paidLedgerTotal(monitored.payouts);
    const snapshot = monitored.latestSnapshot;
    if (snapshot?.cumulativePayoutCents == null) return ledger;
    const afterSnapshot = paidLedgerTotal(
        monitored.payouts.filter(
            (payout) =>
                payout.paidOn !== null &&
                compareText(payout.paidOn, snapshot.asOf) > 0,
        ),
    );
    return anchoredFigure(ledger, snapshot, afterSnapshot);
}

function reconstructedBeforeOf(
    monitored: MonitoredAccount,
    cutoff: string,
    snapshot: AlertSnapshotRow,
    cumulativePayoutCents: UsdCents,
    preCutoffLedger: PayoutLedgerTotal,
): PayoutLedgerTotal {
    const datedSinceCutoffThroughSnapshot = paidLedgerTotal(
        monitored.payouts.filter(
            (payout) =>
                payout.paidOn !== null &&
                compareText(payout.paidOn, cutoff) >= 0 &&
                compareText(payout.paidOn, snapshot.asOf) <= 0,
        ),
    );
    const reconstructed: PayoutLedgerTotal = {
        cents: usdCents(
            Math.max(
                0,
                cumulativePayoutCents - datedSinceCutoffThroughSnapshot.cents,
            ),
        ),
        grossCounted: 0,
        netCents: usdCents(
            Math.max(
                0,
                cumulativePayoutCents -
                    datedSinceCutoffThroughSnapshot.netCents,
            ),
        ),
    };
    const counted = largerFigure(reconstructed, preCutoffLedger);
    return {
        ...counted,
        netCents: usdCents(
            Math.max(reconstructed.netCents, preCutoffLedger.netCents),
        ),
    };
}

function requestedCountOf(monitored: MonitoredAccount): number {
    return monitored.payouts.filter(
        (payout) => payout.status === PayoutStatus.Requested,
    ).length;
}

function requestSourceOf(rulebookRequest: number, request: number): string {
    const rulebook = `your rulebook request of ${formatUsdCents(usdCentsFromDollars(rulebookRequest))}`;
    return request > rulebookRequest
        ? `${rulebook}, raised to the plan's ${formatUsdCents(usdCentsFromDollars(request))} minimum,`
        : rulebook;
}

function roleOf(
    identity: PoolIdentity,
    monitored: MonitoredAccount,
): null | PoolRole {
    switch (identity) {
        case PoolIdentity.LedgerOnlyAtFirm:
        case PoolIdentity.OtherPlan:
        case PoolIdentity.UnidentifiedAtFirm: {
            return null;
        }
        case PoolIdentity.SamePlan: {
            if (monitored.account.stage !== AccountStage.Live) {
                return PoolRole.Certain;
            }
            return monitored.movedLiveOn === null
                ? PoolRole.MovedLive
                : PoolRole.Certain;
        }
        case PoolIdentity.UnresolvedSamePlan: {
            return PoolRole.UnresolvedPlan;
        }
    }
}

function scopeOf(accounts: number): string {
    return accounts === 1
        ? 'on this account'
        : `across your ${accounts} accounts on this plan`;
}

function scopeTextOf(scope: LifetimeCapScope): ScopeText {
    switch (scope) {
        case LifetimeCapScope.PerAccount: {
            return { outcome: PER_ACCOUNT_OUTCOME, pool: PER_ACCOUNT_POOL };
        }
        case LifetimeCapScope.PerUserAcrossVariant: {
            return { outcome: POOLED_OUTCOME, pool: PER_USER_POOL };
        }
        case LifetimeCapScope.Unconfirmed: {
            return { outcome: PER_ACCOUNT_OUTCOME, pool: UNCONFIRMED_POOL };
        }
    }
}

function staleRequestNoticeOf(pool: CapPool): null | string {
    const staleRequests = staleRequestsIn(pool);
    return staleRequests.count === 0
        ? null
        : `${formatUsdCents(staleRequests.cents)} requested on ${accountsOf(staleRequests.count, 'archived account')} on this plan was never marked paid or denied; mark it paid or denied to keep the lifetime cap total accurate`;
}

function staleRequestsIn(pool: CapPool): { cents: UsdCents; count: number } {
    const staleRequests = pool.members.filter(
        (member) => member.isArchived && requestedCountOf(member.monitored) > 0,
    );
    return {
        cents: sumUsdCents(
            staleRequests.map(
                (member) =>
                    requestedLedgerTotal(member.monitored.payouts).cents,
            ),
        ),
        count: staleRequests.length,
    };
}

function unconfirmedCounts(
    received: ReceivedPayouts,
): readonly UnconfirmedCount[] {
    return [
        ...(received.movedLiveAccounts > 0
            ? [
                  unconfirmedOf(
                      `the payouts of ${movedLiveCount(received.movedLiveAccounts)}`,
                      ', which may include live payouts the cap does not count, because the alert does not know when each account moved live',
                  ),
              ]
            : []),
        ...(received.unresolvedAccounts > 0
            ? [
                  unconfirmedOf(
                      `the payouts of ${accountsOf(received.unresolvedAccounts, 'account')} on this plan whose stored plan could not be resolved`,
                  ),
              ]
            : []),
        ...(received.undatedPaidPayouts > 0
            ? [
                  unconfirmedOf(
                      `${paidPayoutCount(received.undatedPaidPayouts)} with an invalid stored date`,
                  ),
              ]
            : []),
    ];
}

function unconfirmedOf(short: string, detail = ''): UnconfirmedCount {
    return { full: `${short}${detail}`, short };
}

function undatedPaidOf(monitored: MonitoredAccount): UndatedPaid {
    return {
        ...paidLedgerTotal(monitored.undatedPayouts),
        count: monitored.undatedPayouts.filter(
            (payout) => payout.status === PayoutStatus.Paid,
        ).length,
    };
}
