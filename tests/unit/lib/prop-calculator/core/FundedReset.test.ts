import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    canTakeFundedReset,
    describeFundedReset,
    describeFundedResetTerms,
    dollars,
    FirmId,
    FUNDED_RESET_MECHANICS,
    FundedResetEligibility,
    fundedResetFee,
    type FundedResetPolicy,
    MffuVariant,
    NO_PLAN_OPT_INS,
    percent,
    type Plan,
    withFundedResetTaken,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    FundedDpModelGapKind,
    fundedDpModelGaps,
} from '~/lib/prop-calculator/core/FundedDpModelGaps';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const firm = new AlphaFutures();

function alphaPlan(variant: AlphaFuturesVariant): Plan {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant,
    });
    if (!plan) throw new Error(`Alpha Futures ${variant} 50K plan not found`);
    return plan;
}

function mffProPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro 50K plan not found');
    return plan;
}

const POLICY: FundedResetPolicy = {
    eligibility: FundedResetEligibility.NoPayoutEverRequested,
    fee: dollars(499),
    label: 'Qualified Reset',
    maxPerAccount: 2,
    windowCalendarDays: 7,
};

const FRESH = { closedForInactivity: false, payoutsIssued: 0, resetsUsed: 0 };

describe('Alpha Qualified Reset data (N-34, Reset article 9492077 fetched live 2026-09-24)', () => {
    it.each([
        { fee: 499, variant: AlphaFuturesVariant.Zero },
        { fee: 599, variant: AlphaFuturesVariant.Standard },
    ])(
        '$variant 50K offers the reset at $fee dollars, 2 per account, within 7 days, before any payout request',
        ({ fee, variant }) => {
            expect(alphaPlan(variant).fundedReset).toStrictEqual({
                eligibility: FundedResetEligibility.NoPayoutEverRequested,
                fee,
                label: 'Qualified Reset',
                maxPerAccount: 2,
                windowCalendarDays: 7,
            });
        },
    );

    it('Advanced Qualified offers no reset ("Qualified Resets are only available on Zero and Standard Accounts")', () => {
        expect(alphaPlan(AlphaFuturesVariant.Advanced).fundedReset).toBeNull();
    });

    it('every Alpha plan starts opted out, since buying the reset is the trader choice', () => {
        for (const plan of firm.plans) {
            expect(plan.takesFundedReset).toBe(false);
        }
    });
});

describe('canTakeFundedReset: allowed on a breach while no payout was ever requested, up to the per-account count', () => {
    const zeroTaken = withFundedResetTaken(
        alphaPlan(AlphaFuturesVariant.Zero),
        true,
    );

    it('allows the first and second reset on a fresh account', () => {
        expect(canTakeFundedReset(zeroTaken, FRESH)).toBe(true);
        expect(canTakeFundedReset(zeroTaken, { ...FRESH, resetsUsed: 1 })).toBe(
            true,
        );
    });

    it('refuses a third reset', () => {
        expect(canTakeFundedReset(zeroTaken, { ...FRESH, resetsUsed: 2 })).toBe(
            false,
        );
    });

    it('refuses once any payout was requested', () => {
        expect(
            canTakeFundedReset(zeroTaken, { ...FRESH, payoutsIssued: 1 }),
        ).toBe(false);
    });

    it('refuses an inactivity closure, which is not a breach', () => {
        expect(
            canTakeFundedReset(zeroTaken, {
                ...FRESH,
                closedForInactivity: true,
            }),
        ).toBe(false);
    });

    it('refuses when the plan did not opt in, or offers no reset', () => {
        expect(
            canTakeFundedReset(alphaPlan(AlphaFuturesVariant.Zero), FRESH),
        ).toBe(false);
        expect(
            canTakeFundedReset(alphaPlan(AlphaFuturesVariant.Advanced), FRESH),
        ).toBe(false);
    });
});

describe('Plan validates the funded reset policy', () => {
    const zero = alphaPlan(AlphaFuturesVariant.Zero);

    it.each([
        { name: 'a negative fee', policy: { ...POLICY, fee: dollars(-1) } },
        { name: 'a NaN fee', policy: { ...POLICY, fee: dollars(NaN) } },
        { name: 'zero resets', policy: { ...POLICY, maxPerAccount: 0 } },
        {
            name: 'a fractional count',
            policy: { ...POLICY, maxPerAccount: 1.5 },
        },
        {
            name: 'a zero-day window',
            policy: { ...POLICY, windowCalendarDays: 0 },
        },
    ])('throws for $name', ({ policy }) => {
        expect(() => zero.withOverrides({ fundedReset: policy })).toThrow(
            /fundedReset/,
        );
    });

    it('throws when takesFundedReset is set on a plan without a policy', () => {
        expect(() =>
            alphaPlan(AlphaFuturesVariant.Advanced).withOverrides({
                takesFundedReset: true,
            }),
        ).toThrow(/takesFundedReset/);
    });

    it('accepts a free reset', () => {
        expect(
            zero.withOverrides({ fundedReset: { ...POLICY, fee: dollars(0) } })
                .fundedReset?.fee,
        ).toBe(0);
    });
});

describe('withFundedResetTaken and withPlanOptIns', () => {
    it('sets the opt-in only on plans that offer the reset', () => {
        const zero = alphaPlan(AlphaFuturesVariant.Zero);
        const advanced = alphaPlan(AlphaFuturesVariant.Advanced);

        expect(withFundedResetTaken(zero, true).takesFundedReset).toBe(true);
        expect(withFundedResetTaken(zero, false)).toBe(zero);
        expect(withFundedResetTaken(advanced, true)).toBe(advanced);
    });

    it('bundles both trader opt-ins and keeps the plan object when nothing applies', () => {
        const zero = alphaPlan(AlphaFuturesVariant.Zero);
        const pro = mffProPlan();
        const both = {
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: true,
        };

        expect(withPlanOptIns(zero, NO_PLAN_OPT_INS)).toBe(zero);
        expect(
            withPlanOptIns(pro, { ...NO_PLAN_OPT_INS, takesFundedReset: true }),
        ).toBe(pro);

        const zeroOpted = withPlanOptIns(zero, both);
        expect(zeroOpted.takesFundedReset).toBe(true);
        expect(zeroOpted.takesOneTimeEarlyWithdrawal).toBe(false);

        const proOpted = withPlanOptIns(pro, both);
        expect(proOpted.takesOneTimeEarlyWithdrawal).toBe(true);
        expect(proOpted.takesFundedReset).toBe(false);
    });
});

describe('fundedResetFee applies the reset discount (T9) and no bundle discount', () => {
    it('charges list price without discounts', () => {
        expect(fundedResetFee(POLICY, undefined)).toBe(499);
    });

    it('applies the reset percent and ignores the bundle percent', () => {
        expect(
            fundedResetFee(POLICY, {
                activationPercent: percent(0),
                bundlePercent: percent(40),
                evalPercent: percent(0),
                resetPercent: percent(50),
            }),
        ).toBe(249.5);
    });
});

describe('describeFundedReset', () => {
    it('names the price, the per-account count, the payout condition and the window, without em dashes', () => {
        const text = describeFundedReset(POLICY);
        for (const fact of [
            'Qualified Reset',
            '$499',
            '2',
            'payout',
            '7 calendar days',
        ]) {
            expect(text).toContain(fact);
        }
        expect(text).not.toContain('\u{2014}');
    });

    it('explains how a reset changes funded survival and funded bust (D2), so the raised survival is never silent', () => {
        const text = describeFundedReset(POLICY);

        expect(text).toContain(
            'A reset account that then survives counts as surviving; funded bust counts only a breach that could not be reset.',
        );
    });

    it('starts with the plan terms alone, so other surfaces can list them without the mechanics', () => {
        expect(describeFundedReset(POLICY)).toBe(
            `${describeFundedResetTerms(POLICY)}. ${FUNDED_RESET_MECHANICS}`,
        );
        expect(describeFundedResetTerms(POLICY)).not.toContain('When taken');
    });
});

describe('the funded DP models an opted-in funded reset and discloses only that its day policy cannot see the reset count', () => {
    it('reports the day-policy gap with the plan policy for Alpha Zero with the opt-in', () => {
        const zeroTaken = withFundedResetTaken(
            alphaPlan(AlphaFuturesVariant.Zero),
            true,
        );
        expect(fundedDpModelGaps(zeroTaken)).toContainEqual({
            kind: FundedDpModelGapKind.FundedResetPolicyIgnoresResetCount,
            policy: zeroTaken.fundedReset,
        });
    });

    it('reports no reset gap without the opt-in, or on a plan without a reset', () => {
        for (const plan of [
            alphaPlan(AlphaFuturesVariant.Zero),
            withFundedResetTaken(alphaPlan(AlphaFuturesVariant.Advanced), true),
        ]) {
            expect(
                fundedDpModelGaps(plan).some(
                    (gap) =>
                        gap.kind ===
                        FundedDpModelGapKind.FundedResetPolicyIgnoresResetCount,
                ),
            ).toBe(false);
        }
    });
});
