import 'server-only';
import { and, eq } from 'drizzle-orm';

import { sendWithFallback } from '~/lib/email';
import { type EventType } from '~/lib/notify/types';
import { db, notificationPreference, users } from '~/server/db';

export {
    buildDeviceEmail,
    buildLocationEmail,
    buildLoudnessAlertEmail,
    buildReadingEmail,
    buildRecordingEmail,
} from './builders';

export async function fanOutEvent(
    eventType: EventType,
    payload: { html: string; subject: string },
) {
    const subscribers = await db
        .select({ email: users.email })
        .from(notificationPreference)
        .innerJoin(users, eq(users.id, notificationPreference.userId))
        .where(
            and(
                eq(notificationPreference.eventType, eventType),
                eq(notificationPreference.enabled, true),
            ),
        );

    for (const sub of subscribers) {
        if (!sub.email) continue;
        sendWithFallback({
            html: payload.html,
            subject: payload.subject,
            to: sub.email,
        }).catch((error: unknown) =>
            console.error(`[notify] ${eventType} → ${sub.email} failed`, error),
        );
    }
}
