import { describe, expect, it, vi } from 'vitest';

import { EmailMessage } from '~/lib/email/message';
import { EVENT_TYPES } from '~/lib/notify/types';

const state = vi.hoisted(() => ({
    captureError: vi.fn(),
    tasks: [] as (() => Promise<void>)[],
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({
    after: (task: () => Promise<void>) => {
        state.tasks.push(task);
    },
}));
vi.mock('~/lib/observability/logger', () => ({
    captureError: state.captureError,
}));
vi.mock('~/lib/email', () => ({
    mailer: { send: () => Promise.reject(new Error('provider down')) },
}));
vi.mock('~/server/db', async () => {
    const { databaseSchema } = await import('~/server/db/databaseSchema');
    const { createFakeDatabase } = await import('../../server/fakeDatabase');
    const { database } = createFakeDatabase(() => [
        { email: 'subscriber@x.test', id: 'user-7' },
    ]);
    return { ...databaseSchema, db: database };
});

class AlertEmail extends EmailMessage {
    readonly subject = 'Alert';

    constructor(readonly to: string) {
        super();
    }

    render(): Promise<string> {
        return Promise.resolve('<p>Alert</p>');
    }
}

describe('scheduleFanOut', () => {
    it('reports a failed delivery by user id, never by address', async () => {
        const { scheduleFanOut } = await import('~/lib/notify');

        const [eventType] = EVENT_TYPES;
        if (eventType === undefined) throw new TypeError('no event types');
        scheduleFanOut(eventType, (to) => new AlertEmail(to), 'notify.test');
        await Promise.all(state.tasks.map((task) => task()));

        expect(state.captureError).toHaveBeenCalledOnce();
        const reported = JSON.stringify(state.captureError.mock.calls);
        expect(reported).toContain('user-7');
        expect(reported).not.toContain('subscriber@x.test');
    });
});
