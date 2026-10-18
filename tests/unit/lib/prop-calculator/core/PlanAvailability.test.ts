import { describe, expect, it } from 'vitest';

import {
    FirmId,
    PLAN_AVAILABILITY_LABEL,
    PlanAvailability,
    rankablePlans,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

const topstep = new TopStep();

function topstepPlan(variant: TopStepVariant) {
    const plan = topstep.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant,
    });
    if (!plan) throw new Error(`TopStep ${variant} missing`);
    return plan;
}

describe('PlanAvailability (D3)', () => {
    it('defaults a plan built without an availability to purchasable', () => {
        const plan = topstepPlan(TopStepVariant.StandardStandard);
        expect(plan.availability).toBe(PlanAvailability.Purchasable);
        expect(plan.isPurchasable).toBe(true);
    });

    it('marks the TopStep Pro Account call-up only', () => {
        const plan = topstepPlan(TopStepVariant.ProAccount);
        expect(plan.availability).toBe(PlanAvailability.CallUpOnly);
        expect(plan.isPurchasable).toBe(false);
    });

    it('keeps every other TopStep plan purchasable', () => {
        const others = topstep.plans.filter(
            (plan) =>
                'variant' in plan.id &&
                plan.id.variant !== TopStepVariant.ProAccount,
        );
        expect(others).toHaveLength(8);
        expect(others.every((plan) => plan.isPurchasable)).toBe(true);
    });

    it('survives withMaxLifetimePayouts and withOverrides', () => {
        const plan = topstepPlan(TopStepVariant.ProAccount);
        expect(plan.withMaxLifetimePayouts(null).availability).toBe(
            PlanAvailability.CallUpOnly,
        );
        expect(plan.withOverrides({ minTradingDays: 1 }).isPurchasable).toBe(
            false,
        );
    });

    it('rankablePlans drops call-up-only plans unless they are included', () => {
        const excluded = rankablePlans(topstep.plans, false);
        expect(excluded).toHaveLength(8);
        expect(
            excluded.some(
                (plan) =>
                    'variant' in plan.id &&
                    plan.id.variant === TopStepVariant.ProAccount,
            ),
        ).toBe(false);
        expect(rankablePlans(topstep.plans, true)).toHaveLength(9);
    });

    it('labels every availability', () => {
        expect(PLAN_AVAILABILITY_LABEL[PlanAvailability.CallUpOnly]).toBe(
            'call-up only',
        );
        expect(PLAN_AVAILABILITY_LABEL[PlanAvailability.Purchasable]).toBe(
            'purchasable',
        );
    });
});
