import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    type AccountEventChange,
    AccountStage,
    applyLifecycleEvent,
    compareText,
    describeLifecycleRejection,
    LifecycleOutcomeKind,
} from '~/lib/prop-accounts';
import {
    type OwnedAccount,
    PropAccountRepo,
    PropQuotaGuard,
    readEvent,
} from '~/lib/prop-accounts/server';
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
                const plan = resolvedPlanOrThrow(stored);
                const outcome = applyLifecycleEvent(plan, stored, input.kind);
                if (outcome.kind === LifecycleOutcomeKind.Rejected) {
                    throw new PropMutationRejectionError(
                        PropMutationRejection.LifecycleTransition,
                        describeLifecycleRejection(outcome.reason, {
                            facts: plan,
                            stage: stored.stage,
                        }),
                        outcome.reason,
                    );
                }
                if (
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
                    await impliedPassBound(repo, stored, plan),
                    input.occurredOn,
                );
                await quotas.assertWithin(PropQuota.Events, 1);
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
                        detail: { changes, note: input.note },
                        kind: input.kind,
                        occurredOn: input.occurredOn,
                        userId: ctx.userId,
                    })
                    .returning();
                return readEvent(returnedRowOrThrow(row, PropRecord.Event));
            }),
        ),
});

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
