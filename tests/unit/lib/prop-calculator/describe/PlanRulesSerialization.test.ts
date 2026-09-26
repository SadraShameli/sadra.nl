import { describe, expect, it } from 'vitest';

import {
    ALL_FIRMS,
    AlphaFuturesVariant,
    dollars,
    type DrawdownStrategy,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    IntradayTrailingDrawdown,
    NO_PLAN_OPT_INS,
    type PayoutTier,
    type Plan,
    type PlanId,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { serializePlanRules } from '~/lib/prop-calculator/describe';
import { findFirm } from '~/lib/prop-calculator/firms';
import { stableJson } from '~/lib/stableJson';

function lockedAt(offset: number) {
    return {
        atProfit: dollars(2000),
        lockedThreshold: (startingBalance: number) => startingBalance + offset,
    };
}

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

function registryPlans(): Plan[] {
    return ALL_FIRMS.flatMap((firm) => [...firm.plans]);
}

function serializedWithDrawdown(drawdown: DrawdownStrategy): string {
    return serializePlanRules(alphaStandard.withOverrides({ drawdown }));
}

function serializedWithLockOffset(offset: number): string {
    return serializedWithDrawdown(
        new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: lockedAt(offset),
        }),
    );
}

function traderShareFirst(tier: PayoutTier): PayoutTier {
    const leading: Pick<PayoutTier, 'traderShare'> = {
        traderShare: tier.traderShare,
    };
    return { ...leading, thresholdProfit: tier.thresholdProfit };
}

const alphaStandard = planFor({
    accountSize: 50_000,
    firm: FirmId.AlphaFutures,
    variant: AlphaFuturesVariant.Standard,
});

describe('serializePlanRules: canonical structural JSON of the rule values (PT-45 input)', () => {
    it('serializes every registry plan to parseable canonical JSON, one distinct value per plan', () => {
        const serialized = registryPlans().map((plan) =>
            serializePlanRules(plan),
        );
        for (const text of serialized) {
            expect(stableJson(JSON.parse(text))).toBe(text);
        }
        expect(new Set(serialized).size).toBe(serialized.length);
    });

    it('is deterministic across calls and independent of key insertion order', () => {
        const reorderedTiers = alphaStandard.payoutTiers.map((tier) =>
            traderShareFirst(tier),
        );
        expect(Object.keys(reorderedTiers[0] ?? {})).toEqual([
            'traderShare',
            'thresholdProfit',
        ]);
        const reordered = alphaStandard.withOverrides({
            payoutTiers: reorderedTiers,
        });
        expect(serializePlanRules(alphaStandard)).toBe(
            serializePlanRules(alphaStandard),
        );
        expect(serializePlanRules(reordered)).toBe(
            serializePlanRules(alphaStandard.withOverrides({})),
        );
    });

    it('changes when a rule value changes', () => {
        const base = serializePlanRules(alphaStandard);
        const higherTarget = alphaStandard.withOverrides({
            profitTarget: dollars(alphaStandard.profitTarget + 1),
        });
        const halfShare = alphaStandard.withScaledTraderShare(fraction(0.5));
        expect(serializePlanRules(higherTarget)).not.toBe(base);
        expect(serializePlanRules(halfShare)).not.toBe(base);
    });

    it('changes when an opt-in is taken', () => {
        const taken = withPlanOptIns(alphaStandard, {
            ...NO_PLAN_OPT_INS,
            takesFundedReset: true,
        });
        const declined = withPlanOptIns(alphaStandard, NO_PLAN_OPT_INS);
        expect(serializePlanRules(taken)).not.toBe(
            serializePlanRules(declined),
        );
    });

    it('does not change when only a label changes', () => {
        const unchanged = serializePlanRules(alphaStandard.withOverrides({}));
        const renamedPlan = alphaStandard.withOverrides({
            label: 'Renamed plan',
        });
        expect(serializePlanRules(renamedPlan)).toBe(unchanged);
        const reset = alphaStandard.fundedReset;
        expect(reset).not.toBeNull();
        if (reset === null) return;
        const renamedReset = alphaStandard.withOverrides({
            fundedReset: { ...reset, label: 'Renamed reset' },
        });
        expect(serializePlanRules(renamedReset)).toBe(unchanged);
        expect(unchanged).not.toContain('"label"');
    });

    it('resolves the drawdown lock floor, which is a function, into a value', () => {
        expect(serializedWithLockOffset(100)).not.toBe(
            serializedWithLockOffset(0),
        );
        expect(serializedWithLockOffset(100)).toBe(
            serializedWithLockOffset(100),
        );
    });

    it('tells drawdown kinds apart at the same amount', () => {
        const eod = new EodTrailingDrawdown({ amount: dollars(2000) });
        const intraday = new IntradayTrailingDrawdown({
            amount: dollars(2000),
        });
        expect(serializedWithDrawdown(eod)).not.toBe(
            serializedWithDrawdown(intraday),
        );
    });

    it('fails loud on a rule value it cannot serialize', () => {
        const ladder = {
            minRequestAmount: dollars(500),
            steps: [1000],
            unexpected: () => 1,
        };
        const plan = alphaStandard.withOverrides({ payoutLadder: ladder });
        expect(() => serializePlanRules(plan)).toThrow(/cannot serialize/);
    });
});
