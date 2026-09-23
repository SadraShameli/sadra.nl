import { describe, expect, it } from 'vitest';

import { describeConsistencyBadge } from '~/app/(app)/prop-calculator/_components/consistencyBadge';
import {
    AlphaFuturesVariant,
    ApexVariant,
    ConsistencyRule,
    ConsistencyScope,
    FirmId,
    fraction,
    type Plan,
    type PlanId,
    TradeifyVariant,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

function alphaPlan(variant: AlphaFuturesVariant): Plan {
    return planFor({ accountSize: 50_000, firm: FirmId.AlphaFutures, variant });
}

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

const bothPhases30 = new ConsistencyRule(ConsistencyScope.Both, fraction(0.3));

const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

describe("describeConsistencyBadge shows the eval and funded consistency rules from the plan's phase accessors", () => {
    it('shows Alpha Standard Evaluation 50% next to its stricter Qualified 40% rule', () => {
        expect(
            describeConsistencyBadge(alphaPlan(AlphaFuturesVariant.Standard)),
        ).toBe(
            'Eval 50% · Funded 40% (inclusive, fails on a net-losing cycle)',
        );
    });

    it('shows Alpha Zero Qualified 40% rule as a funded rule', () => {
        expect(
            describeConsistencyBadge(alphaPlan(AlphaFuturesVariant.Zero)),
        ).toBe('Funded 40% (inclusive, fails on a net-losing cycle)');
    });

    it('shows Alpha Advanced as an eval-only rule', () => {
        expect(
            describeConsistencyBadge(alphaPlan(AlphaFuturesVariant.Advanced)),
        ).toBe('Eval 40%');
    });

    it('shows the first step of the Tradeify Lightning funded consistency ladder', () => {
        expect(
            describeConsistencyBadge(
                planFor({
                    accountSize: 50_000,
                    firm: FirmId.Tradeify,
                    variant: TradeifyVariant.Lightning,
                }),
            ),
        ).toBe('Funded 20%');
    });

    it('shows a rule that binds both phases once, without a phase prefix', () => {
        expect(
            describeConsistencyBadge(
                apexEod.withOverrides({
                    consistency: bothPhases30,
                }),
            ),
        ).toBe('30%');
    });

    it('drops the eval side of an instant-funded plan', () => {
        expect(
            describeConsistencyBadge(
                apexEod.withOverrides({
                    consistency: bothPhases30,
                    isInstantFunded: true,
                }),
            ),
        ).toBe('Funded 30%');
    });

    it('returns null when neither phase has a consistency rule', () => {
        expect(
            describeConsistencyBadge(
                apexEod.withOverrides({ consistency: null }),
            ),
        ).toBeNull();
    });
});
