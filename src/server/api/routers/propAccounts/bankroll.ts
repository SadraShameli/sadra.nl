import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { PropAccountRepo, PropQuotaGuard } from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    propBankrollTransferOutputSchema,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    bankrollTransferCreateSchema,
    bankrollTransferUpdateSchema,
    entityIdSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propBankrollTransfer } from '~/server/db/schemas/prop';

import {
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Bankroll);

export const propBankrollRouter = createTRPCRouter({
    create: mutation
        .input(bankrollTransferCreateSchema)
        .output(propBankrollTransferOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                await quotas.assertWithin(PropQuota.BankrollTransfers, 1);
                const [row] = await tx
                    .insert(propBankrollTransfer)
                    .values({ ...input, userId: ctx.userId })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.BankrollTransfer);
            }),
        ),

    list: propProcedure
        .output(z.array(propBankrollTransferOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listBankrollTransfers(),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const transfer = await repo.loadOwnedBankrollTransferOrThrow(
                    input.id,
                );
                await tx
                    .delete(propBankrollTransfer)
                    .where(ownedTransfer(transfer.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    update: mutation
        .input(bankrollTransferUpdateSchema)
        .output(propBankrollTransferOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const transfer = await repo.loadOwnedBankrollTransferOrThrow(
                    input.id,
                );
                const [row] = await tx
                    .update(propBankrollTransfer)
                    .set({
                        amountCents: input.amountCents,
                        kind: input.kind,
                        note: input.note,
                        occurredOn: input.occurredOn,
                        updatedAt: new Date(),
                    })
                    .where(ownedTransfer(transfer.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.BankrollTransfer);
            }),
        ),
});

function ownedTransfer(id: string, userId: string) {
    return and(
        eq(propBankrollTransfer.id, id),
        eq(propBankrollTransfer.userId, userId),
    );
}
