import 'server-only';
import { and, eq } from 'drizzle-orm';

import { type EmailMessage, mailer } from '~/lib/email';
import { type EventType } from '~/lib/notify/types';
import { captureError } from '~/lib/observability/logger';
import { db, notificationPreference, user } from '~/server/db';

export async function fanOutEvent(
    eventType: EventType,
    factory: (to: string) => EmailMessage,
): Promise<void> {
    const subscribers = await db
        .select({ email: user.email })
        .from(notificationPreference)
        .innerJoin(user, eq(user.id, notificationPreference.userId))
        .where(
            and(
                eq(notificationPreference.eventType, eventType),
                eq(notificationPreference.enabled, true),
            ),
        );

    for (const sub of subscribers) {
        if (!sub.email) continue;
        mailer.send(factory(sub.email)).catch((error: unknown) =>
            captureError(error, {
                fields: { eventType, to: sub.email },
                tag: 'notify.fanOut',
            }),
        );
    }
}
