import { describe, expect, it } from 'vitest';

import {
    callbackUrlSchema,
    displayNameSchema,
    emailSchema,
    forgotPasswordInputSchema,
    loginInputSchema,
    magicLinkInputSchema,
    oauthSignInInputSchema,
    passwordSchema,
    resetPasswordInputSchema,
    setPasswordInputSchema,
    signupInputSchema,
    updateEmailInputSchema,
    updateNameInputSchema,
    updatePasswordInputSchema,
} from '~/lib/schemas/auth';

describe('emailSchema', () => {
    it('accepts a valid email and lowercases it', () => {
        const r = emailSchema.safeParse('Foo@BAR.com');
        expect(r.success).toBe(true);
        expect(r.data).toBe('foo@bar.com');
    });

    it('rejects non-email strings', () => {
        expect(emailSchema.safeParse('not-an-email').success).toBe(false);
        expect(emailSchema.safeParse('foo@').success).toBe(false);
        expect(emailSchema.safeParse('').success).toBe(false);
    });

    it('rejects emails over the length cap', () => {
        const long = `${'a'.repeat(250)}@x.test`;
        expect(emailSchema.safeParse(long).success).toBe(false);
    });
});

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
        expect(passwordSchema.safeParse('PASSWORD123').success).toBe(false);
    });

    it('accepts a strong password', () => {
        expect(passwordSchema.safeParse('CorrectHorseBattery9').success).toBe(
            true,
        );
    });
});

describe('displayNameSchema', () => {
    it('trims and accepts a valid name', () => {
        const r = displayNameSchema.safeParse('  Ada Lovelace  ');
        expect(r.success).toBe(true);
        expect(r.data).toBe('Ada Lovelace');
    });

    it('rejects empty / whitespace-only names', () => {
        expect(displayNameSchema.safeParse('').success).toBe(false);
        expect(displayNameSchema.safeParse('   ').success).toBe(false);
    });
});

describe('callbackUrlSchema (same-origin guard)', () => {
    it('accepts a same-origin path', () => {
        expect(callbackUrlSchema.safeParse('/profile').success).toBe(true);
        expect(
            callbackUrlSchema.safeParse('/trade-checklist/journal').success,
        ).toBe(true);
    });

    it('rejects protocol-relative URLs (open-redirect surface)', () => {
        expect(callbackUrlSchema.safeParse('//evil.test').success).toBe(false);
    });

    it('rejects absolute URLs', () => {
        expect(callbackUrlSchema.safeParse('https://evil.test').success).toBe(
            false,
        );
        expect(
            callbackUrlSchema.safeParse('http://evil.test/path').success,
        ).toBe(false);
    });

    it('rejects paths missing the leading slash', () => {
        expect(callbackUrlSchema.safeParse('profile').success).toBe(false);
    });

    it('rejects callback URLs over the length cap', () => {
        const long = `/${'a'.repeat(520)}`;
        expect(callbackUrlSchema.safeParse(long).success).toBe(false);
    });
});

describe('loginInputSchema', () => {
    it('accepts a valid payload', () => {
        const r = loginInputSchema.safeParse({
            email: 'a@b.test',
            password: 'whatever',
        });
        expect(r.success).toBe(true);
    });

    it('rejects an empty password', () => {
        const r = loginInputSchema.safeParse({
            email: 'a@b.test',
            password: '',
        });
        expect(r.success).toBe(false);
    });

    it('rejects an invalid email even if password is fine', () => {
        const r = loginInputSchema.safeParse({
            email: 'not-an-email',
            password: 'whatever',
        });
        expect(r.success).toBe(false);
    });

    it('rejects an off-origin callbackUrl', () => {
        const r = loginInputSchema.safeParse({
            callbackUrl: 'https://evil.test',
            email: 'a@b.test',
            password: 'whatever',
        });
        expect(r.success).toBe(false);
    });
});

describe('signupInputSchema', () => {
    it('rejects mismatched passwords', () => {
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

    it('refuses weak passwords even when confirm matches', () => {
        const r = signupInputSchema.safeParse({
            confirm: 'password',
            email: 'a@b.test',
            name: 'A',
            password: 'password',
        });
        expect(r.success).toBe(false);
    });
});

describe('forgotPasswordInputSchema', () => {
    it('accepts a valid email', () => {
        expect(
            forgotPasswordInputSchema.safeParse({ email: 'a@b.test' }).success,
        ).toBe(true);
    });

    it('rejects garbage email', () => {
        expect(
            forgotPasswordInputSchema.safeParse({ email: 'x' }).success,
        ).toBe(false);
    });
});

describe('magicLinkInputSchema', () => {
    it('accepts an email-only payload', () => {
        expect(
            magicLinkInputSchema.safeParse({ email: 'a@b.test' }).success,
        ).toBe(true);
    });

    it('accepts an optional same-origin callbackUrl', () => {
        expect(
            magicLinkInputSchema.safeParse({
                callbackUrl: '/profile',
                email: 'a@b.test',
            }).success,
        ).toBe(true);
    });

    it('rejects an off-origin callbackUrl', () => {
        expect(
            magicLinkInputSchema.safeParse({
                callbackUrl: 'https://evil.test',
                email: 'a@b.test',
            }).success,
        ).toBe(false);
    });
});

describe('oauthSignInInputSchema', () => {
    it('accepts an empty payload (no callbackUrl)', () => {
        expect(oauthSignInInputSchema.safeParse({}).success).toBe(true);
    });

    it('rejects an off-origin callbackUrl', () => {
        expect(
            oauthSignInInputSchema.safeParse({
                callbackUrl: '//evil.test',
            }).success,
        ).toBe(false);
    });
});

describe('resetPasswordInputSchema', () => {
    it('requires a non-empty token', () => {
        const r = resetPasswordInputSchema.safeParse({
            confirm: 'CorrectHorseBattery9',
            password: 'CorrectHorseBattery9',
            token: '',
        });
        expect(r.success).toBe(false);
    });

    it('rejects mismatched passwords', () => {
        const r = resetPasswordInputSchema.safeParse({
            confirm: 'CorrectHorseBattery8',
            password: 'CorrectHorseBattery9',
            token: 'abc',
        });
        expect(r.success).toBe(false);
    });

    it('accepts a valid reset payload', () => {
        const r = resetPasswordInputSchema.safeParse({
            confirm: 'CorrectHorseBattery9',
            password: 'CorrectHorseBattery9',
            token: 'abc',
        });
        expect(r.success).toBe(true);
    });
});

describe('updatePasswordInputSchema', () => {
    it('requires the current password', () => {
        const r = updatePasswordInputSchema.safeParse({
            confirm: 'CorrectHorseBattery9',
            current: '',
            password: 'CorrectHorseBattery9',
        });
        expect(r.success).toBe(false);
    });

    it('rejects mismatched new passwords', () => {
        const r = updatePasswordInputSchema.safeParse({
            confirm: 'CorrectHorseBattery8',
            current: 'whatever',
            password: 'CorrectHorseBattery9',
        });
        expect(r.success).toBe(false);
    });

    it('accepts a valid change-password payload', () => {
        const r = updatePasswordInputSchema.safeParse({
            confirm: 'CorrectHorseBattery9',
            current: 'whatever',
            password: 'CorrectHorseBattery9',
        });
        expect(r.success).toBe(true);
    });
});

describe('setPasswordInputSchema', () => {
    it('rejects mismatched passwords', () => {
        const r = setPasswordInputSchema.safeParse({
            confirm: 'CorrectHorseBattery8',
            password: 'CorrectHorseBattery9',
        });
        expect(r.success).toBe(false);
    });

    it('rejects weak passwords', () => {
        const r = setPasswordInputSchema.safeParse({
            confirm: 'password',
            password: 'password',
        });
        expect(r.success).toBe(false);
    });

    it('accepts a valid set-password payload', () => {
        const r = setPasswordInputSchema.safeParse({
            confirm: 'CorrectHorseBattery9',
            password: 'CorrectHorseBattery9',
        });
        expect(r.success).toBe(true);
    });
});

describe('updateEmailInputSchema', () => {
    it('lowercases the new email', () => {
        const r = updateEmailInputSchema.safeParse({ email: 'X@Y.TEST' });
        expect(r.success).toBe(true);
        expect(r.data?.email).toBe('x@y.test');
    });

    it('rejects garbage email', () => {
        expect(updateEmailInputSchema.safeParse({ email: 'bad' }).success).toBe(
            false,
        );
    });
});

describe('updateNameInputSchema', () => {
    it('refuses a no-op update (same name as current)', () => {
        const r = updateNameInputSchema.safeParse({
            currentName: 'Ada',
            name: 'Ada',
        });
        expect(r.success).toBe(false);
    });

    it('treats whitespace differences as no-op', () => {
        const r = updateNameInputSchema.safeParse({
            currentName: '  Ada  ',
            name: 'Ada',
        });
        expect(r.success).toBe(false);
    });

    it('accepts a real change', () => {
        const r = updateNameInputSchema.safeParse({
            currentName: 'Ada',
            name: 'Ada Lovelace',
        });
        expect(r.success).toBe(true);
    });
});
