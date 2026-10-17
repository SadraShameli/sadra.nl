import { eq } from 'drizzle-orm';

import { HeroShowcase, heroShowcaseInputSchema } from '~/lib/site/HeroShowcase';
import { createTRPCRouter, rootProcedure } from '~/server/api/trpc';
import { siteShowcase } from '~/server/db';
import { markHeroShowcaseStale } from '~/server/site/HeroShowcaseReads';

export const siteRouter = createTRPCRouter({
    heroShowcase: rootProcedure.query(async ({ ctx }) => {
        const [row] = await ctx.db
            .select()
            .from(siteShowcase)
            .where(eq(siteShowcase.userId, ctx.session.user.id))
            .limit(1);
        return row === undefined ? null : new HeroShowcase(row).toInput();
    }),
    updateHeroShowcase: rootProcedure
        .input(heroShowcaseInputSchema)
        .mutation(async ({ ctx, input }) => {
            const showcase = HeroShowcase.fromInput(input);
            const values = { ...showcase.record, updatedAt: new Date() };
            await ctx.db
                .insert(siteShowcase)
                .values({ ...values, userId: ctx.session.user.id })
                .onConflictDoUpdate({
                    set: values,
                    target: siteShowcase.userId,
                });
            markHeroShowcaseStale();
            return showcase.toInput();
        }),
});
