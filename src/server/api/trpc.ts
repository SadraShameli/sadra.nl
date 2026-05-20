import { initTRPC, TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import superjson from 'superjson';
import { z, ZodError } from 'zod';

import { auth } from '~/lib/auth/config';
import { isAdminOrAbove, isRoot } from '~/lib/auth/roles';
import { db } from '~/server/db';
import { device } from '~/server/db/schemas/main';
import { hashDeviceToken } from '~/server/helpers/device-token';

export const createTRPCContext = async (opts: { headers: Headers }) => {
    const session = await auth();
    return {
        db,
        session,
        ...opts,
    };
};

export type ContextType = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<typeof createTRPCContext>().create({
    errorFormatter({ error, shape }) {
        return {
            ...shape,
            data: {
                ...shape.data,
                zodError:
                    error.cause instanceof ZodError
                        ? z.treeifyError(error.cause)
                        : null,
            },
        };
    },
    transformer: superjson,
});

export const createCallerFactory = t.createCallerFactory;

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.session?.user.id) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({
        ctx: {
            ...ctx,
            session: ctx.session,
            userId: ctx.session.user.id,
        },
    });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!isAdminOrAbove(ctx.session.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next();
});

export const rootProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!isRoot(ctx.session.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next();
});

export const deviceProcedure = t.procedure.use(async ({ ctx, next }) => {
    const header =
        ctx.headers.get('authorization') ??
        ctx.headers.get('Authorization') ??
        '';
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match?.[1]) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Missing device bearer token',
        });
    }
    const tokenHash = await hashDeviceToken(match[1].trim());

    const [row] = await ctx.db
        .select({
            device_id: device.device_id,
            id: device.id,
            location_id: device.location_id,
            loudness_threshold: device.loudness_threshold,
            name: device.name,
        })
        .from(device)
        .where(
            and(
                eq(device.token_hash, tokenHash),
                isNull(device.token_revoked_at),
            ),
        )
        .limit(1);

    if (!row) {
        throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid or revoked device token',
        });
    }

    return next({
        ctx: {
            ...ctx,
            device: row,
        },
    });
});
