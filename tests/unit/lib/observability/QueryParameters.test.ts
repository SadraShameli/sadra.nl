import type { ErrorEvent } from '@sentry/nextjs';

import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it, vi } from 'vitest';

import { serializeError } from '~/lib/observability/logger';
import { scrubQueryParameters } from '~/lib/observability/QueryParameters';

vi.mock('server-only', () => ({}));

const SESSION_TOKEN = 'zq81session0token0value0that0must0not0leak';

function failedSessionInsert(): DrizzleQueryError {
    return new DrizzleQueryError(
        'insert into "sadranl_session" ("id", "token", "user_id") values ($1, $2, $3)',
        ['session-1', SESSION_TOKEN, 'user-1'],
        new Error('canceling statement due to statement timeout'),
    );
}

describe('serializeError', () => {
    it('keeps the failed query but drops its bound parameters', () => {
        const serialized = JSON.stringify(
            serializeError(failedSessionInsert()),
        );

        expect(serialized).not.toContain(SESSION_TOKEN);
        expect(serialized).toContain('insert into');
        expect(serialized).toContain('statement timeout');
    });
});

describe('scrubQueryParameters', () => {
    it('removes bound parameters from a Sentry event before it is sent', () => {
        const error = failedSessionInsert();
        const event: ErrorEvent = {
            breadcrumbs: [{ message: error.message }],
            exception: {
                values: [{ type: 'DrizzleQueryError', value: error.message }],
            },
            message: error.message,
            type: undefined,
        };

        const scrubbed = JSON.stringify(scrubQueryParameters(event));

        expect(scrubbed).not.toContain(SESSION_TOKEN);
        expect(scrubbed).toContain('insert into');
    });
});
