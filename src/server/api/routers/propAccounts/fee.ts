import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { PropAccountRepo, PropQuotaGuard } from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    propFeeOutputSchema,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    entityIdSchema,
    feeCreateSchema,
    feeUpdateSchema,
    ledgerListSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propFee } from '~/server/db/schemas/prop';

import {
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Fee);

export const propFeeRouter = createTRPCRouter({
    create: mutation
        .input(feeCreateSchema)
        .output(propFeeOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                await repo.loadOwnedAccountOrThrow(input.accountId);
                await quotas.assertWithin(PropQuota.Fees, 1);
                const [row] = await tx
                    .insert(propFee)
                    .values({ ...input, userId: ctx.userId })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Fee);
            }),
        ),

    list: propProcedure
        .input(ledgerListSchema)
        .output(z.array(propFeeOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listFees(input.accountId),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const fee = await repo.loadOwnedFeeOrThrow(input.id);
                await tx.delete(propFee).where(ownedFee(fee.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    update: mutation
        .input(feeUpdateSchema)
        .output(propFeeOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const fee = await repo.loadOwnedFeeOrThrow(input.id);
                const [row] = await tx
                    .update(propFee)
                    .set({
                        amountCents: input.amountCents,
                        kind: input.kind,
                        note: input.note,
                        paidOn: input.paidOn,
                        updatedAt: new Date(),
                    })
                    .where(ownedFee(fee.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Fee);
            }),
        ),
});

function ownedFee(id: string, userId: string) {
    return and(eq(propFee.id, id), eq(propFee.userId, userId));
}
