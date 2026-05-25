import { describe, expect, it } from 'vitest';

import { contactInputSchema } from '~/lib/schemas/contact';

describe('contactInputSchema', () => {
    const base = {
        email: 'a@b.test',
        message: 'I have a question about the trading checklist tool.',
        name: 'Ada',
    };

    it('accepts a valid payload', () => {
        expect(contactInputSchema.safeParse(base).success).toBe(true);
    });

    it('rejects empty name', () => {
        expect(
            contactInputSchema.safeParse({ ...base, name: '' }).success,
        ).toBe(false);
    });

    it('rejects an oversized name', () => {
        expect(
            contactInputSchema.safeParse({ ...base, name: 'a'.repeat(200) })
                .success,
        ).toBe(false);
    });

    it('rejects an invalid email', () => {
        expect(
            contactInputSchema.safeParse({ ...base, email: 'nope' }).success,
        ).toBe(false);
    });

    it('rejects messages under 10 chars', () => {
        expect(
            contactInputSchema.safeParse({ ...base, message: 'too short' })
                .success,
        ).toBe(false);
    });

    it('rejects messages over 4000 chars', () => {
        expect(
            contactInputSchema.safeParse({
                ...base,
                message: 'x'.repeat(4001),
            }).success,
        ).toBe(false);
    });

    it('accepts an empty honeypot', () => {
        const r = contactInputSchema.safeParse({ ...base, honeypot: '' });
        expect(r.success).toBe(true);
    });

    it('rejects a non-empty honeypot (bot signature)', () => {
        const r = contactInputSchema.safeParse({
            ...base,
            honeypot: 'bot was here',
        });
        expect(r.success).toBe(false);
    });

    it('trims whitespace on name and message', () => {
        const r = contactInputSchema.safeParse({
            email: 'a@b.test',
            message: '   Hello there friend   ',
            name: '  Ada  ',
        });
        expect(r.success).toBe(true);
        expect(r.data?.name).toBe('Ada');
        expect(r.data?.message).toBe('Hello there friend');
    });
});
