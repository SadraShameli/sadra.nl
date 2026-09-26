import { TRPCError } from '@trpc/server';
import 'server-only';
import { type z } from 'zod';

import { formatConjunctionList } from '~/lib/format';
import { isWithinRateLimit } from '~/lib/observability/rate-limit';
import {
    AccountEventKind,
    AccountStage,
    accountStageLabel,
    describeUnresolvedPlan,
    hasMixedStages,
    impliedEvalPassOn,
    type LifecycleRejection,
    liveStartEntryIssues,
    type PlanKeyInput,
    PlanKeyResolutionKind,
    resolvePlanKey,
    type SnapshotEntryAccount,
    stageCountsOf,
} from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PROP_MUTATION_WINDOW_MS,
    PROP_MUTATIONS_PER_WINDOW,
    type PropAccountRepo,
    PropInvalidStoredRecordError,
    PropListTooLargeError,
    PropQuotaExceededError,
    PropRecordNotFoundError,
} from '~/lib/prop-accounts/server';
import { type Plan } from '~/lib/prop-calculator';
import {
    PropMutationRejection,
    type PropRecord,
    type PropRejection,
    type PropRejectionSource,
} from '~/lib/schemas/propAccountOutputs';
import { type accountUpdateSchema } from '~/lib/schemas/propAccounts';
import { protectedProcedure } from '~/server/api/trpc';

export enum PropRouterBucket {
    Account = 'account',
    CopyGroup = 'copy-group',
    Decision = 'decision',
    Edge = 'edge',
    Event = 'event',
    Fee = 'fee',
    Payout = 'payout',
    Rulebook = 'rulebook',
    Scenario = 'scenario',
    Snapshot = 'snapshot',
}

enum PostgresErrorCode {
    CheckViolation = '23514',
    ForeignKeyViolation = '23503',
    StringTooLong = '22001',
    UniqueViolation = '23505',
}

export interface LiveStartEntry {
    readonly account: SnapshotEntryAccount;
    readonly label: string;
    readonly plan: Plan;
}

interface DatabaseErrorFields {
    readonly code: PostgresErrorCode;
    readonly constraint: null | string;
}

type ValidatedAccountUpdate = z.output<typeof accountUpdateSchema>;

export class PropMutationRejectionError
    extends Error
    implements PropRejectionSource
{
    readonly propRejection: PropRejection;

    constructor(
        readonly reason: PropMutationRejection,
        message: string,
        readonly lifecycleRejection: LifecycleRejection | null = null,
    ) {
        super(message);
        this.name = 'PropMutationRejectionError';
        this.propRejection = {
            lifecycleRejection,
            limit: null,
            quota: null,
            reason,
            record: null,
            recordId: null,
        };
    }
}

const RATE_LIMIT_BUCKET_PREFIX = 'prop-accounts';
const MAX_CAUSE_DEPTH = 5;

const UNIQUE_CONSTRAINT_MESSAGES: Readonly<Record<string, string>> = {
    prop_account_user_label_active_idx:
        'An active account with this label already exists; pick another label or archive the other account',
    prop_copy_group_user_name_idx: 'A copy group with this name already exists',
    prop_saved_scenario_user_name_idx:
        'A saved scenario with this name already exists',
};

export const propProcedure = protectedProcedure.use(async ({ next }) => {
    const result = await next();
    if (!result.ok) {
        const mapped = toPropError(result.error.cause);
        if (mapped !== null) throw mapped;
    }
    return result;
});

export async function assertCopyGroupAcceptsStages(
    repo: PropAccountRepo,
    copyGroupId: string,
    joiningStages: readonly AccountStage[],
    movingAccountId: null | string,
): Promise<void> {
    const group = await repo.loadOwnedCopyGroupOrThrow(copyGroupId);
    const members = await repo.listAccountRefsIn(copyGroupId);
    const memberStages = members
        .filter((member) => member.id !== movingAccountId)
        .map((member) => member.stage);
    const stages = [...memberStages, ...joiningStages];
    if (!hasMixedStages(stages)) return;
    const stageNamesOf = (listed: readonly AccountStage[]) =>
        formatConjunctionList(
            stageCountsOf(listed).map(({ stage }) => accountStageLabel(stage)),
        );
    const joining =
        joiningStages.length === 1
            ? `the account joining is ${stageNamesOf(joiningStages)}`
            : `the accounts joining are ${stageNamesOf(joiningStages)}`;
    const conflict =
        memberStages.length === 0
            ? joining
            : `it already has ${stageNamesOf(memberStages)} members and ${joining}`;
    throw new PropMutationRejectionError(
        PropMutationRejection.MixedStageCopyGroup,
        `Copy group "${group.name}" would mix ${stageNamesOf(stages)} accounts: ${conflict}. The members of a group must share one stage, inactive and archived members included.`,
    );
}

export function assertLiveStartsDocumented(
    entries: readonly LiveStartEntry[],
): void {
    const implausible = entries.flatMap((entry) => {
        const issues = liveStartEntryIssues(
            entry.plan,
            AccountStage.Live,
            entry.account,
        );
        return issues.length === 0 ? [] : [{ entry, issues }];
    });
    const [first] = implausible;
    if (first === undefined) return;
    const others =
        implausible.length > 1
            ? ` (and ${String(implausible.length - 1)} more with a live start outside the documented range)`
            : '';
    throw new PropMutationRejectionError(
        PropMutationRejection.ImplausibleSnapshot,
        `Account "${first.entry.label}" has a live start balance its plan does not document: ${first.issues.map((issue) => issue.message).join(' ')}${others}`,
    );
}

export async function impliedPassBound(
    repo: PropAccountRepo,
    account: Pick<OwnedAccount, 'fundedOn' | 'id' | 'purchasedOn' | 'stage'>,
    plan: Plan,
): Promise<null | string> {
    if (impliedEvalPassOn(account, plan, false) === null) return null;
    const hasRecordedPass = await repo.hasEventOfKind(
        account.id,
        AccountEventKind.EvalPassed,
    );
    return impliedEvalPassOn(account, plan, hasRecordedPass)?.on ?? null;
}

export function propMutationProcedure(bucket: PropRouterBucket) {
    return propRateLimitedProcedure(
        bucket,
        'Too many changes in a short time; wait a minute and try again',
    );
}

export function propRateLimitedProcedure(
    bucket: PropRouterBucket,
    message: string,
) {
    return propProcedure.use(async ({ ctx, next }) => {
        const isAllowed = await isWithinRateLimit({
            bucket: `${RATE_LIMIT_BUCKET_PREFIX}:${bucket}`,
            key: ctx.userId,
            max: PROP_MUTATIONS_PER_WINDOW,
            windowMs: PROP_MUTATION_WINDOW_MS,
        });
        if (!isAllowed) {
            throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message });
        }
        return next();
    });
}

export function resolvedPlanOrThrow(
    key: PlanKeyInput | ValidatedAccountUpdate,
): Plan {
    const resolution = resolvePlanKey(
        'readIssues' in key ? key : { ...key, readIssues: [] },
    );
    switch (resolution.kind) {
        case PlanKeyResolutionKind.Resolved: {
            return resolution.plan;
        }
        case PlanKeyResolutionKind.Unresolved: {
            throw new PropMutationRejectionError(
                PropMutationRejection.UnresolvablePlan,
                describeUnresolvedPlan(key, resolution.reason),
            );
        }
    }
}

export function returnedRowOrThrow<Row>(
    row: Row | undefined,
    record: PropRecord,
): Row {
    if (row === undefined) throw new PropRecordNotFoundError(record);
    return row;
}

function databaseErrorOf(cause: unknown): DatabaseErrorFields | null {
    let current: unknown = cause;
    for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
        if (typeof current !== 'object' || current === null) return null;
        const code: unknown = Reflect.get(current, 'code');
        if (isPostgresErrorCode(code)) {
            const constraint: unknown = Reflect.get(current, 'constraint');
            return {
                code,
                constraint: typeof constraint === 'string' ? constraint : null,
            };
        }
        current = Reflect.get(current, 'cause');
    }
    return null;
}

function fromDatabaseError(
    error: DatabaseErrorFields,
    cause: unknown,
): TRPCError {
    switch (error.code) {
        case PostgresErrorCode.CheckViolation: {
            return new TRPCError({
                cause,
                code: 'BAD_REQUEST',
                message: `A value is outside what the database accepts (check ${error.constraint ?? 'unknown'}); dates must be real days from 2000 through 2100 and amounts within range`,
            });
        }
        case PostgresErrorCode.ForeignKeyViolation: {
            return new TRPCError({
                cause,
                code: 'CONFLICT',
                message:
                    'The change refers to a record that no longer exists, or a record other entries still refer to',
            });
        }
        case PostgresErrorCode.StringTooLong: {
            return new TRPCError({
                cause,
                code: 'BAD_REQUEST',
                message: 'A text value is longer than the database accepts',
            });
        }
        case PostgresErrorCode.UniqueViolation: {
            return new TRPCError({
                cause,
                code: 'CONFLICT',
                message:
                    (error.constraint === null
                        ? undefined
                        : UNIQUE_CONSTRAINT_MESSAGES[error.constraint]) ??
                    'This record already exists',
            });
        }
    }
}

function fromRejection(error: PropMutationRejectionError): TRPCError {
    switch (error.reason) {
        case PropMutationRejection.DuplicateImportLabel:
        case PropMutationRejection.DuplicateSnapshot:
        case PropMutationRejection.MixedStageCopyGroup: {
            return new TRPCError({
                cause: error,
                code: 'CONFLICT',
                message: error.message,
            });
        }
        case PropMutationRejection.ImplausibleSnapshot:
        case PropMutationRejection.LifecycleTransition:
        case PropMutationRejection.MissingSnapshotField:
        case PropMutationRejection.OutOfOrderEvent:
        case PropMutationRejection.StageNotOfferedByPlan:
        case PropMutationRejection.UnresolvablePlan: {
            return new TRPCError({
                cause: error,
                code: 'BAD_REQUEST',
                message: error.message,
            });
        }
    }
}

function isPostgresErrorCode(value: unknown): value is PostgresErrorCode {
    return (
        typeof value === 'string' &&
        (Object.values(PostgresErrorCode) as string[]).includes(value)
    );
}

function toPropError(cause: unknown): null | TRPCError {
    if (cause instanceof PropRecordNotFoundError) {
        return new TRPCError({
            cause,
            code: 'NOT_FOUND',
            message: cause.message,
        });
    }
    if (cause instanceof PropQuotaExceededError) {
        return new TRPCError({
            cause,
            code: 'TOO_MANY_REQUESTS',
            message: cause.message,
        });
    }
    if (cause instanceof PropListTooLargeError) {
        return new TRPCError({
            cause,
            code: 'BAD_REQUEST',
            message: cause.message,
        });
    }
    if (cause instanceof PropInvalidStoredRecordError) {
        return new TRPCError({
            cause,
            code: 'PRECONDITION_FAILED',
            message: cause.message,
        });
    }
    if (cause instanceof PropMutationRejectionError) {
        return fromRejection(cause);
    }
    const databaseError = databaseErrorOf(cause);
    return databaseError === null
        ? null
        : fromDatabaseError(databaseError, cause);
}
