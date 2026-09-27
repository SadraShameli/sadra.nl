import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    CentsDisplay,
    compareText,
    formatUsdCents,
    RoundStatus,
    usdCents,
} from '~/lib/prop-accounts';
import { willExceedRoundBudget } from '~/lib/prop-accounts/bankroll';
import { signedFeeCents } from '~/lib/prop-accounts/metrics';
import {
    PropAccountRepo,
    PropQuotaGuard,
    readAccount,
} from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    propAccountOutputSchema,
    PropMutationRejection,
    PropQuota,
    PropRecord,
    propRoundOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import {
    entityIdSchema,
    roundAssignSchema,
    roundCloseSchema,
    roundCreateSchema,
    roundUpdateSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propAccount, propRound, type PropRoundRow } from '~/server/db/schemas/prop';

import {
    assertExternalFirmOwned,
    ownedReferenceOrThrow,
    propMutationProcedure,
    PropMutationRejectionError,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Round);
const ROUND_NOT_OWNED = 'The round you picked is not one of your rounds';

export const propRoundRouter = createTRPCRouter({
    assign: mutation
        .input(roundAssignSchema)
        .output(propAccountOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const stored = await repo.loadOwnedAccountOrThrow(
                    input.accountId,
                    true,
                );
                await assertRoundAcceptsMembership(
                    repo,
                    input.roundId,
                    input.overrideRoundBudget,
                );
                const [row] = await tx
                    .update(propAccount)
                    .set({ roundId: input.roundId, updatedAt: new Date() })
                    .where(ownedAccount(stored.id, ctx.userId))
                    .returning();
                return readAccount(returnedRowOrThrow(row, PropRecord.Account));
            }),
        ),

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

export async function assertRoundAcceptsMembership(
    repo: PropAccountRepo,
    roundId: null | string,
    shouldOverrideRoundBudget: boolean,
): Promise<void> {
    if (roundId === null) return;
    const round = await loadOpenOwnedRoundOrThrow(repo, roundId);
    if (shouldOverrideRoundBudget) return;
    await assertRoundWithinBudget(repo, round);
}

export async function assertRoundWithinBudget(
    repo: PropAccountRepo,
    round: Pick<PropRoundRow, 'budgetCents' | 'id' | 'label'>,
): Promise<void> {
    const spentCents = await roundSpentCents(repo, round.id);
    if (willExceedRoundBudget(round.budgetCents, spentCents, 0)) {
        throw new PropMutationRejectionError(
            PropMutationRejection.RoundBudgetExceeded,
            `Round "${round.label}" has already spent ${formatUsdCents(usdCents(spentCents), CentsDisplay.Always)} of its ${formatUsdCents(usdCents(round.budgetCents ?? 0), CentsDisplay.Always)} budget; set overrideRoundBudget to add another account anyway`,
        );
    }
}

export async function loadOpenOwnedRoundOrThrow(
    repo: PropAccountRepo,
    roundId: string,
): Promise<PropRoundRow> {
    const round = await ownedReferenceOrThrow(
        () => repo.loadOwnedRoundOrThrow(roundId, true),
        ROUND_NOT_OWNED,
    );
    if (round.status !== RoundStatus.Open) {
        throw new PropMutationRejectionError(
            PropMutationRejection.RoundClosed,
            `Round "${round.label}" is closed; open a new round or pick another`,
        );
    }
    return round;
}

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

function ownedAccount(id: string, userId: string) {
    return and(eq(propAccount.id, id), eq(propAccount.userId, userId));
}

function ownedRound(id: string, userId: string) {
    return and(eq(propRound.id, id), eq(propRound.userId, userId));
}

async function roundSpentCents(
    repo: PropAccountRepo,
    roundId: string,
): Promise<number> {
    const members = await repo.listAccountRefsInRound(roundId);
    if (members.length === 0) return 0;
    const fees = await Promise.all(
        members.map((member) => repo.listFees(member.id)),
    );
    return fees
        .flat()
        .reduce((sum, fee) => sum + signedFeeCents(fee), 0);
}
