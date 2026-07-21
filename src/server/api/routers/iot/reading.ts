/* eslint-disable perfectionist/sort-modules */
import { format } from 'date-fns';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { LoudnessAlertEmail, ReadingCreatedEmail } from '~/lib/email';
import { fanOutEvent } from '~/lib/notify';
import { captureError } from '~/lib/observability/logger';
import {
    adminProcedure,
    type ContextType,
    createTRPCRouter,
    deviceProcedure,
    publicProcedure,
} from '~/server/api/trpc';
import {
    type GetReadingsRecord,
    type ReadingRecord,
    type Result,
} from '~/server/api/types/types';
import {
    type Granularity,
    readingCreateProperties,
    readingProperties,
    readingsQueryProperties,
} from '~/server/api/types/zod';
import { location, reading, sensor } from '~/server/db/schemas/iot';

import { getSensor } from './sensor';

const idInputSchema = z.object({ id: z.number().int().positive() });
const idsInputSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1),
});
const adminReadingInputSchema = z.object({
    createdAt: z.date().optional(),
    deviceId: z.number().int().positive(),
    sensorId: z.number().int().positive(),
    value: z.number(),
});
const listAdminInputSchema = z.object({
    device_id: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(500).default(100),
    location_id: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().default(0),
    sensor_id: z.number().int().positive().optional(),
});
const readingsQueryInputSchema = z.union([
    readingsQueryProperties,
    z.undefined(),
]);

const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const lastAlertAt = new Map<number, number>();

function shouldAlert(deviceId: number): boolean {
    const now = Date.now();
    const previous = lastAlertAt.get(deviceId);
    if (previous && now - previous < ALERT_COOLDOWN_MS) return false;
    lastAlertAt.set(deviceId, now);
    return true;
}

async function getReading(
    input: z.infer<typeof readingProperties>,
    context: ContextType,
): Promise<Result<typeof reading.$inferSelect>> {
    const result = await context.db.query.reading.findFirst({
        where: (reading) => eq(reading.id, input.id),
    });

    if (!result)
        return {
            error: `Reading id ${input.id} not found`,
            status: 404,
        };

    return { data: result };
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
    input: z.infer<typeof readingsQueryProperties>,
    context: ContextType,
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

    const latest = await context.db
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
    context: ContextType,
): Promise<number | undefined> {
    if (!devicePublicId) return undefined;
    const d = await context.db.query.device.findFirst({
        where: (device) =>
            and(
                eq(device.device_id, devicePublicId),
                eq(device.location_id, locationPkId),
            ),
    });
    return d?.id;
}

export const readingRouter = createTRPCRouter({
    createAdmin: adminProcedure
        .input(adminReadingInputSchema)
        .mutation(async ({ ctx, input }) => {
            const development = await ctx.db.query.device.findFirst({
                columns: { id: true, location_id: true },
                where: (d) => eq(d.id, input.deviceId),
            });
            if (!development)
                throw new Error(`Device ${input.deviceId} not found`);
            const [row] = await ctx.db
                .insert(reading)
                .values({
                    ...(input.createdAt && { created_at: input.createdAt }),
                    device_id: development.id,
                    location_id: development.location_id,
                    sensor_id: input.sensorId,
                    value: input.value,
                })
                .returning({ id: reading.id });
            return { id: row?.id };
        }),

    createReading: deviceProcedure
        .input(readingCreateProperties)
        .mutation(async ({ ctx, input }) => {
            if (input.device_id !== ctx.device.device_id) {
                return {
                    error: 'Token does not match the device in the payload',
                    status: 403,
                };
            }

            const resolved: {
                name: string;
                sensorId: number;
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
                if (!sensorResult.data) return sensorResult;
                resolved.push({
                    name: sensorResult.data.name,
                    sensorId: sensorResult.data.id,
                    unit: sensorResult.data.unit,
                    value,
                });
            }

            await ctx.db.transaction(async (tx) => {
                for (const r of resolved) {
                    const q = tx.insert(reading).values({
                        device_id: ctx.device.id,
                        location_id: ctx.device.location_id,
                        sensor_id: r.sensorId,
                        value: r.value,
                    });
                    await q;
                }
            });

            const [loc] = await ctx.db
                .select({ name: location.name })
                .from(location)
                .where(eq(location.id, ctx.device.location_id))
                .limit(1);

            void (async () => {
                try {
                    await fanOutEvent(
                        'reading_created',
                        (to) =>
                            new ReadingCreatedEmail(to, {
                                deviceName: ctx.device.name,
                                locationName: loc?.name ?? null,
                                sensorReadings: resolved.map((r) => ({
                                    name: r.name,
                                    unit: r.unit,
                                    value: r.value,
                                })),
                            }),
                    );
                } catch (error: unknown) {
                    captureError(error, { tag: 'reading.notify' });
                }
            })();

            const threshold = ctx.device.loudness_threshold;
            if (threshold > 0) {
                const loudness = resolved.find((r) =>
                    r.name.toLowerCase().includes('loudness'),
                );
                if (
                    loudness &&
                    loudness.value > threshold &&
                    shouldAlert(ctx.device.id)
                ) {
                    void (async () => {
                        try {
                            await fanOutEvent(
                                'loudness_alert',
                                (to) =>
                                    new LoudnessAlertEmail(to, {
                                        deviceName: ctx.device.name,
                                        locationName: loc?.name ?? null,
                                        threshold,
                                        value: loudness.value,
                                    }),
                            );
                        } catch (error: unknown) {
                            captureError(error, { tag: 'reading.alert' });
                        }
                    })();
                }
            }

            return { status: 201 };
        }),

    delete: adminProcedure
        .input(idInputSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(reading).where(eq(reading.id, input.id));
            return { ok: true };
        }),

    deleteBulk: adminProcedure
        .input(idsInputSchema)
        .mutation(async ({ ctx, input }) => {
            const result = await ctx.db
                .delete(reading)
                .where(inArray(reading.id, input.ids));
            return { deleted: result.rowCount ?? input.ids.length };
        }),

    getReading: publicProcedure
        .input(readingProperties)
        .query(async ({ ctx, input }) => {
            return await getReading(input, ctx);
        }),

    getReadings: publicProcedure.query(async ({ ctx }) => {
        return { data: await ctx.db.query.reading.findMany() };
    }),

    getReadingsInput: publicProcedure
        .input(readingsQueryInputSchema)
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
                const highestValue = Math.max(...sensorRows.map((r) => r.max));
                const lowestValue = Math.min(...sensorRows.map((r) => r.min));
                out.push({
                    highest: Math.round(highestValue * 100) / 100,
                    latestReading: lastPoint,
                    lowest: Math.round(lowestValue * 100) / 100,
                    period: 24,
                    period_label: periodLabel,
                    readings: points,
                    sensor: s,
                });
            }

            return { data: out };
        }),

    listAdmin: adminProcedure
        .input(listAdminInputSchema)
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
