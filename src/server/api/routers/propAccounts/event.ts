import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    type AccountEventChange,
    AccountEventKind,
    type AccountLifecycleState,
    AccountStage,
    AccountStatus,
    AccountTracking,
    applyLifecycleEvent,
    compareText,
    describeLedgerOnlyLifecycleRejection,
    describeLifecycleRejection,
    type ExclusivityAccount,
    LEDGER_ONLY_LIFECYCLE_FACTS,
    LifecycleOutcomeKind,
    type LifecycleRejection,
    LiveExclusivityAction,
    liveExclusivityEffectsOf,
    type PlanLifecycleFacts,
} from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PropAccountRepo,
    PropQuotaGuard,
    readEvent,
} from '~/lib/prop-accounts/server';
import {
    findFirm,
    type FirmId,
    parseFirmId,
    type Plan,
} from '~/lib/prop-calculator';
import {
    propAccountEventOutputSchema,
    PropMutationRejection,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    accountIdSchema,
    eventListSchema,
    eventRecordSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propAccount, propAccountEvent } from '~/server/db/schemas/prop';

import {
    assertLiveStartsDocumented,
    impliedPassBound,
    ownedReferenceOrThrow,
    propMutationProcedure,
    PropMutationRejectionError,
    propProcedure,
    PropRouterBucket,
    resolvedPlanOrThrow,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Event);

export const propEventRouter = createTRPCRouter({
    list: propProcedure
        .input(eventListSchema)
        .output(z.array(propAccountEventOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listEvents(input),
        ),

    listForAccount: propProcedure
        .input(accountIdSchema)
        .output(z.array(propAccountEventOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listEventsForAccount(
                input.id,
            ),
        ),

    record: mutation
        .input(eventRecordSchema)
        .output(propAccountEventOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const stored = await repo.loadOwnedAccountOrThrow(
                    input.accountId,
                    true,
                );
                const confirmedIds = input.confirmedExclusivityAccountIds ?? [];
                const siblings = await lockedSiblingsOf(repo, confirmedIds);
                const plan = lifecyclePlanOf(stored);
                const facts = plan ?? LEDGER_ONLY_LIFECYCLE_FACTS;
                const outcome = applyLifecycleEvent(facts, stored, input.kind);
                if (outcome.kind === LifecycleOutcomeKind.Rejected) {
                    throw new PropMutationRejectionError(
                        PropMutationRejection.LifecycleTransition,
                        plan === null
                            ? describeLedgerOnlyLifecycleRejection(
                                  outcome.reason,
                                  stored.stage,
                              )
                            : describeLifecycleRejection(outcome.reason, {
                                  facts: plan,
                                  stage: stored.stage,
                              }),
                        outcome.reason,
                    );
                }
                if (
                    plan !== null &&
                    outcome.state.stage === AccountStage.Live &&
                    stored.stage !== AccountStage.Live
                ) {
                    assertLiveStartsDocumented([
                        { account: stored, label: stored.label, plan },
                    ]);
                }
                assertInOrder(
                    stored,
                    await repo.latestLifecycleEventOn(stored.id),
                    await impliedPassBound(repo, stored, facts),
                    input.occurredOn,
                );
                const suspensions = await suspensionsOf({
                    movedLive: {
                        account: stored,
                        plan,
                        state: outcome.state,
                    },
                    occurredOn: input.occurredOn,
                    repo,
                    siblings,
                });
                await quotas.assertWithin(
                    PropQuota.Events,
                    1 + suspensions.length,
                );
                const changes: AccountEventChange[] = [
                    {
                        field: 'stage',
                        from: stored.stage,
                        to: outcome.state.stage,
                    },
                    {
                        field: 'status',
                        from: stored.status,
                        to: outcome.state.status,
                    },
                ].filter((change) => change.from !== change.to);
                if (changes.length > 0) {
                    await tx
                        .update(propAccount)
                        .set({
                            stage: outcome.state.stage,
                            status: outcome.state.status,
                            updatedAt: new Date(),
                        })
                        .where(
                            and(
                                eq(propAccount.id, stored.id),
                                eq(propAccount.userId, ctx.userId),
                            ),
                        );
                }
                const [row] = await tx
                    .insert(propAccountEvent)
                    .values({
                        accountId: stored.id,
                        detail: {
                            bustCause: input.bustCause,
                            changes,
                            note: input.note,
                        },
                        kind: input.kind,
                        occurredOn: input.occurredOn,
                        userId: ctx.userId,
                    })
                    .returning();
                for (const suspension of suspensions) {
                    await tx
                        .update(propAccount)
                        .set({
                            status: AccountStatus.Suspended,
                            updatedAt: new Date(),
                        })
                        .where(
                            and(
                                eq(propAccount.id, suspension.account.id),
                                eq(propAccount.userId, ctx.userId),
                            ),
                        );
                    await tx.insert(propAccountEvent).values({
                        accountId: suspension.account.id,
                        detail: {
                            changes: [
                                {
                                    field: 'status',
                                    from: suspension.account.status,
                                    to: AccountStatus.Suspended,
                                },
                            ],
                            note: `Suspended because "${stored.label}" moved live and the firm's verified policy takes its other accounts out of play while live`,
                        },
                        kind: AccountEventKind.Suspended,
                        occurredOn: input.occurredOn,
                        userId: ctx.userId,
                    });
                }
                return readEvent(returnedRowOrThrow(row, PropRecord.Event));
            }),
        ),
});

interface LockedSibling {
    readonly account: OwnedAccount;
    readonly facts: PlanLifecycleFacts;
    readonly firmId: FirmId | undefined;
    readonly plan: null | Plan;
}

interface MovedLiveAccount {
    readonly account: OwnedAccount;
    readonly plan: null | Plan;
    readonly state: AccountLifecycleState;
}

interface Suspension {
    readonly account: OwnedAccount;
}

function assertInOrder(
    stored: OwnedAccount,
    latestEventOn: null | string,
    impliedPassOn: null | string,
    occurredOn: string,
): void {
    if (compareText(occurredOn, stored.purchasedOn) < 0) {
        throw new PropMutationRejectionError(
            PropMutationRejection.OutOfOrderEvent,
            `The event date ${occurredOn} is before the purchase date ${stored.purchasedOn}; fix the purchase date first`,
        );
    }
    if (latestEventOn !== null && compareText(occurredOn, latestEventOn) < 0) {
        throw new PropMutationRejectionError(
            PropMutationRejection.OutOfOrderEvent,
            `The event date ${occurredOn} is before the latest recorded lifecycle event on ${latestEventOn}; record events in date order`,
        );
    }
    if (impliedPassOn !== null && compareText(occurredOn, impliedPassOn) < 0) {
        throw new PropMutationRejectionError(
            PropMutationRejection.OutOfOrderEvent,
            `The event date ${occurredOn} is before the funded date ${impliedPassOn}, where the account passed its evaluation; pick a date on or after it, or fix the funded date first`,
        );
    }
}

function exclusivityRejection(
    message: string,
    lifecycleRejection: LifecycleRejection | null = null,
): PropMutationRejectionError {
    return new PropMutationRejectionError(
        PropMutationRejection.LifecycleTransition,
        message,
        lifecycleRejection,
    );
}

function lifecyclePlanOf(stored: OwnedAccount): null | Plan {
    switch (stored.tracking) {
        case AccountTracking.LedgerOnly: {
            return null;
        }
        case AccountTracking.Modeled: {
            return resolvedPlanOrThrow(stored);
        }
    }
}

async function lockedSiblingsOf(
    repo: PropAccountRepo,
    ids: readonly string[],
): Promise<readonly LockedSibling[]> {
    const siblings: LockedSibling[] = [];
    for (const id of ids) {
        const account = await ownedReferenceOrThrow(
            () => repo.loadOwnedAccountOrThrow(id, true),
            'An account you confirmed is not one of your accounts',
        );
        const plan = lifecyclePlanOf(account);
        siblings.push({
            account,
            facts: plan ?? LEDGER_ONLY_LIFECYCLE_FACTS,
            firmId: plan === null ? storedFirmIdOf(account) : plan.id.firm,
            plan,
        });
    }
    return siblings;
}

function storedFirmIdOf(account: OwnedAccount): FirmId | undefined {
    return account.firmId === null ? undefined : parseFirmId(account.firmId);
}

function suspendSetOf(
    movedLive: MovedLiveAccount,
    siblings: readonly LockedSibling[],
): ReadonlySet<string> {
    const { plan } = movedLive;
    if (plan === null) return new Set();
    const firm = findFirm(plan.id.firm);
    if (firm === undefined) return new Set();
    const accounts: ExclusivityAccount[] = [
        {
            accountPolicy: firm.accountPolicy,
            events: [],
            firmId: plan.id.firm,
            id: movedLive.account.id,
            plan,
            stage: movedLive.state.stage,
            status: movedLive.state.status,
        },
        ...siblings.flatMap((sibling) =>
            sibling.firmId === undefined || sibling.account.archivedAt !== null
                ? []
                : [
                      {
                          accountPolicy: firm.accountPolicy,
                          events: [],
                          firmId: sibling.firmId,
                          id: sibling.account.id,
                          plan: sibling.plan ?? plan,
                          stage: sibling.account.stage,
                          status: sibling.account.status,
                      },
                  ],
        ),
    ];
    return new Set(
        liveExclusivityEffectsOf(
            accounts,
            movedLive.account.id,
        ).effects.flatMap((effect) =>
            effect.action === LiveExclusivityAction.Suspend
                ? [effect.accountId]
                : [],
        ),
    );
}

async function suspensionsOf({
    movedLive,
    occurredOn,
    repo,
    siblings,
}: {
    readonly movedLive: MovedLiveAccount;
    readonly occurredOn: string;
    readonly repo: PropAccountRepo;
    readonly siblings: readonly LockedSibling[];
}): Promise<readonly Suspension[]> {
    if (siblings.length === 0) return [];
    for (const sibling of siblings) {
        const outcome = applyLifecycleEvent(
            sibling.facts,
            sibling.account,
            AccountEventKind.Suspended,
        );
        if (outcome.kind === LifecycleOutcomeKind.Rejected) {
            throw exclusivityRejection(
                sibling.plan === null
                    ? describeLedgerOnlyLifecycleRejection(
                          outcome.reason,
                          sibling.account.stage,
                      )
                    : describeLifecycleRejection(outcome.reason, {
                          facts: sibling.plan,
                          stage: sibling.account.stage,
                      }),
                outcome.reason,
            );
        }
    }
    const suspendedIds = suspendSetOf(movedLive, siblings);
    const outside = siblings.find(
        (sibling) => !suspendedIds.has(sibling.account.id),
    );
    if (outside !== undefined) {
        throw exclusivityRejection(
            `Account "${outside.account.label}" (${outside.account.id}) is not one of the accounts the firm's verified policy suspends when an account moves live`,
        );
    }
    for (const sibling of siblings) {
        assertInOrder(
            sibling.account,
            await repo.latestLifecycleEventOn(sibling.account.id),
            await impliedPassBound(repo, sibling.account, sibling.facts),
            occurredOn,
        );
    }
    return siblings.map((sibling) => ({ account: sibling.account }));
}
