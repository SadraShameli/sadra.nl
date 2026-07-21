import 'server-only';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, lt } from 'drizzle-orm';

import { rangeEnd } from '~/lib/lifting/date-range';
import {
    idActionSchema,
    listMeasurementsInputSchema,
    measurementInputSchema,
    updateMeasurementInputSchema,
} from '~/lib/lifting/schemas';
import { MEASUREMENT_KIND_VALUES } from '~/lib/lifting/types';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { liftingMeasurement } from '~/server/db';

export const liftingMeasurementRouter = createTRPCRouter({
    create: protectedProcedure
        .input(measurementInputSchema)
        .mutation(async ({ ctx, input }) => {
            const [row] = await ctx.db
                .insert(liftingMeasurement)
                .values({
                    kind: input.kind,
                    notes: input.notes ?? null,
                    takenAt: input.takenAt ?? new Date(),
                    unit: input.unit,
                    userId: ctx.userId,
                    valueNumeric: input.valueNumeric,
                })
                .returning({ id: liftingMeasurement.id });
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not save measurement',
                });
            }
            return row;
        }),

    delete: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(liftingMeasurement)
                .where(
                    and(
                        eq(liftingMeasurement.id, input.id),
                        eq(liftingMeasurement.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),

    latestByKind: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(liftingMeasurement)
            .where(eq(liftingMeasurement.userId, ctx.userId))
            .orderBy(desc(liftingMeasurement.takenAt));
        const out: Partial<
            Record<
                (typeof MEASUREMENT_KIND_VALUES)[number],
                typeof liftingMeasurement.$inferSelect
            >
        > = {};
        for (const row of rows) {
            const kind = row.kind;
            if (!MEASUREMENT_KIND_VALUES.includes(kind)) continue;
            if (Object.hasOwn(out, kind)) continue;
            out[kind] = row;
        }
        return out;
    }),

    list: protectedProcedure
        .input(listMeasurementsInputSchema)
        .query(async ({ ctx, input }) => {
            const filters = [eq(liftingMeasurement.userId, ctx.userId)];
            if (input.kind)
                filters.push(eq(liftingMeasurement.kind, input.kind));
            if (input.from)
                filters.push(gte(liftingMeasurement.takenAt, input.from));
            if (input.to)
                filters.push(
                    lt(liftingMeasurement.takenAt, rangeEnd(input.to)),
                );
            return ctx.db
                .select()
                .from(liftingMeasurement)
                .where(and(...filters))
                .orderBy(desc(liftingMeasurement.takenAt));
        }),

    update: protectedProcedure
        .input(updateMeasurementInputSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, ...rest } = input;
            await ctx.db
                .update(liftingMeasurement)
                .set({
                    kind: rest.kind,
                    notes: rest.notes ?? null,
                    takenAt: rest.takenAt ?? undefined,
                    unit: rest.unit,
                    valueNumeric: rest.valueNumeric,
                })
                .where(
                    and(
                        eq(liftingMeasurement.id, id),
                        eq(liftingMeasurement.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),
});
