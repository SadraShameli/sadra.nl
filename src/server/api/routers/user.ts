import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { isRoot, resolveRole, ROOT_EMAIL } from '~/lib/auth/roles';
import {
    adminProcedure,
    createTRPCRouter,
    rootProcedure,
} from '~/server/api/trpc';
import { users } from '~/server/db';

export const userRouter = createTRPCRouter({
    delete: adminProcedure
        .input(z.object({ userId: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const [target] = await ctx.db
                .select({ email: users.email, role: users.role })
                .from(users)
                .where(eq(users.id, input.userId))
                .limit(1);
            if (!target) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'User not found',
                });
            }
            const targetRole = resolveRole(target.email, target.role);
            if (targetRole === 'root') {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot delete root user',
                });
            }
            if (targetRole === 'admin' && !isRoot(ctx.session.user.role)) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Only root can delete admins',
                });
            }
            await ctx.db.delete(users).where(eq(users.id, input.userId));
            return { ok: true };
        }),

    list: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                createdAt: users.createdAt,
                email: users.email,
                id: users.id,
                image: users.image,
                name: users.name,
                role: users.role,
            })
            .from(users)
            .orderBy(users.createdAt);
        return rows.map((r) => ({
            ...r,
            role: resolveRole(r.email, r.role),
        }));
    }),

    setRole: rootProcedure
        .input(
            z.object({
                role: z.enum(['admin', 'user']),
                userId: z.string().min(1),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const [target] = await ctx.db
                .select({ email: users.email })
                .from(users)
                .where(eq(users.id, input.userId))
                .limit(1);
            if (!target) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'User not found',
                });
            }
            if (target.email?.toLowerCase() === ROOT_EMAIL) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot change root role',
                });
            }
            await ctx.db
                .update(users)
                .set({ role: input.role })
                .where(eq(users.id, input.userId));
            return { ok: true };
        }),
});
