import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { type EventType } from '~/lib/notify-types';
import { adminProcedure, createTRPCRouter } from '~/server/api/trpc';
import { notificationPreference } from '~/server/db';

const eventTypeSchema = z.enum([
    'device_created',
    'location_created',
    'reading_created',
    'recording_created',
]);

export const notificationRouter = createTRPCRouter({
    getMyPrefs: adminProcedure.query(async ({ ctx }) => {
        const existing = await ctx.db
            .select({
                enabled: notificationPreference.enabled,
                eventType: notificationPreference.eventType,
            })
            .from(notificationPreference)
            .where(eq(notificationPreference.userId, ctx.userId));

        const out: Record<EventType, boolean> = {
            device_created: false,
            location_created: false,
            reading_created: false,
            recording_created: false,
        };
        for (const row of existing) {
            const key = row.eventType as EventType;
            if (key in out) out[key] = row.enabled;
        }
        return out;
    }),

    setPref: adminProcedure
        .input(
            z.object({
                enabled: z.boolean(),
                eventType: eventTypeSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .insert(notificationPreference)
                .values({
                    enabled: input.enabled,
                    eventType: input.eventType,
                    userId: ctx.userId,
                })
                .onConflictDoUpdate({
                    set: { enabled: input.enabled },
                    target: [
                        notificationPreference.userId,
                        notificationPreference.eventType,
                    ],
                });
            return { ok: true };
        }),
});
