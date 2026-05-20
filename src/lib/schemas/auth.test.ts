import { describe, expect, it } from 'vitest';

import { passwordSchema, signupInputSchema } from './auth';

describe('passwordSchema', () => {
    it('rejects passwords under 12 characters', () => {
        expect(passwordSchema.safeParse('Aa1bcdef').success).toBe(false);
    });

    it('rejects passwords without an uppercase letter', () => {
        expect(passwordSchema.safeParse('aaaaaaaaaa1!').success).toBe(false);
    });

    it('rejects passwords without a lowercase letter', () => {
        expect(passwordSchema.safeParse('AAAAAAAAAA1!').success).toBe(false);
    });

    it('rejects passwords without a digit', () => {
        expect(passwordSchema.safeParse('Aaaaaaaaaaaa').success).toBe(false);
    });

    it('rejects common passwords (case-insensitive)', () => {
        expect(passwordSchema.safeParse('Password123').success).toBe(false);
    });

    it('accepts a strong password', () => {
        expect(passwordSchema.safeParse('CorrectHorseBattery9').success).toBe(
            true,
        );
    });
});

describe('signupInputSchema', () => {
    it('rejects mismatching passwords', () => {
        const r = signupInputSchema.safeParse({
            confirm: 'CorrectHorseBattery8',
            email: 'a@b.test',
            name: 'A',
            password: 'CorrectHorseBattery9',
        });
        expect(r.success).toBe(false);
    });

    it('accepts a valid signup payload', () => {
        const r = signupInputSchema.safeParse({
            confirm: 'CorrectHorseBattery9',
            email: 'a@b.test',
            name: 'A',
            password: 'CorrectHorseBattery9',
        });
        expect(r.success).toBe(true);
    });
});
