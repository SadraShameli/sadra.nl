import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { PropAccountRepo, PropQuotaGuard } from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    propFirmStatementOutputSchema,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    entityIdSchema,
    firmStatementCreateSchema,
    firmStatementUpdateSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propFirmStatement } from '~/server/db/schemas/prop';

import {
    assertExternalFirmOwned,
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.FirmStatement);

export const propFirmStatementRouter = createTRPCRouter({
    create: mutation
        .input(firmStatementCreateSchema)
        .output(propFirmStatementOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                await assertExternalFirmOwned(repo, input.externalFirmId);
                await quotas.assertWithin(PropQuota.FirmStatements, 1);
                const [row] = await tx
                    .insert(propFirmStatement)
                    .values({ ...input, userId: ctx.userId })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.FirmStatement);
            }),
        ),

    list: propProcedure
        .output(z.array(propFirmStatementOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listFirmStatements(),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const statement = await repo.loadOwnedFirmStatementOrThrow(
                    input.id,
                );
                await tx
                    .delete(propFirmStatement)
                    .where(ownedStatement(statement.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    update: mutation
        .input(firmStatementUpdateSchema)
        .output(propFirmStatementOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const statement = await repo.loadOwnedFirmStatementOrThrow(
                    input.id,
                );
                const [row] = await tx
                    .update(propFirmStatement)
                    .set({
                        asOf: input.asOf,
                        basis: input.basis,
                        note: input.note,
                        reportedPayoutCents: input.reportedPayoutCents,
                        updatedAt: new Date(),
                    })
                    .where(ownedStatement(statement.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.FirmStatement);
            }),
        ),
});

function ownedStatement(id: string, userId: string) {
    return and(
        eq(propFirmStatement.id, id),
        eq(propFirmStatement.userId, userId),
    );
}
