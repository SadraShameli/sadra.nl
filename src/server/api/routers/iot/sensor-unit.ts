import { TRPCError } from '@trpc/server';
import { count, eq } from 'drizzle-orm';

import {
    sensorUnitCreateSchema,
    sensorUnitIdSchema,
    sensorUnitUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import {
    adminProcedure,
    createTRPCRouter,
    protectedProcedure,
} from '~/server/api/trpc';
import { sensor, sensorUnit } from '~/server/db/schemas/iot';

export const sensorUnitRouter = createTRPCRouter({
    create: adminProcedure
        .input(sensorUnitCreateSchema)
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db.query.sensorUnit.findFirst({
                columns: { id: true },
                where: (u, { eq: equals }) => equals(u.value, input.value),
            });
            if (existing) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: `Unit "${input.value}" already exists`,
                });
            }
            const [row] = await ctx.db
                .insert(sensorUnit)
                .values({ value: input.value })
                .returning({ id: sensorUnit.id });
            return { id: row?.id };
        }),

    delete: adminProcedure
        .input(sensorUnitIdSchema)
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db.query.sensorUnit.findFirst({
                where: (u, { eq: equals }) => equals(u.id, input.id),
            });
            if (!existing) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Unit not found',
                });
            }
            const [usage] = await ctx.db
                .select({ n: count() })
                .from(sensor)
                .where(eq(sensor.unit, existing.value));
            if ((usage?.n ?? 0) > 0) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: `Unit "${existing.value}" is used by ${usage?.n} sensor(s)`,
                });
            }
            await ctx.db.delete(sensorUnit).where(eq(sensorUnit.id, input.id));
            return { ok: true };
        }),

    list: protectedProcedure.query(async ({ ctx }) => {
        return ctx.db.query.sensorUnit.findMany({
            orderBy: (u, { asc }) => [asc(u.value)],
        });
    }),

    update: adminProcedure
        .input(sensorUnitUpdateSchema)
        .mutation(async ({ ctx, input }) => {
            return ctx.db.transaction(async (tx) => {
                const existing = await tx.query.sensorUnit.findFirst({
                    where: (u, { eq: equals }) => equals(u.id, input.id),
                });
                if (!existing) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Unit not found',
                    });
                }
                if (existing.value === input.value) return { ok: true };

                const conflict = await tx.query.sensorUnit.findFirst({
                    columns: { id: true },
                    where: (u, { eq: equals }) => equals(u.value, input.value),
                });
                if (conflict) {
                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: `Unit "${input.value}" already exists`,
                    });
                }

                await tx
                    .update(sensor)
                    .set({ unit: input.value })
                    .where(eq(sensor.unit, existing.value));
                await tx
                    .update(sensorUnit)
                    .set({ value: input.value })
                    .where(eq(sensorUnit.id, input.id));
                return { ok: true };
            });
        }),
});
