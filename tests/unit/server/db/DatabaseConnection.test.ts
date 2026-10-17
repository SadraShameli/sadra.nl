import { describe, expect, it } from 'vitest';

import {
    databaseConnectionString,
    databaseTls,
} from '~/server/db/DatabaseConnection';

const NEON_URL =
    'postgres://app:pw@ep-calm-sun-123456.eu-central-1.aws.neon.tech/app?sslmode=require';

describe('databaseTls', () => {
    it('verifies the server certificate for a remote database', () => {
        expect(databaseTls(NEON_URL)).toEqual({ rejectUnauthorized: true });
    });

    it('verifies the certificate when the URL cannot be parsed', () => {
        expect(databaseTls('not a url')).toEqual({ rejectUnauthorized: true });
    });

    it.each([
        'postgres://app:pw@localhost:5432/app',
        'postgres://app:pw@127.0.0.1:5432/app',
        'postgres://app:pw@[::1]:5432/app',
        'postgres://app:pw@db.internal/app?sslmode=disable',
    ])('skips TLS for %s', (url) => {
        expect(databaseTls(url)).toBe(false);
    });
});

describe('databaseConnectionString', () => {
    it('drops driver-only parameters so the explicit TLS option wins', () => {
        expect(
            databaseConnectionString(`${NEON_URL}&uselibpqcompat=true`),
        ).toBe(
            'postgres://app:pw@ep-calm-sun-123456.eu-central-1.aws.neon.tech/app',
        );
    });
});
