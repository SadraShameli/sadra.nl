import { describe, expect, it } from 'vitest';
process.env.AUTH_SECRET ??=
    'test-auth-secret-test-auth-secret-test-auth-secret';
process.env.DATABASE_URL ??=
    'postgres://placeholder@localhost:5432/placeholder';
process.env.LETTERMINT_PROJECT_TOKEN ??= 'test-token';
process.env.RESEND_API_KEY ??= 'test-key';
process.env.NEXT_PUBLIC_SERVER_URL ??= 'http://localhost:3000';

const { openSecret, sealSecret } = await import('~/lib/crypto/secrets');

describe('seal/open round-trip', () => {
    it('round-trips an ASCII secret', async () => {
        const plain = 'hello world';
        const sealed = await sealSecret(plain);
        expect(sealed).not.toBe(plain);
        expect(await openSecret(sealed)).toBe(plain);
    });

    it('round-trips a long Unicode secret', async () => {
        const plain = 'töken—🔐—' + 'x'.repeat(256);
        const sealed = await sealSecret(plain);
        expect(await openSecret(sealed)).toBe(plain);
    });

    it('produces different ciphertexts for the same plaintext (IV randomness)', async () => {
        const a = await sealSecret('same');
        const b = await sealSecret('same');
        expect(a).not.toBe(b);
    });

    it('rejects tampered ciphertexts', async () => {
        const sealed = await sealSecret('do not tamper');
        const last = sealed.at(-1) ?? '';
        const secondLast = sealed.at(-2) ?? '';
        const flipped = `${sealed.slice(0, -2)}${secondLast === 'A' ? 'B' : 'A'}${last}`;
        await expect(openSecret(flipped)).rejects.toThrow();
    });
});
