import 'server-only';
import { and, eq } from 'drizzle-orm';

import { sendWithFallback } from '~/lib/email';
import { type EventType } from '~/lib/notify-types';
import { db, notificationPreference, users } from '~/server/db';

export function buildDeviceEmail(params: {
    deviceId: number;
    deviceName: string;
    locationName: null | string;
}) {
    return {
        html: `
<p>A new device was registered.</p>
<p><strong>Name:</strong> ${params.deviceName}</p>
<p><strong>Device ID:</strong> ${params.deviceId}</p>
<p><strong>Location:</strong> ${params.locationName ?? '—'}</p>
        `.trim(),
        subject: 'New device — sadra.nl',
    };
}

export function buildLocationEmail(params: {
    locationId: number;
    locationName: string;
}) {
    return {
        html: `
<p>A new location was created.</p>
<p><strong>Name:</strong> ${params.locationName}</p>
<p><strong>ID:</strong> ${params.locationId}</p>
        `.trim(),
        subject: 'New location — sadra.nl',
    };
}

export function buildReadingEmail(params: {
    deviceName: null | string;
    locationName: null | string;
    sensorReadings: { name: string; unit: null | string; value: number }[];
}) {
    const rows = params.sensorReadings
        .map(
            (r) =>
                `<li><strong>${r.name}:</strong> ${r.value}${r.unit ? ` ${r.unit}` : ''}</li>`,
        )
        .join('');
    return {
        html: `
<p>A new reading was received.</p>
<p><strong>Device:</strong> ${params.deviceName ?? '—'}</p>
<p><strong>Location:</strong> ${params.locationName ?? '—'}</p>
<ul>${rows}</ul>
        `.trim(),
        subject: 'New reading — sadra.nl',
    };
}

export function buildRecordingEmail(params: {
    deviceName: null | string;
    durationSeconds: null | number | undefined;
    fileName: string;
    locationName: null | string;
}) {
    const dur =
        params.durationSeconds == null
            ? ''
            : ` (${Math.round(params.durationSeconds)}s)`;
    return {
        html: `
<p>A new recording was received.</p>
<p><strong>File:</strong> ${params.fileName}${dur}</p>
<p><strong>Device:</strong> ${params.deviceName ?? '—'}</p>
<p><strong>Location:</strong> ${params.locationName ?? '—'}</p>
        `.trim(),
        subject: 'New recording — sadra.nl',
    };
}

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
