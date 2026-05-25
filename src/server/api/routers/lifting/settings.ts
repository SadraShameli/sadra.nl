import 'server-only';

import { updateSettingsInputSchema } from '~/lib/lifting/schemas';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { liftingSettings } from '~/server/db';

export const liftingSettingsRouter = createTRPCRouter({
    get: protectedProcedure.query(async ({ ctx }) => {
        const existing = await ctx.db.query.liftingSettings.findFirst({
            where: (s, { eq: e }) => e(s.userId, ctx.userId),
        });
        if (existing) return existing;

        const [created] = await ctx.db
            .insert(liftingSettings)
            .values({ userId: ctx.userId })
            .returning();
        if (!created) {
            throw new Error('Failed to initialize lifting settings');
        }
        return created;
    }),

    update: protectedProcedure
        .input(updateSettingsInputSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .insert(liftingSettings)
                .values({
                    userId: ctx.userId,
                    ...input,
                })
                .onConflictDoUpdate({
                    set: { ...input, updatedAt: new Date() },
                    target: liftingSettings.userId,
                });
            return { ok: true };
        }),
});
