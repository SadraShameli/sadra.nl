import {
    and,
    asc,
    desc,
    eq,
    gte,
    inArray,
    isNull,
    lte,
    ne,
    notInArray,
} from 'drizzle-orm';
import 'server-only';
import { ZodError } from 'zod';

import { captureError } from '~/lib/observability/logger';
import {
    type AccountEventChange,
    type AccountEventDetail,
    AccountEventKind,
    type AccountReadIssue,
    AccountReadIssueKind,
    type AccountStage,
    compareText,
    type PersonalRules,
    PlanKeyResolutionKind,
    readAccountEventDetail,
    readPersonalRules,
    readPersonalRulesOrNull,
    readPlanOptIns,
    readPlanOptInsOrNull,
    readRulebookParameters,
    resolvePlanKey,
    todayIsoDate,
} from '~/lib/prop-accounts/core';
import {
    type FirmId,
    NO_PLAN_OPT_INS,
    type PlanOptIns,
} from '~/lib/prop-calculator';
import { type RulebookParameters } from '~/lib/prop-calculator/advisor';
import {
    PropLimitRejection,
    PropQuota,
    PropRecord,
    type PropRejection,
    type PropRejectionSource,
    PropStoredRecordRejection,
    STORED_DATA_OWNER_REPAIR,
} from '~/lib/schemas/propAccountOutputs';
import { type db } from '~/server/db';
import {
    propAccount,
    propAccountEvent,
    type PropAccountEventRow,
    type PropAccountRow,
    propAccountSnapshot,
    type PropAccountSnapshotRow,
    propCopyGroup,
    type PropCopyGroupRow,
    propFee,
    type PropFeeRow,
    propPayout,
    type PropPayoutRow,
    propRulebook,
    propSavedScenario,
    type PropSavedScenarioRow,
    propSizingDecision,
    type PropSizingDecisionRow,
} from '~/server/db/schemas/prop';

import { PROP_QUOTA_LIMITS } from './PropAccountQuotas';

export const MAX_EVENT_LIST_ROWS = 5000;

const CORRUPT_ROW_TAG = 'prop-accounts:corrupt-row';

const UNREADABLE_EVENT_DETAIL: AccountEventDetail = { changes: [], note: null };

const ACCOUNT_REF_COLUMNS = {
    archivedAt: propAccount.archivedAt,
    id: propAccount.id,
    purchasedOn: propAccount.purchasedOn,
    stage: propAccount.stage,
};

export interface AccountListFilter {
    readonly firmId?: FirmId;
    readonly includeArchived: boolean;
    readonly stage?: AccountStage;
}

export interface EditedAccount {
    readonly accountId: string;
    readonly changes: readonly AccountEventChange[];
    readonly purchasedOn: string;
}

export interface EventRange {
    readonly accountId?: string;
    readonly from: string;
    readonly to: string;
}

export type ListedAccount = Omit<OwnedAccount, 'personalRules'> & {
    readonly personalRules: null | PersonalRules;
};

export type OwnedAccount = Omit<PropAccountRow, 'optIns' | 'personalRules'> & {
    readonly optIns: PlanOptIns;
    readonly personalRules: PersonalRules;
    readonly readIssues: readonly AccountReadIssue[];
};

export type OwnedAccountRef = Pick<
    PropAccountRow,
    'archivedAt' | 'id' | 'purchasedOn' | 'stage'
>;

export type OwnedEvent = Omit<PropAccountEventRow, 'detail'> & {
    readonly detail: AccountEventDetail;
};

export type PropDatabase = Pick<
    typeof db,
    | '$count'
    | 'delete'
    | 'execute'
    | 'insert'
    | 'select'
    | 'selectDistinctOn'
    | 'update'
>;

export class PropAccountRepo {
    constructor(
        private readonly database: PropDatabase,
        private readonly userId: string,
    ) {}

    private async loadOwnedAccountRowOrThrow(
        id: string,
        isLocked: boolean,
    ): Promise<PropAccountRow> {
        const query = this.database
            .select()
            .from(propAccount)
            .where(
                and(
                    eq(propAccount.id, id),
                    eq(propAccount.userId, this.userId),
                ),
            )
            .limit(1);
        const [row] = isLocked ? await query.for('update') : await query;
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.Account);
        }
        return row;
    }

    async earliestLifecycleEventOn(accountId: string): Promise<null | string> {
        const [row] = await this.database
            .select({ occurredOn: propAccountEvent.occurredOn })
            .from(propAccountEvent)
            .where(
                and(
                    eq(propAccountEvent.userId, this.userId),
                    eq(propAccountEvent.accountId, accountId),
                    notInArray(propAccountEvent.kind, [
                        AccountEventKind.Purchased,
                        AccountEventKind.Edited,
                    ]),
                ),
            )
            .orderBy(asc(propAccountEvent.occurredOn))
            .limit(1);
        return row?.occurredOn ?? null;
    }

    async hasEventOfKind(
        accountId: string,
        kind: AccountEventKind,
    ): Promise<boolean> {
        const [row] = await this.database
            .select({ id: propAccountEvent.id })
            .from(propAccountEvent)
            .where(
                and(
                    eq(propAccountEvent.userId, this.userId),
                    eq(propAccountEvent.accountId, accountId),
                    eq(propAccountEvent.kind, kind),
                ),
            )
            .limit(1);
        return row !== undefined;
    }

    async latestLifecycleEventOn(accountId: string): Promise<null | string> {
        const [row] = await this.database
            .select({ occurredOn: propAccountEvent.occurredOn })
            .from(propAccountEvent)
            .where(
                and(
                    eq(propAccountEvent.userId, this.userId),
                    eq(propAccountEvent.accountId, accountId),
                    ne(propAccountEvent.kind, AccountEventKind.Edited),
                ),
            )
            .orderBy(desc(propAccountEvent.occurredOn))
            .limit(1);
        return row?.occurredOn ?? null;
    }

    async latestSnapshots(): Promise<PropAccountSnapshotRow[]> {
        const limit = PROP_QUOTA_LIMITS[PropQuota.Accounts];
        const rows = await this.database
            .selectDistinctOn([propAccountSnapshot.accountId])
            .from(propAccountSnapshot)
            .where(eq(propAccountSnapshot.userId, this.userId))
            .orderBy(
                propAccountSnapshot.accountId,
                desc(propAccountSnapshot.asOf),
                desc(propAccountSnapshot.createdAt),
                desc(propAccountSnapshot.id),
            )
            .limit(limit + 1);
        return boundedRows(rows, limit, PropRecord.Snapshot);
    }

    async listAccounts(filter: AccountListFilter): Promise<ListedAccount[]> {
        const rows = await this.database
            .select()
            .from(propAccount)
            .where(
                and(
                    eq(propAccount.userId, this.userId),
                    filter.includeArchived
                        ? undefined
                        : isNull(propAccount.archivedAt),
                    filter.stage === undefined
                        ? undefined
                        : eq(propAccount.stage, filter.stage),
                    filter.firmId === undefined
                        ? undefined
                        : eq(propAccount.firmId, filter.firmId),
                ),
            )
            .orderBy(asc(propAccount.label), asc(propAccount.id))
            .limit(PROP_QUOTA_LIMITS[PropQuota.Accounts] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.Accounts],
            PropRecord.Account,
        ).map(readListedAccount);
    }

    async listAccountRefsIn(copyGroupId: string): Promise<OwnedAccountRef[]> {
        const rows = await this.database
            .select(ACCOUNT_REF_COLUMNS)
            .from(propAccount)
            .where(
                and(
                    eq(propAccount.userId, this.userId),
                    eq(propAccount.copyGroupId, copyGroupId),
                ),
            )
            .limit(PROP_QUOTA_LIMITS[PropQuota.Accounts] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.Accounts],
            PropRecord.Account,
        );
    }

    async listAccountsReplacing(accountId: string): Promise<OwnedAccountRef[]> {
        const rows = await this.database
            .select(ACCOUNT_REF_COLUMNS)
            .from(propAccount)
            .where(
                and(
                    eq(propAccount.userId, this.userId),
                    eq(propAccount.replacesAccountId, accountId),
                ),
            )
            .limit(PROP_QUOTA_LIMITS[PropQuota.Accounts] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.Accounts],
            PropRecord.Account,
        );
    }

    async listCopyGroups(): Promise<PropCopyGroupRow[]> {
        const rows = await this.database
            .select()
            .from(propCopyGroup)
            .where(eq(propCopyGroup.userId, this.userId))
            .orderBy(asc(propCopyGroup.name))
            .limit(PROP_QUOTA_LIMITS[PropQuota.CopyGroups] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.CopyGroups],
            PropRecord.CopyGroup,
        );
    }

    async listDecisionsForAccount(
        accountId: string,
    ): Promise<PropSizingDecisionRow[]> {
        const rows = await this.database
            .select()
            .from(propSizingDecision)
            .where(
                and(
                    eq(propSizingDecision.userId, this.userId),
                    eq(propSizingDecision.accountId, accountId),
                ),
            )
            .orderBy(
                desc(propSizingDecision.decidedOn),
                desc(propSizingDecision.createdAt),
                desc(propSizingDecision.id),
            )
            .limit(PROP_QUOTA_LIMITS[PropQuota.Decisions] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.Decisions],
            PropRecord.Decision,
        );
    }

    async listEvents(range: EventRange): Promise<OwnedEvent[]> {
        const rows = await this.database
            .select()
            .from(propAccountEvent)
            .where(
                and(
                    eq(propAccountEvent.userId, this.userId),
                    gte(propAccountEvent.occurredOn, range.from),
                    lte(propAccountEvent.occurredOn, range.to),
                    range.accountId === undefined
                        ? undefined
                        : eq(propAccountEvent.accountId, range.accountId),
                ),
            )
            .orderBy(
                asc(propAccountEvent.occurredOn),
                asc(propAccountEvent.createdAt),
                asc(propAccountEvent.id),
            )
            .limit(MAX_EVENT_LIST_ROWS + 1);
        return readableEvents(
            boundedRows(rows, MAX_EVENT_LIST_ROWS, PropRecord.Event),
        );
    }

    async listEventsForAccount(accountId: string): Promise<OwnedEvent[]> {
        const rows = await this.database
            .select()
            .from(propAccountEvent)
            .where(
                and(
                    eq(propAccountEvent.userId, this.userId),
                    eq(propAccountEvent.accountId, accountId),
                ),
            )
            .orderBy(
                asc(propAccountEvent.occurredOn),
                asc(propAccountEvent.createdAt),
                asc(propAccountEvent.id),
            )
            .limit(MAX_EVENT_LIST_ROWS + 1);
        return readableEvents(
            boundedRows(rows, MAX_EVENT_LIST_ROWS, PropRecord.Event),
        );
    }

    async listFees(accountId?: string): Promise<PropFeeRow[]> {
        const rows = await this.database
            .select()
            .from(propFee)
            .where(
                and(
                    eq(propFee.userId, this.userId),
                    accountId === undefined
                        ? undefined
                        : eq(propFee.accountId, accountId),
                ),
            )
            .orderBy(
                desc(propFee.paidOn),
                desc(propFee.createdAt),
                desc(propFee.id),
            )
            .limit(PROP_QUOTA_LIMITS[PropQuota.Fees] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.Fees],
            PropRecord.Fee,
        );
    }

    async listPayouts(accountId?: string): Promise<PropPayoutRow[]> {
        const rows = await this.database
            .select()
            .from(propPayout)
            .where(
                and(
                    eq(propPayout.userId, this.userId),
                    accountId === undefined
                        ? undefined
                        : eq(propPayout.accountId, accountId),
                ),
            )
            .orderBy(
                desc(propPayout.requestedOn),
                desc(propPayout.createdAt),
                desc(propPayout.id),
            )
            .limit(PROP_QUOTA_LIMITS[PropQuota.Payouts] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.Payouts],
            PropRecord.Payout,
        );
    }

    async listScenarios(): Promise<PropSavedScenarioRow[]> {
        const rows = await this.database
            .select()
            .from(propSavedScenario)
            .where(eq(propSavedScenario.userId, this.userId))
            .orderBy(asc(propSavedScenario.name))
            .limit(PROP_QUOTA_LIMITS[PropQuota.Scenarios] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.Scenarios],
            PropRecord.Scenario,
        );
    }

    async listSnapshotsForAccount(
        accountId: string,
    ): Promise<PropAccountSnapshotRow[]> {
        const rows = await this.database
            .select()
            .from(propAccountSnapshot)
            .where(
                and(
                    eq(propAccountSnapshot.userId, this.userId),
                    eq(propAccountSnapshot.accountId, accountId),
                ),
            )
            .orderBy(
                desc(propAccountSnapshot.asOf),
                desc(propAccountSnapshot.createdAt),
                desc(propAccountSnapshot.id),
            )
            .limit(PROP_QUOTA_LIMITS[PropQuota.Snapshots] + 1);
        return boundedRows(
            rows,
            PROP_QUOTA_LIMITS[PropQuota.Snapshots],
            PropRecord.Snapshot,
        );
    }

    async loadListedAccountOrThrow(id: string): Promise<ListedAccount> {
        return readListedAccount(
            await this.loadOwnedAccountRowOrThrow(id, false),
        );
    }

    async loadOwnedAccountOrThrow(
        id: string,
        isLocked = false,
    ): Promise<OwnedAccount> {
        return readAccount(await this.loadOwnedAccountRowOrThrow(id, isLocked));
    }

    async loadOwnedAccountRefOrThrow(
        id: string,
        isLocked = false,
    ): Promise<OwnedAccountRef> {
        const query = this.database
            .select(ACCOUNT_REF_COLUMNS)
            .from(propAccount)
            .where(
                and(
                    eq(propAccount.id, id),
                    eq(propAccount.userId, this.userId),
                ),
            )
            .limit(1);
        const [row] = isLocked ? await query.for('update') : await query;
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.Account);
        }
        return row;
    }

    async loadOwnedAccountsOrThrow(
        ids: readonly string[],
    ): Promise<ReadonlyMap<string, OwnedAccount>> {
        const distinct = [...new Set(ids)];
        if (distinct.length === 0) return new Map();
        const rows = await this.database
            .select()
            .from(propAccount)
            .where(
                and(
                    inArray(propAccount.id, distinct),
                    eq(propAccount.userId, this.userId),
                ),
            )
            .limit(distinct.length);
        const owned = new Map(
            rows.map((row) => [row.id, readAccount(row)] as const),
        );
        if (distinct.some((id) => !owned.has(id))) {
            throw new PropRecordNotFoundError(PropRecord.Account);
        }
        return owned;
    }

    async loadOwnedCopyGroupOrThrow(id: string): Promise<PropCopyGroupRow> {
        const [row] = await this.database
            .select()
            .from(propCopyGroup)
            .where(
                and(
                    eq(propCopyGroup.id, id),
                    eq(propCopyGroup.userId, this.userId),
                ),
            )
            .limit(1);
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.CopyGroup);
        }
        return row;
    }

    async loadOwnedDecisionOrThrow(id: string): Promise<PropSizingDecisionRow> {
        const [row] = await this.database
            .select()
            .from(propSizingDecision)
            .where(
                and(
                    eq(propSizingDecision.id, id),
                    eq(propSizingDecision.userId, this.userId),
                ),
            )
            .limit(1);
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.Decision);
        }
        return row;
    }

    async loadOwnedFeeOrThrow(id: string): Promise<PropFeeRow> {
        const [row] = await this.database
            .select()
            .from(propFee)
            .where(and(eq(propFee.id, id), eq(propFee.userId, this.userId)))
            .limit(1);
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.Fee);
        }
        return row;
    }

    async loadOwnedPayoutOrThrow(id: string): Promise<PropPayoutRow> {
        const [row] = await this.database
            .select()
            .from(propPayout)
            .where(
                and(eq(propPayout.id, id), eq(propPayout.userId, this.userId)),
            )
            .limit(1);
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.Payout);
        }
        return row;
    }

    async loadOwnedScenarioOrThrow(id: string): Promise<PropSavedScenarioRow> {
        const [row] = await this.database
            .select()
            .from(propSavedScenario)
            .where(
                and(
                    eq(propSavedScenario.id, id),
                    eq(propSavedScenario.userId, this.userId),
                ),
            )
            .limit(1);
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.Scenario);
        }
        return row;
    }

    async loadOwnedSnapshotOrThrow(
        id: string,
        accountId?: string,
    ): Promise<PropAccountSnapshotRow> {
        const [row] = await this.database
            .select()
            .from(propAccountSnapshot)
            .where(
                and(
                    eq(propAccountSnapshot.id, id),
                    eq(propAccountSnapshot.userId, this.userId),
                    accountId === undefined
                        ? undefined
                        : eq(propAccountSnapshot.accountId, accountId),
                ),
            )
            .limit(1);
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.Snapshot);
        }
        return row;
    }

    async loadPlanTolerantAccountOrThrow(id: string): Promise<OwnedAccount> {
        return readPlanTolerantAccount(
            await this.loadOwnedAccountRowOrThrow(id, false),
        );
    }

    async loadRulebookParameters(): Promise<null | RulebookParameters> {
        const [row] = await this.database
            .select()
            .from(propRulebook)
            .where(eq(propRulebook.userId, this.userId))
            .limit(1);
        return row === undefined
            ? null
            : readStored(
                  PropRecord.Rulebook,
                  () => readRulebookParameters(row.parameters),
                  null,
                  null,
              );
    }

    async loadScenarioIdByName(name: string): Promise<null | string> {
        const [row] = await this.database
            .select({ id: propSavedScenario.id })
            .from(propSavedScenario)
            .where(
                and(
                    eq(propSavedScenario.userId, this.userId),
                    eq(propSavedScenario.name, name),
                ),
            )
            .limit(1);
        return row?.id ?? null;
    }

    async movePurchasedEvent(
        accountId: string,
        purchasedOn: string,
    ): Promise<void> {
        await this.database
            .update(propAccountEvent)
            .set({ occurredOn: purchasedOn, updatedAt: new Date() })
            .where(
                and(
                    eq(propAccountEvent.userId, this.userId),
                    eq(propAccountEvent.accountId, accountId),
                    eq(propAccountEvent.kind, AccountEventKind.Purchased),
                ),
            );
    }

    async recordEdits(
        edits: readonly EditedAccount[],
        now: Date,
    ): Promise<void> {
        const today = todayIsoDate(now);
        const values = edits
            .filter((edit) => edit.changes.length > 0)
            .map((edit) => ({
                accountId: edit.accountId,
                detail: { changes: edit.changes, note: null },
                kind: AccountEventKind.Edited,
                occurredOn:
                    compareText(today, edit.purchasedOn) < 0
                        ? edit.purchasedOn
                        : today,
                userId: this.userId,
            }));
        if (values.length === 0) return;
        await this.database.insert(propAccountEvent).values(values);
    }

    async restoreArchivedAccount(
        id: string,
        now: Date,
    ): Promise<ListedAccount> {
        const [row] = await this.database
            .update(propAccount)
            .set({ archivedAt: null, updatedAt: now })
            .where(
                and(
                    eq(propAccount.id, id),
                    eq(propAccount.userId, this.userId),
                ),
            )
            .returning();
        if (row === undefined) {
            throw new PropRecordNotFoundError(PropRecord.Account);
        }
        return readListedAccount(row);
    }
}

export class PropInvalidStoredRecordError
    extends Error
    implements PropRejectionSource
{
    readonly propRejection: PropRejection;

    constructor(
        readonly record: PropRecord,
        detail: string,
        recordId: null | string,
        label: null | string,
    ) {
        super(
            `Your stored ${record}${label === null ? '' : ` "${label}"`} is not valid: ${detail}. ${storedRecordRemedy(record)}`,
        );
        this.name = 'PropInvalidStoredRecordError';
        this.propRejection = {
            lifecycleRejection: null,
            limit: null,
            quota: null,
            reason: PropStoredRecordRejection.InvalidStoredRecord,
            record,
            recordId,
        };
    }
}

export class PropListTooLargeError
    extends Error
    implements PropRejectionSource
{
    readonly propRejection: PropRejection;

    constructor(
        readonly record: PropRecord,
        readonly limit: number,
    ) {
        super(
            `More than ${limit} ${record} rows match; ${narrowingHint(record)}`,
        );
        this.name = 'PropListTooLargeError';
        this.propRejection = {
            lifecycleRejection: null,
            limit,
            quota: null,
            reason: PropLimitRejection.ListTooLarge,
            record,
            recordId: null,
        };
    }
}

export class PropRecordNotFoundError extends Error {
    constructor(readonly record: PropRecord) {
        super(`${capitalized(record)} not found`);
        this.name = 'PropRecordNotFoundError';
    }
}

export function readAccount(row: PropAccountRow): OwnedAccount {
    return readStored(
        PropRecord.Account,
        () => ({
            ...row,
            optIns: readPlanOptIns(row.optIns),
            personalRules: readPersonalRules(row.personalRules),
            readIssues: planReadIssues(row),
        }),
        row.id,
        row.label,
    );
}

export function readEvent(row: PropAccountEventRow): OwnedEvent {
    const detail = readStored(
        PropRecord.Event,
        () => readAccountEventDetail(row.detail),
        row.id,
        null,
    );
    return { ...row, detail };
}

function boundedRows<Row>(
    rows: Row[],
    limit: number,
    record: PropRecord,
): Row[] {
    if (rows.length > limit) throw new PropListTooLargeError(record, limit);
    return rows;
}

function capitalized(text: string): string {
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function narrowingHint(record: PropRecord): string {
    switch (record) {
        case PropRecord.Account:
        case PropRecord.CopyGroup:
        case PropRecord.Decision:
        case PropRecord.Fee:
        case PropRecord.Payout:
        case PropRecord.Rulebook:
        case PropRecord.Scenario:
        case PropRecord.Snapshot: {
            return `remove some ${record} entries to get back under the limit`;
        }
        case PropRecord.Event: {
            return 'narrow the date range or pick one account';
        }
    }
}

function planReadIssues(row: PropAccountRow): AccountReadIssue[] {
    const plan = resolvePlanKey({
        accountSize: row.accountSize,
        firmId: row.firmId,
        optIns: row.optIns,
        planSerial: row.planSerial,
        readIssues: [],
    });
    return plan.kind === PlanKeyResolutionKind.Unresolved
        ? [{ kind: AccountReadIssueKind.UnresolvablePlan, reason: plan.reason }]
        : [];
}

function readableEvents(rows: readonly PropAccountEventRow[]): OwnedEvent[] {
    return rows.map((row) => {
        try {
            return readEvent(row);
        } catch (error) {
            if (!(error instanceof PropInvalidStoredRecordError)) throw error;
            captureError(error, {
                fields: { accountId: row.accountId, eventId: row.id },
                tag: CORRUPT_ROW_TAG,
            });
            return { ...row, detail: UNREADABLE_EVENT_DETAIL };
        }
    });
}

function readListedAccount(row: PropAccountRow): ListedAccount {
    try {
        return readAccount(row);
    } catch (error) {
        if (!(error instanceof PropInvalidStoredRecordError)) throw error;
        captureError(error, {
            fields: { accountId: row.id },
            tag: CORRUPT_ROW_TAG,
        });
        const personalRules = readPersonalRulesOrNull(row.personalRules);
        return {
            ...row,
            optIns: readPlanOptInsOrNull(row.optIns) ?? NO_PLAN_OPT_INS,
            personalRules,
            readIssues:
                personalRules === null
                    ? [
                          ...planReadIssues(row),
                          { kind: AccountReadIssueKind.CorruptPersonalRules },
                      ]
                    : planReadIssues(row),
        };
    }
}

function readPlanTolerantAccount(row: PropAccountRow): OwnedAccount {
    const personalRules = readStored(
        PropRecord.Account,
        () => readPersonalRules(row.personalRules),
        row.id,
        row.label,
    );
    return { ...readListedAccount(row), personalRules };
}

function readStored<Value>(
    record: PropRecord,
    read: () => Value,
    recordId: null | string,
    label: null | string,
): Value {
    try {
        return read();
    } catch (error) {
        if (error instanceof ZodError) {
            throw new PropInvalidStoredRecordError(
                record,
                error.issues.map((issue) => issue.message).join('; '),
                recordId,
                label,
            );
        }
        throw error;
    }
}

function storedRecordRemedy(record: PropRecord): string {
    switch (record) {
        case PropRecord.Account: {
            return STORED_DATA_OWNER_REPAIR;
        }
        case PropRecord.CopyGroup:
        case PropRecord.Decision:
        case PropRecord.Fee:
        case PropRecord.Payout:
        case PropRecord.Scenario:
        case PropRecord.Snapshot: {
            return `Remove the ${record} and enter it again, or contact the site owner`;
        }
        case PropRecord.Event: {
            return 'There is nothing to do: the event is still counted, and its note and change details are left out and reported';
        }
        case PropRecord.Rulebook: {
            return 'Save a valid rulebook or reset it to the defaults';
        }
    }
}
