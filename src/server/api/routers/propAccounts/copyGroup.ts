import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    PropAccountRepo,
    PropQuotaGuard,
    readAccount,
} from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    propAccountOutputSchema,
    propCopyGroupOutputSchema,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    copyGroupAssignSchema,
    copyGroupCreateSchema,
    copyGroupUpdateSchema,
    entityIdSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propAccount, propCopyGroup } from '~/server/db/schemas/prop';

import {
    assertCopyGroupAcceptsStages,
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.CopyGroup);

export const propCopyGroupRouter = createTRPCRouter({
    assign: mutation
        .input(copyGroupAssignSchema)
        .output(propAccountOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const stored = await repo.loadOwnedAccountOrThrow(
                    input.accountId,
                    true,
                );
                if (input.copyGroupId === stored.copyGroupId) return stored;
                if (input.copyGroupId !== null) {
                    await assertCopyGroupAcceptsStages(
                        repo,
                        input.copyGroupId,
                        [stored.stage],
                        stored.id,
                    );
                }
                await quotas.assertWithin(PropQuota.Events, 1);
                const now = new Date();
                const [row] = await tx
                    .update(propAccount)
                    .set({ copyGroupId: input.copyGroupId, updatedAt: now })
                    .where(
                        and(
                            eq(propAccount.id, stored.id),
                            eq(propAccount.userId, ctx.userId),
                        ),
                    )
                    .returning();
                await repo.recordEdits(
                    [
                        {
                            accountId: stored.id,
                            changes: [
                                {
                                    field: 'copyGroupId',
                                    from: stored.copyGroupId,
                                    to: input.copyGroupId,
                                },
                            ],
                            purchasedOn: stored.purchasedOn,
                        },
                    ],
                    now,
                );
                return readAccount(returnedRowOrThrow(row, PropRecord.Account));
            }),
        ),

    create: mutation
        .input(copyGroupCreateSchema)
        .output(propCopyGroupOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                await quotas.assertWithin(PropQuota.CopyGroups, 1);
                const [row] = await tx
                    .insert(propCopyGroup)
                    .values({ ...input, userId: ctx.userId })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.CopyGroup);
            }),
        ),

    list: propProcedure
        .output(z.array(propCopyGroupOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listCopyGroups(),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const group = await repo.loadOwnedCopyGroupOrThrow(input.id);
                const members = await repo.listAccountRefsIn(group.id);
                if (members.length > 0) {
                    const now = new Date();
                    await tx
                        .update(propAccount)
                        .set({ copyGroupId: null, updatedAt: now })
                        .where(
                            and(
                                eq(propAccount.userId, ctx.userId),
                                eq(propAccount.copyGroupId, group.id),
                            ),
                        );
                    await repo.recordEdits(
                        members.map((member) => ({
                            accountId: member.id,
                            changes: [
                                {
                                    field: 'copyGroupId',
                                    from: group.id,
                                    to: null,
                                },
                            ],
                            purchasedOn: member.purchasedOn,
                        })),
                        now,
                    );
                }
                await tx
                    .delete(propCopyGroup)
                    .where(ownedGroup(group.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    update: mutation
        .input(copyGroupUpdateSchema)
        .output(propCopyGroupOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const group = await repo.loadOwnedCopyGroupOrThrow(input.id);
                const [row] = await tx
                    .update(propCopyGroup)
                    .set({
                        name: input.name,
                        notes: input.notes,
                        updatedAt: new Date(),
                    })
                    .where(ownedGroup(group.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.CopyGroup);
            }),
        ),
});

function ownedGroup(id: string, userId: string) {
    return and(eq(propCopyGroup.id, id), eq(propCopyGroup.userId, userId));
}
