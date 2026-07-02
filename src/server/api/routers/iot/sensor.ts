import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import {
    sensorCreateSchema,
    sensorUpdateSchema,
} from '~/lib/schemas/sensor-hub';
import {
    adminProcedure,
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { type Result } from '~/server/api/types/types';
import { getSensorProps } from '~/server/api/types/zod';
import { sensor, sensorsToDevices } from '~/server/db/schemas/iot';

export async function getSensor(
    input: z.infer<typeof getSensorProps>,
    context: ContextType,
): Promise<Result<typeof sensor.$inferSelect>> {
    const res = await context.db.query.sensor.findFirst({
        where: (sensor, { eq }) => eq(sensor.id, input.id),
    });

    if (!res)
        return {
            error: `Sensor id ${input.id} not found`,
            status: 404,
        };

    return { data: res };
}

async function assertUnitExists(
    context: ContextType,
    value: string,
): Promise<void> {
    const found = await context.db.query.sensorUnit.findFirst({
        columns: { id: true },
        where: (u, { eq: e }) => e(u.value, value),
    });
    if (!found) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown unit "${value}"`,
        });
    }
}

async function getSensors(
    context: ContextType,
): Promise<Result<(typeof sensor.$inferSelect)[]>> {
    const sensors = await context.db.query.sensor.findMany();
    return { data: sensors };
}

export const sensorRouter = createTRPCRouter({
    create: adminProcedure
        .input(sensorCreateSchema)
        .mutation(async ({ ctx, input }) => {
            await assertUnitExists(ctx, input.unit);
            const [inserted] = await ctx.db
                .insert(sensor)
                .values(input)
                .returning({ id: sensor.id });
            return { id: inserted?.id };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(sensorsToDevices)
                .where(eq(sensorsToDevices.sensor_id, input.id));
            await ctx.db.delete(sensor).where(eq(sensor.id, input.id));
            return { ok: true };
        }),

    getSensor: publicProcedure
        .input(getSensorProps)
        .query(async ({ ctx, input }) => {
            return await getSensor(input, ctx);
        }),

    getSensors: publicProcedure.query(async ({ ctx }) => {
        return getSensors(ctx);
    }),

    listAdmin: adminProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.sensor.findMany({
            orderBy: (s, { asc }) => [asc(s.name)],
        });
    }),

    listDeviceMappings: adminProcedure.query(async ({ ctx }) => {
        return await ctx.db
            .select({
                device_id: sensorsToDevices.device_id,
                sensor_id: sensorsToDevices.sensor_id,
            })
            .from(sensorsToDevices);
    }),

    setDeviceSensors: adminProcedure
        .input(
            z.object({
                deviceId: z.number().int().positive(),
                sensorIds: z.array(z.number().int().positive()),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(sensorsToDevices)
                .where(eq(sensorsToDevices.device_id, input.deviceId));
            if (input.sensorIds.length > 0) {
                const q = ctx.db.insert(sensorsToDevices).values(
                    input.sensorIds.map((sensor_id) => ({
                        device_id: input.deviceId,
                        sensor_id,
                    })),
                );
                await q;
            }
            return { ok: true };
        }),

    update: adminProcedure
        .input(sensorUpdateSchema)
        .mutation(async ({ ctx, input }) => {
            await assertUnitExists(ctx, input.unit);
            const { id, ...rest } = input;
            await ctx.db.update(sensor).set(rest).where(eq(sensor.id, id));
            return { ok: true };
        }),
});
