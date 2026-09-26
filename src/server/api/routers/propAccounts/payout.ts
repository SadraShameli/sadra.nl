import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { PropAccountRepo, PropQuotaGuard } from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    propPayoutOutputSchema,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    entityIdSchema,
    ledgerListSchema,
    payoutCreateSchema,
    payoutUpdateSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propPayout } from '~/server/db/schemas/prop';

import {
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Payout);

export const propPayoutRouter = createTRPCRouter({
    create: mutation
        .input(payoutCreateSchema)
        .output(propPayoutOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                await repo.loadOwnedAccountOrThrow(input.accountId);
                await quotas.assertWithin(PropQuota.Payouts, 1);
                const [row] = await tx
                    .insert(propPayout)
                    .values({ ...input, userId: ctx.userId })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Payout);
            }),
        ),

    list: propProcedure
        .input(ledgerListSchema)
        .output(z.array(propPayoutOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listPayouts(
                input.accountId,
            ),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const payout = await repo.loadOwnedPayoutOrThrow(input.id);
                await tx
                    .delete(propPayout)
                    .where(ownedPayout(payout.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    update: mutation
        .input(payoutUpdateSchema)
        .output(propPayoutOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const payout = await repo.loadOwnedPayoutOrThrow(input.id);
                const [row] = await tx
                    .update(propPayout)
                    .set({
                        grossCents: input.grossCents,
                        netCents: input.netCents,
                        note: input.note,
                        paidOn: input.paidOn,
                        requestedOn: input.requestedOn,
                        status: input.status,
                        updatedAt: new Date(),
                    })
                    .where(ownedPayout(payout.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Payout);
            }),
        ),
});

function ownedPayout(id: string, userId: string) {
    return and(eq(propPayout.id, id), eq(propPayout.userId, userId));
}
