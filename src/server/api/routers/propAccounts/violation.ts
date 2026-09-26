import { and, eq } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    compareText,
    latestIsoDateAnywhere,
    ViolationSource,
} from '~/lib/prop-accounts';
import {
    type OwnedAccountRef,
    PropAccountRepo,
    PropQuotaGuard,
} from '~/lib/prop-accounts/server';
import {
    okOutputSchema,
    PropMutationRejection,
    PropQuota,
    PropRecord,
    propRuleViolationOutputSchema,
} from '~/lib/schemas/propAccountOutputs';
import {
    entityIdSchema,
    ledgerListSchema,
    violationCreateSchema,
    violationUpdateSchema,
} from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { propRuleViolation } from '~/server/db/schemas/prop';

import {
    ownedReferenceOrThrow,
    propMutationProcedure,
    PropMutationRejectionError,
    propProcedure,
    PropRouterBucket,
    returnedRowOrThrow,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Violation);

interface ViolationLinks {
    readonly decisionId: null | string;
    readonly occurredOn: string;
}

export const propViolationRouter = createTRPCRouter({
    create: mutation
        .input(violationCreateSchema)
        .output(propRuleViolationOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const quotas = await PropQuotaGuard.acquire(tx, ctx.userId);
                const repo = new PropAccountRepo(tx, ctx.userId);
                const account = await ownedReferenceOrThrow(
                    () =>
                        repo.loadOwnedAccountRefOrThrow(input.accountId, true),
                    'The account for this violation is not one of your accounts',
                );
                await assertViolationLinks(repo, account, input);
                await quotas.assertWithin(PropQuota.Violations, 1);
                const [row] = await tx
                    .insert(propRuleViolation)
                    .values({
                        ...input,
                        source: ViolationSource.Manual,
                        userId: ctx.userId,
                    })
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Violation);
            }),
        ),

    list: propProcedure
        .input(ledgerListSchema)
        .output(z.array(propRuleViolationOutputSchema))
        .query(({ ctx, input }) =>
            new PropAccountRepo(ctx.db, ctx.userId).listViolations(
                input.accountId,
            ),
        ),

    remove: mutation
        .input(entityIdSchema)
        .output(okOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const violation = await repo.loadOwnedViolationOrThrow(
                    input.id,
                );
                await tx
                    .delete(propRuleViolation)
                    .where(ownedViolation(violation.id, ctx.userId));
                return { ok: true as const };
            }),
        ),

    update: mutation
        .input(violationUpdateSchema)
        .output(propRuleViolationOutputSchema)
        .mutation(({ ctx, input }) =>
            ctx.db.transaction(async (tx) => {
                const repo = new PropAccountRepo(tx, ctx.userId);
                const violation = await repo.loadOwnedViolationOrThrow(
                    input.id,
                );
                const account = await repo.loadOwnedAccountRefOrThrow(
                    violation.accountId,
                    true,
                );
                await assertViolationLinks(repo, account, input);
                const [row] = await tx
                    .update(propRuleViolation)
                    .set({
                        costCents: input.costCents,
                        decisionId: input.decisionId,
                        kind: input.kind,
                        note: input.note,
                        occurredOn: input.occurredOn,
                        updatedAt: new Date(),
                    })
                    .where(ownedViolation(violation.id, ctx.userId))
                    .returning();
                return returnedRowOrThrow(row, PropRecord.Violation);
            }),
        ),
});

async function assertViolationLinks(
    repo: PropAccountRepo,
    account: Pick<OwnedAccountRef, 'id' | 'purchasedOn'>,
    links: ViolationLinks,
): Promise<void> {
    if (compareText(links.occurredOn, account.purchasedOn) < 0) {
        throw new PropMutationRejectionError(
            PropMutationRejection.OutOfOrderEvent,
            `The violation date ${links.occurredOn} is before the account was bought on ${account.purchasedOn}; pick a date on or after it`,
        );
    }
    if (compareText(links.occurredOn, latestIsoDateAnywhere(new Date())) > 0) {
        throw new PropMutationRejectionError(
            PropMutationRejection.FutureDate,
            `The violation date ${links.occurredOn} is in the future; record a violation once it has happened`,
        );
    }
    const { decisionId } = links;
    if (decisionId === null) return;
    const decision = await ownedReferenceOrThrow(
        () => repo.loadOwnedDecisionOrThrow(decisionId),
        'The sizing decision linked to this violation is not one of your decisions',
    );
    if (decision.accountId !== account.id) {
        throw new PropMutationRejectionError(
            PropMutationRejection.DecisionOfOtherAccount,
            'The linked sizing decision belongs to another account; link a decision of this account, or none',
        );
    }
}

function ownedViolation(id: string, userId: string) {
    return and(
        eq(propRuleViolation.id, id),
        eq(propRuleViolation.userId, userId),
    );
}
