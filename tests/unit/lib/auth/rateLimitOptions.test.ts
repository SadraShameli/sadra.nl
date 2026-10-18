import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

import { authRateLimitOptions } from '~/lib/auth/rateLimitOptions';

const SIGN_IN_ATTEMPTS = 4;

function signInRequest(): Request {
    return new Request('http://localhost:3000/api/auth/sign-in/email', {
        body: JSON.stringify({
            email: 'nobody@x.test',
            password: 'Quartz-Lantern-Harbor-97',
        }),
        headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3000',
        },
        method: 'POST',
    });
}

describe('authRateLimitOptions', () => {
    it('keeps sign-in counters in the shared database, not in one instance', async () => {
        const tables = {
            account: [],
            rateLimit: [] as unknown[],
            session: [],
            user: [],
            verification: [],
        };
        const auth = betterAuth({
            baseURL: 'http://localhost:3000',
            database: memoryAdapter(tables),
            emailAndPassword: { enabled: true },
            rateLimit: authRateLimitOptions(true),
            secret: 'rate-limit-test-secret-0123456789',
        });

        const statuses: number[] = [];
        for (let attempt = 0; attempt < SIGN_IN_ATTEMPTS; attempt += 1) {
            const response = await auth.handler(signInRequest());
            statuses.push(response.status);
        }

        expect(tables.rateLimit).toHaveLength(1);
        expect(statuses.at(-1)).toBe(429);
    });
});
