import { describe, expect, it } from 'vitest';

import {
    FeeKind,
    feePrefillCents,
    feePrefillDefaultKind,
    usdCents,
    type UsdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts';
import {
    activationFee,
    ALL_FIRMS,
    AlphaFuturesVariant,
    ApexVariant,
    findFirm,
    FirmId,
    fundedResetFee,
    initialEvalFee,
    monthlySubscriptionFee,
    type Plan,
    type PlanId,
    resetFee,
    RetryKind,
} from '~/lib/prop-calculator';

function findPlan(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

const APEX_EOD_50K = findPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

function listPrice(dollars: number): null | UsdCents {
    return dollars > 0 ? usdCentsFromDollars(dollars) : null;
}

const ALPHA_STANDARD_50K = findPlan({
    accountSize: 50_000,
    firm: FirmId.AlphaFutures,
    variant: AlphaFuturesVariant.Standard,
});

describe('feePrefillCents', () => {
    it('prefills Apex 50K EOD from its plan file (ApexTraderFunding.ts SIZES eod: evalCost 590, activation 90; no subscription, rebuy retry so no reset product, no funded reset)', () => {
        expect(feePrefillCents(APEX_EOD_50K, FeeKind.EvalPurchase)).toBe(
            usdCents(59_000),
        );
        expect(feePrefillCents(APEX_EOD_50K, FeeKind.Activation)).toBe(
            usdCents(9000),
        );
        expect(feePrefillCents(APEX_EOD_50K, FeeKind.Subscription)).toBeNull();
        expect(feePrefillCents(APEX_EOD_50K, FeeKind.Reset)).toBeNull();
        expect(feePrefillCents(APEX_EOD_50K, FeeKind.Rebuy)).toBe(
            usdCents(59_000),
        );
        expect(feePrefillCents(APEX_EOD_50K, FeeKind.FundedReset)).toBeNull();
    });

    it('prefills Alpha Futures 50K Standard from its plan file (AlphaFutures.ts STANDARD_SIZES: monthlyFee 129, resetFee 109, qualifiedResetFee 599; no eval or activation fee, so a rebuy is a new subscription month)', () => {
        expect(
            feePrefillCents(ALPHA_STANDARD_50K, FeeKind.EvalPurchase),
        ).toBeNull();
        expect(
            feePrefillCents(ALPHA_STANDARD_50K, FeeKind.Activation),
        ).toBeNull();
        expect(feePrefillCents(ALPHA_STANDARD_50K, FeeKind.Subscription)).toBe(
            usdCents(12_900),
        );
        expect(feePrefillCents(ALPHA_STANDARD_50K, FeeKind.Reset)).toBe(
            usdCents(10_900),
        );
        expect(feePrefillCents(ALPHA_STANDARD_50K, FeeKind.Rebuy)).toBeNull();
        expect(feePrefillCents(ALPHA_STANDARD_50K, FeeKind.FundedReset)).toBe(
            usdCents(59_900),
        );
    });

    it('prefills a refund with zero and leaves an other fee for the user to enter', () => {
        for (const plan of [APEX_EOD_50K, ALPHA_STANDARD_50K]) {
            expect(feePrefillCents(plan, FeeKind.Refund)).toBe(usdCents(0));
            expect(feePrefillCents(plan, FeeKind.Other)).toBeNull();
        }
    });

    it('prefills each charge as one line item at list price from the engine fee functions, a rebuy without its first subscription month, for every modeled plan', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                const expected: Readonly<Record<FeeKind, null | number>> = {
                    [FeeKind.Activation]: listPrice(activationFee(plan.fees)),
                    [FeeKind.EvalPurchase]: listPrice(
                        initialEvalFee(plan.fees),
                    ),
                    [FeeKind.FundedReset]:
                        plan.fundedReset === null
                            ? null
                            : listPrice(
                                  fundedResetFee(plan.fundedReset, undefined),
                              ),
                    [FeeKind.Other]: null,
                    [FeeKind.Rebuy]: listPrice(initialEvalFee(plan.fees)),
                    [FeeKind.Refund]: 0,
                    [FeeKind.Reset]:
                        plan.fees.retry === RetryKind.Rebuy
                            ? null
                            : listPrice(resetFee(plan.fees)),
                    [FeeKind.Subscription]: listPrice(
                        monthlySubscriptionFee(plan.fees),
                    ),
                };
                for (const kind of Object.values(FeeKind)) {
                    expect(
                        feePrefillCents(plan, kind),
                        `${plan.label} ${kind}`,
                    ).toBe(expected[kind]);
                }
            }
        }
    });

    it('never prefills a zero charge: only a refund may start at zero, every other prefill is whole positive cents', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                for (const kind of Object.values(FeeKind)) {
                    const cents = feePrefillCents(plan, kind);
                    if (cents === null || kind === FeeKind.Refund) continue;
                    expect(Number.isSafeInteger(cents)).toBe(true);
                    expect(cents, `${plan.label} ${kind}`).toBeGreaterThan(0);
                }
            }
        }
    });
});

describe('feePrefillDefaultKind', () => {
    it('opens on the evaluation purchase for a plan sold as a one-time evaluation', () => {
        expect(feePrefillDefaultKind(APEX_EOD_50K)).toBe(FeeKind.EvalPurchase);
    });

    it('opens on the subscription for a plan sold only as a monthly subscription', () => {
        expect(feePrefillDefaultKind(ALPHA_STANDARD_50K)).toBe(
            FeeKind.Subscription,
        );
    });

    it('opens on a kind the plan has a price for whenever the plan has one', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                const kind = feePrefillDefaultKind(plan);
                const hasPurchasePrice =
                    feePrefillCents(plan, FeeKind.EvalPurchase) !== null ||
                    feePrefillCents(plan, FeeKind.Subscription) !== null;
                expect(
                    feePrefillCents(plan, kind) !== null,
                    `${plan.label} ${kind}`,
                ).toBe(hasPurchasePrice);
            }
        }
    });
});
