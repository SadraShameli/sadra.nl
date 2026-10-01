import type {
    PropAccountEventRow,
    PropAccountRow,
    PropBankrollTransferRow,
    PropFeeRow,
    PropFirmEngagementRow,
    PropFirmStatementRow,
    PropPayoutRow,
    PropRoundRow,
} from '~/server/db/schemas/prop';

import {
    AccountEventKind,
    type AccountLifecycleState,
    type AccountReadIssue,
    AccountStage,
    AccountStatus,
    AccountTracking,
    applyLifecycleEvent,
    compareText,
    FeeKind,
    findStoredFirm,
    type FirmColumns,
    type FirmColumnsRow,
    type FirmKey,
    firmKeyOf,
    impliedEvalPassOn,
    type LedgerOnlyAccountRow,
    LifecycleOutcomeKind,
    type ModeledAccountRow,
    PlanKeyResolutionKind,
    resolvePlanKey,
    trackedAccountOf,
    type UnresolvedPlanReason,
    usdCents,
    type UsdCents,
} from '~/lib/prop-accounts/core';
import {
    type FirmId,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    binomialStandardError,
    meanStandardError,
    NINETY_FIVE_PERCENT_Z,
    wilsonInterval,
    type WilsonInterval,
} from '~/lib/prop-calculator/stats';

export enum TransitionProvenance {
    ImpliedPassDateUnknown = 'implied-pass-date-unknown',
    ImpliedPassFromFundedDate = 'implied-pass-from-funded-date',
    ImpliedPurchase = 'implied-purchase',
    Recorded = 'recorded',
}

export interface EvalAttemptTally {
    readonly fails: number;
    readonly passes: number;
}

export interface FundedSince {
    readonly on: string;
    readonly provenance: TransitionProvenance;
}

export type LedgerAccount = LedgerOnlyLedgerAccount | ModeledLedgerAccount;

export type LedgerAccountRow = Partial<Pick<PropAccountRow, 'roundId'>> &
    Pick<
        PropAccountRow,
        | 'accountSize'
        | 'archivedAt'
        | 'copyGroupId'
        | 'externalFirmId'
        | 'firmId'
        | 'fundedOn'
        | 'id'
        | 'label'
        | 'optIns'
        | 'planLabel'
        | 'planSerial'
        | 'purchasedOn'
        | 'replacesAccountId'
        | 'stage'
        | 'status'
        | 'tracking'
        | 'userId'
    > & {
        readonly readIssues: readonly AccountReadIssue[];
    };

export type LedgerEventRow = Pick<
    PropAccountEventRow,
    'accountId' | 'createdAt' | 'id' | 'kind' | 'occurredOn' | 'userId'
> & {
    readonly detail?: PropAccountEventRow['detail'];
};

export type LedgerFeeRow = Pick<
    PropFeeRow,
    'accountId' | 'amountCents' | 'id' | 'kind' | 'paidOn' | 'userId'
>;

export type LedgerFirmEngagementRow = Pick<
    PropFirmEngagementRow,
    | 'externalFirmId'
    | 'firmId'
    | 'id'
    | 'reason'
    | 'sentLiveOn'
    | 'sinceOn'
    | 'status'
    | 'userId'
>;

export type LedgerFirmStatementRow = Pick<
    PropFirmStatementRow,
    | 'asOf'
    | 'basis'
    | 'externalFirmId'
    | 'firmId'
    | 'id'
    | 'reportedPayoutCents'
    | 'userId'
>;

export interface LedgerOnlyLedgerAccount extends LedgerAccountEntries {
    readonly plan: null;
    readonly row: LedgerOnlyAccountRow<LedgerAccountRow>;
    readonly unresolvedReason: null;
}

export type LedgerPayoutRow = Pick<
    PropPayoutRow,
    | 'accountId'
    | 'approvedOn'
    | 'grossCents'
    | 'id'
    | 'netCents'
    | 'paidOn'
    | 'requestedOn'
    | 'status'
    | 'userId'
>;

export interface LedgerPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
    readonly planSerial: string;
}

export type LedgerRoundRow = Pick<
    PropRoundRow,
    | 'budgetCents'
    | 'closedOn'
    | 'externalFirmId'
    | 'firmId'
    | 'id'
    | 'label'
    | 'openedOn'
    | 'status'
    | 'userId'
>;

export type LedgerTransferRow = Pick<
    PropBankrollTransferRow,
    'amountCents' | 'id' | 'kind' | 'occurredOn' | 'userId'
>;

export interface LifecycleTransition {
    readonly from: AccountLifecycleState | null;
    readonly kind: AccountEventKind;
    readonly on: string;
    readonly provenance: TransitionProvenance;
    readonly to: AccountLifecycleState;
}

export interface ModeledLedgerAccount extends LedgerAccountEntries {
    readonly plan: LedgerPlan | null;
    readonly row: ModeledAccountRow<LedgerAccountRow>;
    readonly unresolvedReason: null | UnresolvedPlanReason;
}

export interface PlanGroup extends LedgerPlan {
    readonly accounts: readonly ModeledLedgerAccount[];
    readonly firmId: FirmId;
}

export interface PortfolioLedgerRows {
    readonly accounts: readonly LedgerAccountRow[];
    readonly events: readonly LedgerEventRow[];
    readonly fees: readonly LedgerFeeRow[];
    readonly firmEngagements?: readonly LedgerFirmEngagementRow[];
    readonly firmStatements?: readonly LedgerFirmStatementRow[];
    readonly payouts: readonly LedgerPayoutRow[];
    readonly rounds?: readonly LedgerRoundRow[];
    readonly transfers?: readonly LedgerTransferRow[];
}

export interface SampledEstimate {
    readonly interval: null | WilsonInterval;
    readonly n: number;
    readonly standardError: null | number;
    readonly value: number;
}

export interface UnmatchedRows {
    readonly accounts: number;
    readonly events: number;
    readonly fees: number;
    readonly payouts: number;
}

interface LedgerAccountEntries {
    readonly events: readonly LedgerEventRow[];
    readonly fees: readonly LedgerFeeRow[];
    readonly payouts: readonly LedgerPayoutRow[];
    readonly rejectedEvents: number;
    readonly timelineMatchesRow: boolean;
    readonly transitions: readonly LifecycleTransition[];
}

export const AVERAGE_DAYS_PER_MONTH = 365.25 / 12;

const MIN_SAMPLES_FOR_SE = 2;

const STUDENT_T_CRITICAL_95: Readonly<Record<number, number>> = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    11: 2.201,
    12: 2.179,
    13: 2.16,
    14: 2.145,
    15: 2.131,
    16: 2.12,
    17: 2.11,
    18: 2.101,
    19: 2.093,
    20: 2.086,
    21: 2.08,
    22: 2.074,
    23: 2.069,
    24: 2.064,
    25: 2.06,
    26: 2.056,
    27: 2.052,
    28: 2.048,
    29: 2.045,
    30: 2.042,
};

interface GroupedRows<Row> {
    readonly byAccount: ReadonlyMap<string, readonly Row[]>;
    readonly unmatched: number;
}

interface LifecycleStep {
    readonly kind: AccountEventKind;
    readonly on: string;
    readonly provenance: TransitionProvenance;
}

interface OwnedRow {
    readonly accountId: string;
    readonly userId: string;
}

export class PortfolioLedger {
    static fromRows(
        userId: string,
        rows: PortfolioLedgerRows,
    ): PortfolioLedger {
        return new PortfolioLedger(userId, rows);
    }

    private readonly byId: ReadonlyMap<string, LedgerAccount>;
    readonly accounts: readonly LedgerAccount[];
    readonly firmEngagements: readonly LedgerFirmEngagementRow[];
    readonly firmStatements: readonly LedgerFirmStatementRow[];
    readonly rounds: readonly LedgerRoundRow[];
    readonly transfers: readonly LedgerTransferRow[];
    readonly unmatched: UnmatchedRows;
    readonly userId: string;

    private constructor(userId: string, rows: PortfolioLedgerRows) {
        this.userId = userId;
        const owned = rows.accounts.filter((row) => row.userId === userId);
        const ownedIds = new Set(owned.map((row) => row.id));
        const events = groupOwnedRows(rows.events, userId, ownedIds);
        const fees = groupOwnedRows(rows.fees, userId, ownedIds);
        const payouts = groupOwnedRows(rows.payouts, userId, ownedIds);
        this.accounts = owned.map((row) =>
            buildAccount(
                row,
                events.byAccount.get(row.id) ?? [],
                fees.byAccount.get(row.id) ?? [],
                payouts.byAccount.get(row.id) ?? [],
            ),
        );
        this.byId = new Map(
            this.accounts.map((entry) => [entry.row.id, entry]),
        );
        this.rounds = (rows.rounds ?? []).filter(
            (row) => row.userId === userId,
        );
        this.transfers = (rows.transfers ?? []).filter(
            (row) => row.userId === userId,
        );
        this.firmEngagements = (rows.firmEngagements ?? []).filter(
            (row) => row.userId === userId,
        );
        this.firmStatements = (rows.firmStatements ?? []).filter(
            (row) => row.userId === userId,
        );
        this.unmatched = {
            accounts: rows.accounts.length - owned.length,
            events: events.unmatched,
            fees: fees.unmatched,
            payouts: payouts.unmatched,
        };
    }

    get ledgerOnlyAccounts(): readonly LedgerOnlyLedgerAccount[] {
        return this.accounts.filter(isLedgerOnlyEntry);
    }

    get resolvedAccounts(): readonly ModeledLedgerAccount[] {
        return modeledEntries(this).filter((entry) => entry.plan !== null);
    }

    get unresolvedAccounts(): readonly ModeledLedgerAccount[] {
        return modeledEntries(this).filter((entry) => entry.plan === null);
    }

    planGroups(): readonly PlanGroup[] {
        const groups = new Map<
            string,
            { accounts: ModeledLedgerAccount[]; plan: LedgerPlan }
        >();
        for (const entry of modeledEntries(this)) {
            if (entry.plan === null) continue;
            const group = groups.get(entry.plan.planSerial);
            if (group === undefined) {
                groups.set(entry.plan.planSerial, {
                    accounts: [entry],
                    plan: entry.plan,
                });
            } else {
                group.accounts.push(entry);
            }
        }
        return groups
            .values()
            .map(({ accounts, plan }) => ({
                ...plan,
                accounts,
                firmId: plan.firm.id,
            }))
            .toArray()
            .toSorted(
                (a, b) =>
                    compareText(a.firmId, b.firmId) ||
                    compareText(a.planSerial, b.planSerial),
            );
    }

    membersOfRound(roundId: string): readonly LedgerAccount[] {
        return this.accounts.filter(
            (entry) => accountRoundId(entry) === roundId,
        );
    }

    replacedAccountOf(account: LedgerAccount): LedgerAccount | null {
        const replacedId = account.row.replacesAccountId;
        if (replacedId === null) return null;
        const replaced = this.byId.get(replacedId);
        return replaced?.row.userId === account.row.userId &&
            replaced.row.id !== account.row.id
            ? replaced
            : null;
    }
}

export function accountRoundId(account: LedgerAccount): null | string {
    return account.row.roundId ?? null;
}

export function evalAttemptTally(account: LedgerAccount): EvalAttemptTally {
    let passes = 0;
    let fails = 0;
    for (const [index, transition] of account.transitions.entries()) {
        if (transition.kind === AccountEventKind.EvalPassed) passes += 1;
        const { from } = transition;
        if (from?.stage !== AccountStage.Eval) continue;
        const isEvalBust =
            transition.to.status === AccountStatus.Busted &&
            !isReversed(account.transitions, index);
        const isIdleClosure =
            transition.kind === AccountEventKind.ClosedInactivity &&
            from.status !== AccountStatus.Busted;
        if (isEvalBust || isIdleClosure) fails += 1;
    }
    return { fails, passes };
}

export function finalState(
    account: LedgerAccount,
): AccountLifecycleState | null {
    return account.transitions.at(-1)?.to ?? null;
}

export function firmColumnsOf(row: FirmColumnsRow): FirmColumns {
    if (row.firmId !== null) {
        return { externalFirmId: null, firmId: row.firmId };
    }
    if (row.externalFirmId === null) {
        throw new RangeError(
            'a firm row must set exactly one of firmId or externalFirmId',
        );
    }
    return { externalFirmId: row.externalFirmId, firmId: null };
}

export function fundedSince(account: LedgerAccount): FundedSince | null {
    const transition = account.transitions.find(
        (candidate) => candidate.to.stage !== AccountStage.Eval,
    );
    return transition === undefined
        ? null
        : { on: transition.on, provenance: transition.provenance };
}

export function hasUnreversedFundedBust(account: LedgerAccount): boolean {
    return account.transitions.some(
        (transition, index) =>
            transition.from !== null &&
            transition.from.stage !== AccountStage.Eval &&
            transition.from.status !== AccountStatus.Busted &&
            transition.to.status === AccountStatus.Busted &&
            !isReversed(account.transitions, index),
    );
}

export function isActiveAccount(
    row: Pick<PropAccountRow, 'archivedAt' | 'status'>,
): boolean {
    return row.status === AccountStatus.Active && row.archivedAt === null;
}

export function isTransitionDateKnown(
    provenance: TransitionProvenance,
): boolean {
    switch (provenance) {
        case TransitionProvenance.ImpliedPassDateUnknown: {
            return false;
        }
        case TransitionProvenance.ImpliedPassFromFundedDate:
        case TransitionProvenance.ImpliedPurchase:
        case TransitionProvenance.Recorded: {
            return true;
        }
    }
}

export function modeledEntries(
    ledger: Pick<PortfolioLedger, 'accounts'>,
): readonly ModeledLedgerAccount[] {
    return ledger.accounts.filter(isModeledEntry);
}

export function roundCents(value: number): UsdCents {
    if (!Number.isFinite(value)) {
        throw new RangeError(`Cannot round a non-finite cent amount: ${value}`);
    }
    const rounded = Math.sign(value) * Math.round(Math.abs(value));
    return usdCents(rounded === 0 ? 0 : rounded);
}

export function roundFirmKeyOf(round: FirmColumnsRow): FirmKey | null {
    return round.firmId === null && round.externalFirmId === null
        ? null
        : firmKeyOf(firmColumnsOf(round));
}

export function sampledMean(values: readonly number[]): null | SampledEstimate {
    const n = values.length;
    if (n === 0) return null;
    let sum = 0;
    let squaredSum = 0;
    for (const value of values) {
        sum += value;
        squaredSum += value * value;
    }
    const value = sum / n;
    const standardError =
        n < MIN_SAMPLES_FOR_SE ? null : meanStandardError(sum, squaredSum, n);
    const criticalValue =
        standardError === null ? null : studentTCriticalValue(n - 1);
    return {
        interval:
            standardError === null || criticalValue === null
                ? null
                : {
                      lower: value - criticalValue * standardError,
                      upper: value + criticalValue * standardError,
                  },
        n,
        standardError,
        value,
    };
}

export function sampledRate(
    successes: number,
    n: number,
): null | SampledEstimate {
    if (n === 0) return null;
    const value = successes / n;
    const isDegenerate =
        n < MIN_SAMPLES_FOR_SE || successes === 0 || successes === n;
    return {
        interval: wilsonInterval(successes, n),
        n,
        standardError: isDegenerate ? null : binomialStandardError(value, n),
        value,
    };
}

export function signedFeeCents(fee: LedgerFeeRow): UsdCents {
    return fee.kind === FeeKind.Refund
        ? usdCents(0 - fee.amountCents)
        : fee.amountCents;
}

export function studentTCriticalValue(degreesOfFreedom: number): number {
    if (!Number.isSafeInteger(degreesOfFreedom) || degreesOfFreedom < 1) {
        throw new RangeError(
            `degrees of freedom must be a whole number >= 1, got ${degreesOfFreedom}`,
        );
    }
    const tabulated = STUDENT_T_CRITICAL_95[degreesOfFreedom];
    if (tabulated !== undefined) return tabulated;
    const z = NINETY_FIVE_PERCENT_Z;
    return z + (z ** 3 + z) / (4 * degreesOfFreedom);
}

function buildAccount(
    stored: LedgerAccountRow,
    events: readonly LedgerEventRow[],
    fees: readonly LedgerFeeRow[],
    payouts: readonly LedgerPayoutRow[],
): LedgerAccount {
    const sortedEvents = events.toSorted(compareEvents);
    const row = trackedAccountOf(stored);
    if (row.tracking === AccountTracking.LedgerOnly) {
        return {
            events: sortedEvents,
            fees,
            payouts,
            plan: null,
            rejectedEvents: 0,
            row,
            timelineMatchesRow: false,
            transitions: [],
            unresolvedReason: null,
        };
    }
    const resolution = resolvePlanKey({
        accountSize: row.accountSize,
        firmId: row.firmId,
        optIns: row.optIns,
        planSerial: row.planSerial,
        readIssues: row.readIssues,
    });
    const firm = findStoredFirm(row.firmId);
    if (
        firm === undefined ||
        resolution.kind === PlanKeyResolutionKind.Unresolved
    ) {
        return {
            events: sortedEvents,
            fees,
            payouts,
            plan: null,
            rejectedEvents: 0,
            row,
            timelineMatchesRow: false,
            transitions: [],
            unresolvedReason:
                resolution.kind === PlanKeyResolutionKind.Unresolved
                    ? resolution.reason
                    : null,
        };
    }
    const { rejected, transitions } = replayLifecycle(
        resolution.plan,
        lifecycleSteps(row, resolution.plan, sortedEvents),
    );
    const last = transitions.at(-1);
    return {
        events: sortedEvents,
        fees,
        payouts,
        plan: {
            firm,
            plan: resolution.plan,
            planSerial: serializePlanId(resolution.plan.id),
        },
        rejectedEvents: rejected,
        row,
        timelineMatchesRow:
            last?.to.stage === row.stage && last.to.status === row.status,
        transitions,
        unresolvedReason: null,
    };
}

function compareEvents(a: LedgerEventRow, b: LedgerEventRow): number {
    return (
        compareText(a.occurredOn, b.occurredOn) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        compareText(a.id, b.id)
    );
}

function groupOwnedRows<Row extends OwnedRow>(
    rows: readonly Row[],
    userId: string,
    ownedIds: ReadonlySet<string>,
): GroupedRows<Row> {
    const byAccount = new Map<string, Row[]>();
    let unmatched = 0;
    for (const row of rows) {
        if (row.userId !== userId || !ownedIds.has(row.accountId)) {
            unmatched += 1;
            continue;
        }
        const list = byAccount.get(row.accountId);
        if (list === undefined) {
            byAccount.set(row.accountId, [row]);
        } else {
            list.push(row);
        }
    }
    return { byAccount, unmatched };
}

function isLedgerOnlyEntry(
    entry: LedgerAccount,
): entry is LedgerOnlyLedgerAccount {
    return entry.row.tracking === AccountTracking.LedgerOnly;
}

function isModeledEntry(entry: LedgerAccount): entry is ModeledLedgerAccount {
    return entry.row.tracking === AccountTracking.Modeled;
}

function isReversed(
    transitions: readonly LifecycleTransition[],
    index: number,
): boolean {
    return transitions[index + 1]?.kind === AccountEventKind.BustReversed;
}

function isSameState(
    a: AccountLifecycleState,
    b: AccountLifecycleState,
): boolean {
    return a.stage === b.stage && a.status === b.status;
}

function lifecycleSteps(
    row: ModeledAccountRow<LedgerAccountRow>,
    plan: Plan,
    events: readonly LedgerEventRow[],
): LifecycleStep[] {
    const steps: LifecycleStep[] = events
        .filter((event) => event.kind !== AccountEventKind.Edited)
        .map((event) => ({
            kind: event.kind,
            on: event.occurredOn,
            provenance: TransitionProvenance.Recorded,
        }));
    if (steps.every((step) => step.kind !== AccountEventKind.Purchased)) {
        steps.unshift({
            kind: AccountEventKind.Purchased,
            on: row.purchasedOn,
            provenance: TransitionProvenance.ImpliedPurchase,
        });
    }
    const impliedPass = impliedEvalPassOn(
        row,
        plan,
        steps.some((step) => step.kind === AccountEventKind.EvalPassed),
    );
    if (impliedPass !== null) {
        const later = steps.findIndex(
            (step, index) =>
                index > 0 && compareText(step.on, impliedPass.on) >= 0,
        );
        steps.splice(later === -1 ? steps.length : later, 0, {
            kind: AccountEventKind.EvalPassed,
            on: impliedPass.on,
            provenance: impliedPass.dateKnown
                ? TransitionProvenance.ImpliedPassFromFundedDate
                : TransitionProvenance.ImpliedPassDateUnknown,
        });
    }
    return steps;
}

function replayLifecycle(
    plan: Plan,
    steps: readonly LifecycleStep[],
): {
    readonly rejected: number;
    readonly transitions: readonly LifecycleTransition[];
} {
    const transitions: LifecycleTransition[] = [];
    let state: AccountLifecycleState | null = null;
    let rejected = 0;
    for (const step of steps) {
        const outcome = applyLifecycleEvent(plan, state, step.kind);
        if (outcome.kind === LifecycleOutcomeKind.Rejected) {
            rejected += 1;
            continue;
        }
        if (state !== null && isSameState(state, outcome.state)) continue;
        transitions.push({
            from: state,
            kind: step.kind,
            on: step.on,
            provenance: step.provenance,
            to: outcome.state,
        });
        state = outcome.state;
    }
    return { rejected, transitions };
}
