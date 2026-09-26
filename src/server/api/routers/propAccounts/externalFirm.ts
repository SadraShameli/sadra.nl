import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { PropAccountRepo, PropQuotaGuard } from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    propExternalFirmOutputSchema,
    PropMutationRejection,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    entityIdSchema,
    externalFirmCreateSchema,
    externalFirmUpdateSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propExternalFirm } from '~/server/db/schemas/prop';

import {
    propMutationProcedure,
    PropMutationRejectionError,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.ExternalFirm);

export const propExternalFirmRouter = createTRPCRouter({
    create: mutation
        .input(externalFirmCreateSchema)
        .output(propExternalFirmOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                await quotas.assertWithin(PropQuota.ExternalFirms, 1);
                const [row] = await tx
                    .insert(propExternalFirm)
                    .values({ ...input, userId: ctx.userId })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.ExternalFirm);
            }),
        ),

    list: propProcedure
        .output(z.array(propExternalFirmOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listExternalFirms(),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const firm = await repo.loadOwnedExternalFirmOrThrow(input.id);
                if (await repo.isExternalFirmInUse(firm.id)) {
                    throw new PropMutationRejectionError(
                        PropMutationRejection.RecordInUse,
                        `Firm "${firm.name}" is still used by an account, a round, a firm status or a firm statement; move or remove those first`,
                    );
                }
                await tx
                    .delete(propExternalFirm)
                    .where(ownedFirm(firm.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    update: mutation
        .input(externalFirmUpdateSchema)
        .output(propExternalFirmOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const firm = await repo.loadOwnedExternalFirmOrThrow(input.id);
                const [row] = await tx
                    .update(propExternalFirm)
                    .set({
                        name: input.name,
                        notes: input.notes,
                        updatedAt: new Date(),
                    })
                    .where(ownedFirm(firm.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.ExternalFirm);
            }),
        ),
});

function ownedFirm(id: string, userId: string) {
    return and(
        eq(propExternalFirm.id, id),
        eq(propExternalFirm.userId, userId),
    );
}
