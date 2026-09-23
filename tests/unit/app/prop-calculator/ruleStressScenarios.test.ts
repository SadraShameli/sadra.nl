import { describe, expect, it } from 'vitest';

import { buildStressScenarios } from '~/app/(app)/prop-calculator/_components/ruleStressScenarios';
import {
    FirmId,
    FundedNextVariant,
    MffuVariant,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

function safetyNetPlan(base: Plan): Plan {
    const scenario = buildStressScenarios(base).find(
        (candidate) => candidate.label === 'Safety net ×1.5',
    );
    if (!scenario) throw new Error('no safety net scenario');
    return scenario.plan;
}

const legacy = planFor({
    accountSize: 50_000,
    firm: FirmId.FundedNext,
    variant: FundedNextVariant.Legacy,
});

const mffPro = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});

describe('buildStressScenarios', () => {
    it('runs the baseline and four tightenings, in order', () => {
        expect(buildStressScenarios(mffPro).map((s) => s.label)).toStrictEqual([
            'Baseline',
            'DLL ×0.5',
            'Payout share −20%',
            'Safety net ×1.5',
            'Profit target +40% (proxy)',
        ]);
    });

    it('raises the first-payout profit gate by 50%', () => {
        expect(safetyNetPlan(mffPro).minPayoutProfit).toBe(3150);
    });

    it("also raises FundedNext Legacy's $500 per-cycle gate to $750, so the scenario is not a no-op on a $0 first-payout gate (N-42)", () => {
        const stressed = safetyNetPlan(legacy);

        expect(stressed.minPayoutProfit).toBe(0);
        expect(stressed.minPayoutProfitPerCycle).toBe(750);
    });

    it('leaves an unset per-cycle gate unset', () => {
        expect(mffPro.minPayoutProfitPerCycle).toBeNull();
        expect(safetyNetPlan(mffPro).minPayoutProfitPerCycle).toBeNull();
    });
});
