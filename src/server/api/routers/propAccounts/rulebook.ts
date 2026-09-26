import { eq } from 'drizzle-orm';
import 'server-only';

import { PropAccountRepo } from '~/lib/prop-accounts/server';
import {
    DEFAULT_RULEBOOK,
    rulebookSchema,
} from '~/lib/prop-calculator/advisor';
import { okOutputSchema } from '~/lib/schemas/propAccountOutputs';
import { createTRPCRouter } from '~/server/api/trpc';
import { propRulebook } from '~/server/db/schemas/prop';

import {
    propMutationProcedure,
    propProcedure,
    PropRouterBucket,
} from './mutationGuard';

const mutation = propMutationProcedure(PropRouterBucket.Rulebook);

export const propRulebookRouter = createTRPCRouter({
    get: propProcedure
        .output(rulebookSchema)
        .query(
            async ({ ctx }) =>
                (await new PropAccountRepo(
                    ctx.db,
                    ctx.userId,
                ).loadRulebookParameters()) ?? DEFAULT_RULEBOOK,
        ),

    reset: mutation.output(okOutputSchema).mutation(async ({ ctx }) => {
        await ctx.db
            .delete(propRulebook)
            .where(eq(propRulebook.userId, ctx.userId));
        return { ok: true as const };
    }),

    upsert: mutation
        .input(rulebookSchema)
        .output(rulebookSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .insert(propRulebook)
                .values({ parameters: input, userId: ctx.userId })
                .onConflictDoUpdate({
                    set: { parameters: input, updatedAt: new Date() },
                    setWhere: eq(propRulebook.userId, ctx.userId),
                    target: propRulebook.userId,
                });
            return input;
        }),
});
