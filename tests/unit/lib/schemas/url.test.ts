import { describe, expect, it } from 'vitest';

import { readLadder, readStopRule } from '~/cli/commands/prop/shared';
import { InstrumentSymbol } from '~/lib/prop-calculator';
import {
    authErrorSearchSchema,
    dayPolicySchema,
    dayStopRuleSchema,
    forgotPasswordSearchSchema,
    labScenarioSchema,
    loginSearchSchema,
    portfolioEntrySchema,
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
        expect(profileTabSchema.safeParse('lifting').success).toBe(true);
        expect(profileTabSchema.safeParse('sensor-hub').success).toBe(true);
        expect(profileTabSchema.safeParse('trading').success).toBe(true);
        expect(profileTabSchema.safeParse('users').success).toBe(true);
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
            tab: 'trading',
        });
        expect(r.success).toBe(true);
        expect(r.data?.tab).toBe('trading');
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

const LEGACY_LAB_SCENARIO = {
    accounts: 5,
    correlation: 'copy',
    dayStop: { kind: 'none' },
    groups: 1,
    id: 'sc-1',
    label: 'Test',
    riskPerTrade: 300,
    rrRatio: 2,
    tradesPerDay: 2,
    winrate: 0.5,
};

describe('dayStopRuleSchema bounds match the CLI --stop reader (N-20)', () => {
    it.each([0, -1, 2.5])('rejects after-k-losses k %s', (k) => {
        expect(
            dayStopRuleSchema.safeParse({ k, kind: 'after-k-losses' }).success,
        ).toBe(false);
        expect(() => readStopRule(`after-k-losses:${k}`)).toThrow(/--stop/);
    });

    it.each([0, -500])('rejects after-target dollars %s', (dollars) => {
        expect(
            dayStopRuleSchema.safeParse({ dollars, kind: 'after-target' })
                .success,
        ).toBe(false);
        expect(() => readStopRule(`after-target:${dollars}`)).toThrow(/--stop/);
    });

    it('accepts the smallest legal k and a fractional dollar target', () => {
        expect(
            dayStopRuleSchema.safeParse({ k: 1, kind: 'after-k-losses' })
                .success,
        ).toBe(true);
        expect(
            dayStopRuleSchema.safeParse({ dollars: 0.5, kind: 'after-target' })
                .success,
        ).toBe(true);
    });
});

function policyWith(ladder: number[]) {
    return {
        ladder,
        maxLossesPerDay: null,
        stopRule: { kind: 'none' },
    };
}

describe('dayPolicySchema maxLossesPerDay bounds', () => {
    it.each([0, -1, 1.5])('rejects maxLossesPerDay %s', (maxLossesPerDay) => {
        expect(
            dayPolicySchema.safeParse({
                ...policyWith([400]),
                maxLossesPerDay,
            }).success,
        ).toBe(false);
    });

    it.each([null, 1, 3])('accepts maxLossesPerDay %s', (maxLossesPerDay) => {
        expect(
            dayPolicySchema.safeParse({
                ...policyWith([400]),
                maxLossesPerDay,
            }).success,
        ).toBe(true);
    });
});

describe('dayPolicySchema ladder bounds match the CLI --ladder reader (N-20)', () => {
    it.each<[number[]]>([[[0, 400]], [[400, 0, 600]], [[400, -1]], [[]]])(
        'rejects the ladder %j',
        (ladder) => {
            expect(dayPolicySchema.safeParse(policyWith(ladder)).success).toBe(
                false,
            );
        },
    );

    it.each<[number[]]>([[[0, 400]], [[400, 0, 600]], [[400, -1]]])(
        'the CLI also rejects %j',
        (ladder) => {
            expect(() => readLadder(ladder.join(','))).toThrow(/--ladder/);
        },
    );

    it.each<[number[]]>([[[400, 600]], [[400, 600, 0]]])(
        'accepts the ladder %j like the CLI does',
        (ladder) => {
            expect(dayPolicySchema.safeParse(policyWith(ladder)).success).toBe(
                true,
            );
            expect(readLadder(ladder.join(','))).toStrictEqual(ladder);
        },
    );

    it('rejects a lab scenario whose stop rule the CLI rejects', () => {
        expect(
            labScenarioSchema.safeParse({
                ...LEGACY_LAB_SCENARIO,
                dayStop: { k: 0, kind: 'after-k-losses' },
            }).success,
        ).toBe(false);
    });
});

describe('N-13: labScenarioSchema only accepts an account count the engine accepts', () => {
    it.each([0, -3, 2.5, 2 ** 53])('rejects accounts %s', (accounts) => {
        expect(
            labScenarioSchema.safeParse({ ...LEGACY_LAB_SCENARIO, accounts })
                .success,
        ).toBe(false);
    });

    it.each([1, 20])('accepts accounts %s', (accounts) => {
        expect(
            labScenarioSchema.safeParse({ ...LEGACY_LAB_SCENARIO, accounts })
                .success,
        ).toBe(true);
    });
});

describe('labScenarioSchema instrument/stopPoints (E15 extension to Strategy Lab)', () => {
    it('accepts a scenario carrying its own instrument + stopPoints', () => {
        const r = labScenarioSchema.safeParse({
            ...LEGACY_LAB_SCENARIO,
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 8,
        });
        expect(r.success).toBe(true);
        expect(r.data?.instrument).toBe(InstrumentSymbol.MNQ);
        expect(r.data?.stopPoints).toBe(8);
    });

    it('defaults instrument and stopPoints to null when absent from a pre-E15 saved scenario', () => {
        const r = labScenarioSchema.safeParse(LEGACY_LAB_SCENARIO);
        expect(r.success).toBe(true);
        expect(r.data?.instrument).toBeNull();
        expect(r.data?.stopPoints).toBeNull();
    });

    it('falls back an unrecognized instrument symbol to null rather than rejecting the whole scenario', () => {
        const r = labScenarioSchema.safeParse({
            ...LEGACY_LAB_SCENARIO,
            instrument: 'NOT-A-REAL-SYMBOL',
        });
        expect(r.success).toBe(true);
        expect(r.data?.instrument).toBeNull();
    });
});

const LEGACY_PORTFOLIO_ENTRY = {
    activationDiscountPercent: 0,
    count: 1,
    evalDiscountPercent: 0,
    firmId: 'apex',
    id: 'entry-1',
    linkActivationDiscount: false,
    planId: 'apex-50000-eod',
};

describe('N-13: portfolioEntrySchema only accepts a copy count the engine accepts', () => {
    it.each([0, -1, 1.5, 2 ** 53])('rejects count %s', (count) => {
        expect(
            portfolioEntrySchema.safeParse({ ...LEGACY_PORTFOLIO_ENTRY, count })
                .success,
        ).toBe(false);
    });

    it('accepts a whole positive count', () => {
        expect(
            portfolioEntrySchema.safeParse({
                ...LEGACY_PORTFOLIO_ENTRY,
                count: 3,
            }).success,
        ).toBe(true);
    });
});

describe('portfolioEntrySchema instrument/stopPoints (E15 extension to Portfolio Panel)', () => {
    it('accepts an entry carrying its own instrument + stopPoints override', () => {
        const r = portfolioEntrySchema.safeParse({
            ...LEGACY_PORTFOLIO_ENTRY,
            instrument: InstrumentSymbol.NQ,
            stopPoints: 10,
        });
        expect(r.success).toBe(true);
        expect(r.data?.instrument).toBe(InstrumentSymbol.NQ);
        expect(r.data?.stopPoints).toBe(10);
    });

    it('defaults instrument and stopPoints to null when absent from a pre-E15 saved entry', () => {
        const r = portfolioEntrySchema.safeParse(LEGACY_PORTFOLIO_ENTRY);
        expect(r.success).toBe(true);
        expect(r.data?.instrument).toBeNull();
        expect(r.data?.stopPoints).toBeNull();
    });
});

describe('portfolioEntrySchema monthlySubscriptionDiscountPercent/resetDiscountPercent (H2 extension to Portfolio Panel)', () => {
    it('accepts an entry carrying both new discount fields', () => {
        const r = portfolioEntrySchema.safeParse({
            ...LEGACY_PORTFOLIO_ENTRY,
            monthlySubscriptionDiscountPercent: 40,
            resetDiscountPercent: 25,
        });
        expect(r.success).toBe(true);
        expect(r.data?.monthlySubscriptionDiscountPercent).toBe(40);
        expect(r.data?.resetDiscountPercent).toBe(25);
    });

    it('defaults both new discount fields to 0 when absent from a pre-H2 saved entry', () => {
        const r = portfolioEntrySchema.safeParse(LEGACY_PORTFOLIO_ENTRY);
        expect(r.success).toBe(true);
        expect(r.data?.monthlySubscriptionDiscountPercent).toBe(0);
        expect(r.data?.resetDiscountPercent).toBe(0);
    });
});
