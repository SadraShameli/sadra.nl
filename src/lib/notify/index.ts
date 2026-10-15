import 'server-only';
import { and, eq } from 'drizzle-orm';
import { after } from 'next/server';

import { type EmailMessage, mailer } from '~/lib/email';
import { type EventType } from '~/lib/notify/types';
import { captureError } from '~/lib/observability/logger';
import { db, notificationPreference, user } from '~/server/db';

export function scheduleFanOut(
    eventType: EventType,
    factory: (to: string) => EmailMessage,
    tag: string,
): void {
    after(async () => {
        try {
            await fanOutEvent(eventType, factory);
        } catch (error: unknown) {
            captureError(error, { tag });
        }
    });
}

async function fanOutEvent(
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

    await Promise.all(
        subscribers.map(async ({ email }) => {
            if (!email) return;
            try {
                await mailer.send(factory(email));
            } catch (error: unknown) {
                captureError(error, {
                    fields: { eventType, to: email },
                    tag: 'notify.fanOut',
                });
            }
        }),
    );
}
