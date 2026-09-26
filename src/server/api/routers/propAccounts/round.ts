import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { compareText, RoundStatus } from '~/lib/prop-accounts';
import { PropAccountRepo, PropQuotaGuard } from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    PropMutationRejection,
    PropQuota,
    PropRecord,
    propRoundOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import {
    entityIdSchema,
    roundCloseSchema,
    roundCreateSchema,
    roundUpdateSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propRound, type PropRoundRow } from '~/server/db/schemas/prop';

import {
    assertExternalFirmOwned,
    propMutationProcedure,
    PropMutationRejectionError,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Round);

export const propRoundRouter = createTRPCRouter({
    close: mutation
        .input(roundCloseSchema)
        .output(propRoundOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const round = await repo.loadOwnedRoundOrThrow(input.id, true);
                if (round.closedOn !== null) {
                    throw new PropMutationRejectionError(
                        PropMutationRejection.RoundClosed,
                        `Round "${round.label}" already closed on ${round.closedOn}`,
                    );
                }
                assertClosesAfterOpening(round, round.openedOn, input.closedOn);
                const [row] = await tx
                    .update(propRound)
                    .set({
                        closedOn: input.closedOn,
                        status: RoundStatus.Closed,
                        updatedAt: new Date(),
                    })
                    .where(ownedRound(round.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Round);
            }),
        ),

    create: mutation
        .input(roundCreateSchema)
        .output(propRoundOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                await assertExternalFirmOwned(repo, input.externalFirmId);
                await quotas.assertWithin(PropQuota.Rounds, 1);
                const [row] = await tx
                    .insert(propRound)
                    .values({
                        ...input,
                        closedOn: null,
                        status: RoundStatus.Open,
                        userId: ctx.userId,
                    })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Round);
            }),
        ),

    list: propProcedure
        .output(z.array(propRoundOutputSchema))
        .query(({ ctx }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listRounds(),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const round = await repo.loadOwnedRoundOrThrow(input.id, true);
                if (await repo.isRoundInUse(round.id)) {
                    throw new PropMutationRejectionError(
                        PropMutationRejection.RecordInUse,
                        `Round "${round.label}" still has accounts; move them to another round or out of any round first`,
                    );
                }
                await tx
                    .delete(propRound)
                    .where(ownedRound(round.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    update: mutation
        .input(roundUpdateSchema)
        .output(propRoundOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const round = await repo.loadOwnedRoundOrThrow(input.id, true);
                await assertExternalFirmOwned(repo, input.externalFirmId);
                if (round.closedOn !== null) {
                    assertClosesAfterOpening(
                        round,
                        input.openedOn,
                        round.closedOn,
                    );
                }
                const [row] = await tx
                    .update(propRound)
                    .set({
                        budgetCents: input.budgetCents,
                        externalFirmId: input.externalFirmId,
                        firmId: input.firmId,
                        label: input.label,
                        notes: input.notes,
                        openedOn: input.openedOn,
                        updatedAt: new Date(),
                    })
                    .where(ownedRound(round.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Round);
            }),
        ),
});

function assertClosesAfterOpening(
    round: Pick<PropRoundRow, 'label'>,
    openedOn: string,
    closedOn: string,
): void {
    if (compareText(closedOn, openedOn) >= 0) return;
    throw new PropMutationRejectionError(
        PropMutationRejection.OutOfOrderEvent,
        `Round "${round.label}" would close on ${closedOn}, before it opens on ${openedOn}; pick dates in order`,
    );
}

function ownedRound(id: string, userId: string) {
    return and(eq(propRound.id, id), eq(propRound.userId, userId));
}
