import { eq } from 'drizzle-orm';

import { setSpotifyEmbedHtmlSchema } from '~/lib/schemas/site-setting';
import { homepageContent } from '~/lib/site/content';
import {
    createTRPCRouter,
    publicProcedure,
    rootProcedure,
} from '~/server/api/trpc';
import { db, user } from '~/server/db';

export const settingsRouter = createTRPCRouter({
    getSpotifyEmbed: publicProcedure.query(async ({ ctx }) => {
        if (!ctx.session?.user) {
            return homepageContent.aboutSpotifyEmbed;
        }
        const userData = await db.query.user.findFirst({
            where: eq(user.id, ctx.session.user.id),
        });
        return userData?.spotifyEmbed ?? homepageContent.aboutSpotifyEmbed;
    }),

    setSpotifyEmbed: rootProcedure
        .input(setSpotifyEmbedHtmlSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(user)
                .set({ spotifyEmbed: input.html })
                .where(eq(user.id, ctx.session.user.id));
            return { ok: true };
        }),
});
