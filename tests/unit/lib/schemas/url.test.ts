import { describe, expect, it } from 'vitest';

import {
    authErrorSearchSchema,
    dayStopRuleSchema,
    forgotPasswordSearchSchema,
    loginSearchSchema,
    profileSearchSchema,
    profileTabSchema,
    resetPasswordSearchSchema,
    signupSearchSchema,
    tradingPlanSearchSchema,
    verifyRequestSearchSchema,
} from '~/lib/schemas/url';

describe('profileTabSchema', () => {
    it('accepts known tabs', () => {
        expect(profileTabSchema.safeParse('account').success).toBe(true);
        expect(profileTabSchema.safeParse('security').success).toBe(true);
        expect(profileTabSchema.safeParse('trading-plan').success).toBe(true);
    });

    it('falls back to "account" on unknown values', () => {
        expect(profileTabSchema.parse('garbage')).toBe('account');
        expect(profileTabSchema.parse(null)).toBe('account');
    });
});

describe('loginSearchSchema', () => {
    it('accepts empty params', () => {
        expect(loginSearchSchema.safeParse({}).success).toBe(true);
    });

    it('accepts known shapes', () => {
        const r = loginSearchSchema.safeParse({
            callbackUrl: '/profile',
            error: 'invalid',
            success: 'reset',
        });
        expect(r.success).toBe(true);
    });

    it('ignores extra params (zod default)', () => {
        const r = loginSearchSchema.safeParse({ foo: 'bar' });
        expect(r.success).toBe(true);
    });
});

describe('signupSearchSchema + forgotPasswordSearchSchema + verifyRequestSearchSchema + authErrorSearchSchema', () => {
    it('accept their happy paths', () => {
        expect(signupSearchSchema.safeParse({ error: 'taken' }).success).toBe(
            true,
        );
        expect(
            forgotPasswordSearchSchema.safeParse({ sent: '1' }).success,
        ).toBe(true);
        expect(
            verifyRequestSearchSchema.safeParse({ email: 'a@b.test' }).success,
        ).toBe(true);
        expect(
            authErrorSearchSchema.safeParse({ error: 'rate_limited' }).success,
        ).toBe(true);
    });

    it('accept empty payloads', () => {
        expect(signupSearchSchema.safeParse({}).success).toBe(true);
        expect(forgotPasswordSearchSchema.safeParse({}).success).toBe(true);
        expect(verifyRequestSearchSchema.safeParse({}).success).toBe(true);
        expect(authErrorSearchSchema.safeParse({}).success).toBe(true);
    });
});

describe('resetPasswordSearchSchema', () => {
    it('accepts token + error params', () => {
        expect(
            resetPasswordSearchSchema.safeParse({
                error: 'expired',
                token: 'abc',
            }).success,
        ).toBe(true);
    });
});

describe('profileSearchSchema', () => {
    it('parses tab, success and error together', () => {
        const r = profileSearchSchema.safeParse({
            error: 'pw_fail',
            success: 'password',
            tab: 'trading-plan',
        });
        expect(r.success).toBe(true);
        expect(r.data?.tab).toBe('trading-plan');
    });

    it('falls back the tab to "account" when unknown (via .catch)', () => {
        const r = profileSearchSchema.parse({ tab: 'nope' });
        expect(r.tab).toBe('account');
    });
});

describe('tradingPlanSearchSchema', () => {
    it('accepts plan + success + error', () => {
        expect(
            tradingPlanSearchSchema.safeParse({
                error: 'plan_not_found',
                plan: 'abc',
                success: 'plan_saved',
            }).success,
        ).toBe(true);
    });
});

describe('dayStopRuleSchema', () => {
    it('accepts all four discriminated variants', () => {
        expect(dayStopRuleSchema.safeParse({ kind: 'none' }).success).toBe(
            true,
        );
        expect(dayStopRuleSchema.safeParse({ kind: 'first-win' }).success).toBe(
            true,
        );
        expect(
            dayStopRuleSchema.safeParse({ k: 2, kind: 'after-k-losses' })
                .success,
        ).toBe(true);
        expect(
            dayStopRuleSchema.safeParse({ dollars: 500, kind: 'after-target' })
                .success,
        ).toBe(true);
    });

    it('rejects unknown kinds', () => {
        expect(
            dayStopRuleSchema.safeParse({ kind: 'something-else' }).success,
        ).toBe(false);
    });

    it('rejects after-k-losses without k', () => {
        expect(
            dayStopRuleSchema.safeParse({ kind: 'after-k-losses' }).success,
        ).toBe(false);
    });
});
