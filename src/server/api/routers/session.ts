import { TRPCError } from '@trpc/server';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { z } from 'zod';

import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { sessions } from '~/server/db';

const SESSION_COOKIE_NAMES = new Set([
    '__Secure-authjs.session-token',
    'authjs.session-token',
]);

function readCurrentSessionToken(headers: Headers): null | string {
    const cookieHeader = headers.get('cookie') ?? '';
    for (const part of cookieHeader.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name && SESSION_COOKIE_NAMES.has(name)) {
            return decodeURIComponent(rest.join('='));
        }
    }
    return null;
}

export const sessionRouter = createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                createdAt: sessions.createdAt,
                expires: sessions.expires,
                ipAddress: sessions.ipAddress,
                lastUsedAt: sessions.lastUsedAt,
                sessionToken: sessions.sessionToken,
                userAgent: sessions.userAgent,
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
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Could not identify current session',
            });
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
