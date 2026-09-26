import { describe, expect, it } from 'vitest';

import { describeConsistencyBadge } from '~/app/(app)/prop-calculator/_components/consistencyBadge';
import {
    ALL_FIRMS,
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

describe('describeConsistencyBadge for every registry plan (PT-31a pin)', () => {
    it('keeps the badge of every plan', () => {
        const badges = Object.fromEntries(
            ALL_FIRMS.flatMap((firm) => firm.plans).map((plan) => [
                `${plan.id.firm} ${plan.label}`,
                describeConsistencyBadge(plan),
            ]),
        );
        expect(badges).toMatchInlineSnapshot(`
          {
            "alphafutures $50K · Advanced": "Eval 40%",
            "alphafutures $50K · Standard": "Eval 50% · Funded 40% (inclusive, fails on a net-losing cycle)",
            "alphafutures $50K · Zero": "Funded 40% (inclusive, fails on a net-losing cycle)",
            "apex $50K · EOD trailing": "Funded 50%",
            "apex $50K · Intraday trailing": "Funded 50%",
            "e8futures $50K · Signature": "Funded 35%",
            "e8futures $50K · Zero MAX (100% payout)": "Eval 40%",
            "e8futures $50K · Zero MAX (80% payout)": "Eval 40%",
            "e8futures $50K · Zero Starter (100% payout)": "Eval 40%",
            "e8futures $50K · Zero Starter (80% payout)": "Eval 40%",
            "ftmo-futures $50K · Growth": "Eval 40%",
            "ftmo-futures $50K · Pro": "Eval 50%",
            "fundednext $50K · FNL:003 Instant": "Funded 20%",
            "fundednext $50K · Flex": "Eval 40%",
            "fundednext $50K · Legacy": "Eval 40%",
            "fundednext $50K · Rapid Daily": null,
            "fundednext $50K · Rapid Pro": "Funded 40%",
            "fundednext $50K · Rapid Pro (DLL Add-On)": "Funded 40%",
            "lucid $50K · LucidDaily (EOD)": "Eval 50%",
            "lucid $50K · LucidDaily (EOD, DLL)": "Eval 50%",
            "lucid $50K · LucidDaily (Intraday)": "Eval 50%",
            "lucid $50K · LucidDaily (Intraday, DLL)": "Eval 50%",
            "lucid $50K · LucidDirect": "Funded 20%",
            "lucid $50K · LucidFlex": "Eval 50%",
            "lucid $50K · LucidFlex (DLL)": "Eval 50%",
            "lucid $50K · LucidMaxx": "Eval 40%",
            "lucid $50K · LucidPro": "Funded 40%",
            "lucid $50K · LucidPro (no DLL)": "Funded 40%",
            "mffu $50K · Builder": "Funded 50%",
            "mffu $50K · Pro": "Eval 50%",
            "mffu $50K · Rapid": "Eval 50%",
            "mffu $50K · Rapid EOD": "Eval 30%",
            "topstep $50K · No-fee path · Consistency XFA": "Eval 55% · Funded 40%",
            "topstep $50K · No-fee path · Consistency XFA · DLL": "Eval 55% · Funded 40%",
            "topstep $50K · No-fee path · Standard XFA": "Eval 55%",
            "topstep $50K · No-fee path · Standard XFA · DLL": "Eval 55%",
            "topstep $50K · Pro Account": null,
            "topstep $50K · Standard path · Consistency XFA": "Eval 55% · Funded 40%",
            "topstep $50K · Standard path · Consistency XFA · DLL": "Eval 55% · Funded 40%",
            "topstep $50K · Standard path · Standard XFA": "Eval 55%",
            "topstep $50K · Standard path · Standard XFA · DLL": "Eval 55%",
            "tpt $50K · Test → PRO": "Eval 50%",
            "tradeify $50K · Growth": "Funded 35%",
            "tradeify $50K · Lightning Funded": "Funded 20%",
            "tradeify $50K · Select Daily": "Eval 40%",
            "tradeify $50K · Select Flex": "Eval 40%",
          }
        `);
    });
});
