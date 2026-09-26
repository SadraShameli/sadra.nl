import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { PropAccountRepo, PropQuotaGuard } from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    propFirmEngagementOutputSchema,
    PropQuota,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import {
    entityIdSchema,
    firmEngagementSetSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propFirmEngagement } from '~/server/db/schemas/prop';

import {
    assertExternalFirmOwned,
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.FirmEngagement);

export const propFirmEngagementRouter = createTRPCRouter({
    list: propProcedure
        .output(z.array(propFirmEngagementOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listFirmEngagements(),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const engagement = await repo.loadOwnedFirmEngagementOrThrow(
                    input.id,
                );
                await tx
                    .delete(propFirmEngagement)
                    .where(ownedEngagement(engagement.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    set: mutation
        .input(firmEngagementSetSchema)
        .output(propFirmEngagementOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                await assertExternalFirmOwned(repo, input.externalFirmId);
                const engagements = await repo.listFirmEngagements();
                const existing = engagements.find(
                    (engagement) =>
                        engagement.firmId === input.firmId &&
                        engagement.externalFirmId === input.externalFirmId,
                );
                if (existing === undefined) {
                    await quotas.assertWithin(PropQuota.FirmEngagements, 1);
                    const [row] = await tx
                        .insert(propFirmEngagement)
                        .values({ ...input, userId: ctx.userId })
                        .returning();
                    return returnedRowOrThrow(row, PropRecord.FirmEngagement);
                }
                const [row] = await tx
                    .update(propFirmEngagement)
                    .set({
                        note: input.note,
                        reason: input.reason,
                        sentLiveOn: input.sentLiveOn,
                        sinceOn: input.sinceOn,
                        status: input.status,
                        updatedAt: new Date(),
                    })
                    .where(ownedEngagement(existing.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.FirmEngagement);
            }),
        ),
});

function ownedEngagement(id: string, userId: string) {
    return and(
        eq(propFirmEngagement.id, id),
        eq(propFirmEngagement.userId, userId),
    );
}
