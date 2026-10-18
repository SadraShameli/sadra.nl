import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it, vi } from 'vitest';

import { authLogger } from '~/lib/auth/authLogger';

const logged = vi.hoisted(() => {
    const lines: unknown[] = [];
    return {
        lines,
        record: (message: string, fields?: object) => {
            lines.push({ fields, message });
        },
    };
});

vi.mock('server-only', () => ({}));
vi.mock('~/lib/observability/logger', async (importOriginal) => {
    return {
        ...(await importOriginal<object>()),
        logger: {
            debug: logged.record,
            error: logged.record,
            info: logged.record,
            warn: logged.record,
        },
    };
});

const RESET_TOKEN = 'reset0token0that0must0stay0out0of0logs';

describe('authLogger', () => {
    it('logs a failed Better Auth query without its bound parameters', () => {
        authLogger.log(
            'error',
            'INTERNAL_SERVER_ERROR',
            new DrizzleQueryError(
                'insert into "sadranl_verification" ("identifier", "value") values ($1, $2)',
                ['reset-password:abc', RESET_TOKEN],
            ),
        );

        const line = JSON.stringify(logged.lines);
        expect(line).toContain('INTERNAL_SERVER_ERROR');
        expect(line).toContain('sadranl_verification');
        expect(line).not.toContain(RESET_TOKEN);
    });
});
