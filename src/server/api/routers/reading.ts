import { format } from 'date-fns';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { buildReadingEmail, fanOutEvent } from '~/lib/notify';
import {
    adminProcedure,
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { location, reading, sensor } from '~/server/db/schemas/main';

import {
    type GetReadingsRecord,
    type ReadingRecord,
    type Result,
} from '../types/types';
import {
    createReadingProps,
    getReadingProps,
    getReadingsQueryProps,
    type Granularity,
} from '../types/zod';
import { getOrCreateDevice } from './device';
import { getSensor } from './sensor';

async function getReading(
    input: z.infer<typeof getReadingProps>,
    ctx: ContextType,
): Promise<Result<typeof reading.$inferSelect>> {
    const res = await ctx.db.query.reading.findFirst({
        where: (reading) => eq(reading.id, input.id),
    });

    if (!res)
        return {
            error: `Reading id ${input.id} not found`,
            status: 404,
        };

    return { data: res };
}

const PERIOD_BY_GRANULARITY: Record<
    Granularity,
    { dateFormat: string; label: string; ms: number }
> = {
    day: { dateFormat: 'd MMM', label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
    hour: {
        dateFormat: 'd MMM, H:mm  ',
        label: '24h',
        ms: 24 * 60 * 60 * 1000,
    },
    month: {
        dateFormat: 'MMM yyyy',
        label: '12mo',
        ms: 12 * 30 * 24 * 60 * 60 * 1000,
    },
    raw: { dateFormat: 'd MMM, H:mm  ', label: '1h', ms: 1 * 60 * 60 * 1000 },
    week: {
        dateFormat: 'd MMM',
        label: '12w',
        ms: 12 * 7 * 24 * 60 * 60 * 1000,
    },
};

async function resolveDateRange(
    input: z.infer<typeof getReadingsQueryProps>,
    ctx: ContextType,
): Promise<{ from: Date; to: Date }> {
    const periodMs = PERIOD_BY_GRANULARITY[input.granularity].ms;

    if (
        input.date_from &&
        input.date_to &&
        input.date_from.getTime() !== input.date_to.getTime()
    ) {
        return { from: input.date_from, to: input.date_to };
    }

    if (input.date_from) {
        return {
            from: input.date_from,
            to: new Date(input.date_from.getTime() + periodMs),
        };
    }

    const latest = await ctx.db
        .select({ created_at: reading.created_at })
        .from(reading)
        .where(eq(reading.location_id, input.location_id))
        .orderBy(desc(reading.id))
        .limit(1);

    const anchor = latest.at(-1)?.created_at ?? new Date();
    return {
        from: new Date(anchor.getTime() - periodMs),
        to: anchor,
    };
}

async function resolveDeviceFk(
    locationPkId: number,
    devicePublicId: number | undefined,
    ctx: ContextType,
): Promise<number | undefined> {
    if (!devicePublicId) return undefined;
    const d = await ctx.db.query.device.findFirst({
        where: (device) =>
            and(
                eq(device.device_id, devicePublicId),
                eq(device.location_id, locationPkId),
            ),
    });
    return d?.id;
}

export const readingRouter = createTRPCRouter({
    createReading: publicProcedure
        .input(createReadingProps)
        .mutation(async ({ ctx, input }) => {
            const dev = await getOrCreateDevice(input.device_id, ctx);

            const sensorReadings: {
                name: string;
                unit: null | string;
                value: number;
            }[] = [];

            for (const sensorKey in input.sensors) {
                const value = input.sensors[sensorKey];
                if (value == undefined) {
                    return {
                        error: `No value provided for sensor ${sensorKey}`,
                        status: 400,
                    };
                }

                const sensorResult = await getSensor({ id: +sensorKey }, ctx);
                if (!sensorResult.data) {
                    return sensorResult;
                }

                await ctx.db.insert(reading).values({
                    device_id: dev.id,
                    location_id: dev.locationId,
                    sensor_id: sensorResult.data.id,
                    value: value,
                });

                sensorReadings.push({
                    name: sensorResult.data.name,
                    unit: sensorResult.data.unit,
                    value,
                });
            }

            const [loc] = await ctx.db
                .select({ name: location.name })
                .from(location)
                .where(eq(location.id, dev.locationId))
                .limit(1);

            fanOutEvent(
                'reading_created',
                buildReadingEmail({
                    deviceName: dev.name,
                    locationName: loc?.name ?? null,
                    sensorReadings,
                }),
            ).catch((error: unknown) =>
                console.error('[reading] notify failed', error),
            );

            return { status: 201 };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(reading).where(eq(reading.id, input.id));
            return { ok: true };
        }),

    deleteBulk: adminProcedure
        .input(z.object({ ids: z.array(z.number().int().positive()).min(1) }))
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db
                .delete(reading)
                .where(inArray(reading.id, input.ids));
            return { deleted: result.rowCount ?? input.ids.length };
        }),

    getReading: publicProcedure
        .input(getReadingProps)
        .query(async ({ ctx, input }) => {
            return await getReading(input, ctx);
        }),

    getReadings: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.query.reading.findMany() };
    }),

    getReadingsInput: publicProcedure
        .input(z.union([getReadingsQueryProps, z.undefined()]))
        .query(async ({ ctx, input }): Promise<Result<GetReadingsRecord[]>> => {
            if (!input) {
                return { error: 'No readings could be found' };
            }

            const { from, to } = await resolveDateRange(input, ctx);
            const { dateFormat, label: periodLabel } =
                PERIOD_BY_GRANULARITY[input.granularity];
            const deviceFk = await resolveDeviceFk(
                input.location_id,
                input.device_id,
                ctx,
            );

            const baseWhere = and(
                eq(reading.location_id, input.location_id),
                deviceFk === undefined
                    ? undefined
                    : eq(reading.device_id, deviceFk),
                gte(reading.created_at, from),
                lte(reading.created_at, to),
            );

            type Bucketed = {
                avg: number;
                bucket: Date;
                max: number;
                min: number;
                sensor_id: number;
            };

            let rows: Bucketed[];

            if (input.granularity === 'raw') {
                const raw = await ctx.db
                    .select({
                        avg: reading.value,
                        bucket: reading.created_at,
                        max: reading.value,
                        min: reading.value,
                        sensor_id: reading.sensor_id,
                    })
                    .from(reading)
                    .where(baseWhere)
                    .orderBy(asc(reading.id));
                rows = raw;
            } else {
                const trunc = sql<Date>`date_trunc(${input.granularity}, ${reading.created_at})`;
                rows = await ctx.db
                    .select({
                        avg: sql<number>`avg(${reading.value})`,
                        bucket: trunc,
                        max: sql<number>`max(${reading.value})`,
                        min: sql<number>`min(${reading.value})`,
                        sensor_id: reading.sensor_id,
                    })
                    .from(reading)
                    .where(baseWhere)
                    .groupBy(sql`2`, reading.sensor_id)
                    .orderBy(sql`2`);
            }

            if (rows.length === 0) {
                return { error: 'No readings could be found' };
            }

            const sensorIds = [...new Set(rows.map((r) => r.sensor_id))];
            const sensors = await ctx.db.query.sensor.findMany({
                where: inArray(sensor.id, sensorIds),
            });

            const out: GetReadingsRecord[] = [];

            for (const s of sensors) {
                const points: ReadingRecord[] = rows
                    .filter((r) => r.sensor_id === s.id)
                    .map((r) => ({
                        date: format(r.bucket, dateFormat),
                        value: Math.round(r.avg * 100) / 100,
                    }));
                const lastPoint = points.at(-1);
                if (!lastPoint) continue;

                const sensorRows = rows.filter((r) => r.sensor_id === s.id);
                out.push({
                    highest:
                        Math.round(
                            Math.max(...sensorRows.map((r) => r.max)) * 100,
                        ) / 100,
                    latestReading: lastPoint,
                    lowest:
                        Math.round(
                            Math.min(...sensorRows.map((r) => r.min)) * 100,
                        ) / 100,
                    period: 24,
                    period_label: periodLabel,
                    readings: points,
                    sensor: s,
                });
            }

            return { data: out };
        }),

    listAdmin: adminProcedure
        .input(
            z.object({
                device_id: z.number().int().positive().optional(),
                limit: z.number().int().min(1).max(500).default(100),
                location_id: z.number().int().positive().optional(),
                offset: z.number().int().nonnegative().default(0),
                sensor_id: z.number().int().positive().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const where = and(
                input.location_id
                    ? eq(reading.location_id, input.location_id)
                    : undefined,
                input.device_id
                    ? eq(reading.device_id, input.device_id)
                    : undefined,
                input.sensor_id
                    ? eq(reading.sensor_id, input.sensor_id)
                    : undefined,
            );
            return await ctx.db
                .select()
                .from(reading)
                .where(where)
                .orderBy(desc(reading.id))
                .limit(input.limit)
                .offset(input.offset);
        }),
});
