import { format } from 'date-fns';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { buildRecordingEmail, fanOutEvent } from '~/lib/notify';
import { recordingRenameSchema } from '~/lib/schemas/sensor-hub';
import {
    adminProcedure,
    type ContextType,
    createTRPCRouter,
    publicProcedure,
} from '~/server/api/trpc';
import { location, recording } from '~/server/db/schemas/main';

import { type Result } from '../types/types';
import { createRecordingProps, getRecordingProps } from '../types/zod';
import { getOrCreateDevice } from './device';

export function getRecordingFileName(date: Date) {
    return `${format(date, 'MMM d, y - HH.mm')}.wav`;
}

async function getRecording(
    input: z.infer<typeof getRecordingProps>,
    ctx: ContextType,
): Promise<Result<typeof recording.$inferSelect>> {
    const res = await ctx.db.query.recording.findFirst({
        where: (recording) => eq(recording.id, input.id),
    });

    if (!res) {
        return {
            error: `Recording id ${input.id} not found`,
            status: 404,
        };
    }

    return { data: res };
}

async function getRecordingNoFile(
    input: z.infer<typeof getRecordingProps>,
    ctx: ContextType,
) {
    return await ctx.db.query.recording.findFirst({
        columns: {
            created_at: true,
            device_id: true,
            duration_seconds: true,
            file_name: true,
            id: true,
            location_id: true,
        },
        where: (recording) => eq(recording.id, input.id),
    });
}

async function getRecordingsNoFile(ctx: ContextType) {
    return await ctx.db.query.recording.findMany({
        columns: {
            created_at: true,
            device_id: true,
            duration_seconds: true,
            file_name: true,
            id: true,
            location_id: true,
        },
        orderBy: (recording) => desc(recording.id),
    });
}

export const recordingsRouter = createTRPCRouter({
    createRecording: publicProcedure
        .input(createRecordingProps)
        .mutation(async ({ ctx, input }) => {
            const dev = await getOrCreateDevice(input.device.device_id, ctx);

            const fileName = getRecordingFileName(new Date());

            await ctx.db.insert(recording).values({
                device_id: dev.id,
                duration_seconds: input.duration_seconds,
                file: input.recording,
                file_name: fileName,
                location_id: dev.locationId,
            });

            const [loc] = await ctx.db
                .select({ name: location.name })
                .from(location)
                .where(eq(location.id, dev.locationId))
                .limit(1);

            fanOutEvent(
                'recording_created',
                buildRecordingEmail({
                    deviceName: dev.name,
                    durationSeconds: input.duration_seconds,
                    fileName,
                    locationName: loc?.name ?? null,
                }),
            ).catch((error: unknown) =>
                console.error('[recording] notify failed', error),
            );

            return { status: 201 };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db.delete(recording).where(eq(recording.id, input.id));
            return { ok: true };
        }),

    getRecording: publicProcedure
        .input(getRecordingProps)
        .query(async ({ ctx, input }) => {
            return await getRecording(input, ctx);
        }),

    getRecordingNoFile: publicProcedure
        .input(getRecordingProps)
        .query(async ({ ctx, input }) => {
            return await getRecordingNoFile(input, ctx);
        }),

    getRecordings: publicProcedure.query(async ({ ctx }) => {
        return (await ctx.db.query.recording.findMany({
            columns: {
                created_at: true,
                device_id: true,
                file_name: true,
                id: true,
                location_id: true,
            },
        })) as Result<(typeof recording.$inferSelect)[]>;
    }),

    getRecordingsNoFile: publicProcedure.query(async ({ ctx }) => {
        return await getRecordingsNoFile(ctx);
    }),

    listAdmin: adminProcedure
        .input(
            z
                .object({
                    device_id: z.number().int().positive().optional(),
                    limit: z.number().int().min(1).max(200).default(100),
                    location_id: z.number().int().positive().optional(),
                    offset: z.number().int().nonnegative().default(0),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            const limit = input?.limit ?? 100;
            const offset = input?.offset ?? 0;
            return await ctx.db.query.recording.findMany({
                columns: {
                    created_at: true,
                    device_id: true,
                    duration_seconds: true,
                    file_name: true,
                    id: true,
                    location_id: true,
                },
                limit,
                offset,
                orderBy: (r) => desc(r.id),
                where: (r, { and: andOp, eq: eqOp }) =>
                    andOp(
                        input?.location_id
                            ? eqOp(r.location_id, input.location_id)
                            : undefined,
                        input?.device_id
                            ? eqOp(r.device_id, input.device_id)
                            : undefined,
                    ),
            });
        }),

    rename: adminProcedure
        .input(recordingRenameSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(recording)
                .set({ file_name: input.file_name })
                .where(eq(recording.id, input.id));
            return { ok: true };
        }),
});
