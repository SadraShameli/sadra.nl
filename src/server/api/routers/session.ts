import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { z } from 'zod';

import { sessions } from '~/server/db';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';

const SESSION_COOKIE_DEV = 'authjs.session-token';
const SESSION_COOKIE_PROD = '__Secure-authjs.session-token';

function readCurrentSessionToken(headers: Headers): string | null {
    const cookieHeader = headers.get('cookie') ?? '';
    for (const part of cookieHeader.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === SESSION_COOKIE_DEV || name === SESSION_COOKIE_PROD) {
            return decodeURIComponent(rest.join('='));
        }
    }
    return null;
}

export const sessionRouter = createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                sessionToken: sessions.sessionToken,
                expires: sessions.expires,
                userAgent: sessions.userAgent,
                ipAddress: sessions.ipAddress,
                createdAt: sessions.createdAt,
                lastUsedAt: sessions.lastUsedAt,
            })
            .from(sessions)
            .where(
                and(
                    eq(sessions.userId, ctx.userId),
                    gt(sessions.expires, new Date()),
                ),
            )
            .orderBy(desc(sessions.lastUsedAt));

        const current = readCurrentSessionToken(ctx.headers);
        return rows.map((row) => ({
            ...row,
            current: current !== null && row.sessionToken === current,
        }));
    }),

    revoke: protectedProcedure
        .input(z.object({ sessionToken: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(sessions)
                .where(
                    and(
                        eq(sessions.sessionToken, input.sessionToken),
                        eq(sessions.userId, ctx.userId),
                    ),
                );
        }),

    revokeAllOthers: protectedProcedure.mutation(async ({ ctx }) => {
        const current = readCurrentSessionToken(ctx.headers);
        if (!current) {
            await ctx.db
                .delete(sessions)
                .where(eq(sessions.userId, ctx.userId));
            return;
        }
        await ctx.db
            .delete(sessions)
            .where(
                and(
                    eq(sessions.userId, ctx.userId),
                    ne(sessions.sessionToken, current),
                ),
            );
    }),
});
