import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    FirmId,
    newFundedCycleTracker,
    type Plan,
    TopStepVariant,
    tryFundedPayout,
} from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

function variant(v: TopStepVariant): Plan {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: v,
    });
    if (!plan) throw new Error(`TopStep ${v} 50K plan not found`);
    return plan;
}

describe('TopStep DLL add-on variants (live-verified 2026-09-21 against help.topstep.com standard.md/consistency.md)', () => {
    it('the base (no-DLL) variants have no Daily Loss Limit at all, matching the firm default', () => {
        expect(
            variant(TopStepVariant.NoFeeStandard).evalDailyLossLimit,
        ).toEqual({ kind: DailyLossLimitKind.None });
        expect(
            variant(TopStepVariant.StandardConsistency).evalDailyLossLimit,
        ).toEqual({ kind: DailyLossLimitKind.None });
    });

    it.each([
        TopStepVariant.NoFeeStandardDll,
        TopStepVariant.NoFeeConsistencyDll,
        TopStepVariant.StandardStandardDll,
        TopStepVariant.StandardConsistencyDll,
    ])(
        '%s carries the same $1,000 flat DLL from the eval phase into the funded phase unchanged, matching "the DLL is fixed and carried into your XFA when you pass"',
        (v) => {
            const plan = variant(v);
            expect(plan.evalDailyLossLimit).toEqual({
                amount: dollars(1000),
                kind: DailyLossLimitKind.Flat,
            });
            expect(plan.fundedDailyLossLimit).toEqual(plan.evalDailyLossLimit);
        },
    );

    it('the DLL add-on doubles the Standard XFA payout request cap from $2,000 to $4,000', () => {
        expect(variant(TopStepVariant.NoFeeStandard).payoutRequestCap).toBe(
            2000,
        );
        expect(variant(TopStepVariant.NoFeeStandardDll).payoutRequestCap).toBe(
            4000,
        );
    });

    it('the DLL add-on doubles the Consistency XFA payout request cap from $3,000 to $6,000', () => {
        expect(
            variant(TopStepVariant.StandardConsistency).payoutRequestCap,
        ).toBe(3000);
        expect(
            variant(TopStepVariant.StandardConsistencyDll).payoutRequestCap,
        ).toBe(6000);
    });

    it('the Responsible Trading Discount ($10/month) applies only to the No-fee pricing path, not Standard', () => {
        expect(
            variant(TopStepVariant.NoFeeStandard).fees.monthlySubscription,
        ).toBe(95);
        expect(
            variant(TopStepVariant.NoFeeStandardDll).fees.monthlySubscription,
        ).toBe(85);
        expect(
            variant(TopStepVariant.StandardStandard).fees.monthlySubscription,
        ).toBe(49);
        expect(
            variant(TopStepVariant.StandardStandardDll).fees
                .monthlySubscription,
        ).toBe(49);
    });

    it('the DLL add-on never changes the activation fee, Maximum Loss Limit, profit target, or eligibility-day requirements', () => {
        const base = variant(TopStepVariant.NoFeeConsistency);
        const dll = variant(TopStepVariant.NoFeeConsistencyDll);
        expect(dll.fees.activation).toBe(base.fees.activation);
        expect(dll.fundedDrawdown.amount).toBe(base.fundedDrawdown.amount);
        expect(dll.profitTarget).toBe(base.profitTarget);
        expect(dll.minDaysAfterPassForPayout).toBe(
            base.minDaysAfterPassForPayout,
        );
    });

    it('end to end: the doubled cap actually lets a real funded payout withdraw more than the base cap would allow', () => {
        const base = variant(TopStepVariant.StandardStandard);
        const dll = variant(TopStepVariant.StandardStandardDll);
        const bigProfit = 20_000;

        for (const plan of [base, dll]) {
            const state = plan.initialState();
            state.threshold = plan.accountSize;
            state.thresholdLocked = true;
            const tracker = newFundedCycleTracker(state);
            state.balance = plan.accountSize + bigProfit;
            state.qualifyingDays = plan.minDaysAfterPassForPayout;

            const payout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
                tracker,
            });

            expect(payout).not.toBeNull();
            expect(payout?.debited).toBe(plan.payoutRequestCap);
        }

        expect(base.payoutRequestCap).not.toBeNull();
        expect(dll.payoutRequestCap).toBeGreaterThan(
            base.payoutRequestCap ?? 0,
        );
    });
});
