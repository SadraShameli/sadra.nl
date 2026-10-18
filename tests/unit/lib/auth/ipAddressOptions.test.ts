import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

import {
    authIpAddressOptions,
    authRateLimitOptions,
} from '~/lib/auth/rateLimitOptions';

interface RateLimitRow {
    readonly key: string;
}

describe('authIpAddressOptions', () => {
    it('keys rate limits on the client address even behind an extra proxy hop', async () => {
        const rateLimit: RateLimitRow[] = [];
        const auth = betterAuth({
            advanced: { ipAddress: authIpAddressOptions },
            baseURL: 'http://localhost:3000',
            database: memoryAdapter({
                account: [],
                rateLimit,
                session: [],
                user: [],
                verification: [],
            }),
            emailAndPassword: { enabled: true },
            rateLimit: authRateLimitOptions(true),
            secret: 'ip-address-test-secret-0123456789',
        });

        await auth.handler(
            new Request('http://localhost:3000/api/auth/sign-in/email', {
                body: JSON.stringify({
                    email: 'nobody@x.test',
                    password: 'Quartz-Lantern-Harbor-97',
                }),
                headers: {
                    'content-type': 'application/json',
                    origin: 'http://localhost:3000',
                    'x-forwarded-for': '198.51.100.4, 10.0.0.2',
                    'x-real-ip': '198.51.100.4',
                },
                method: 'POST',
            }),
        );

        expect(rateLimit.map((row) => row.key)).toEqual([
            '198.51.100.4|/sign-in/email',
        ]);
    });
});
