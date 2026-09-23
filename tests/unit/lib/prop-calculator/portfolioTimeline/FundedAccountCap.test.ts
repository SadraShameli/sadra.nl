import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    MffuVariant,
    type Plan,
    type PlanId,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type PortfolioTimelineResult,
    simulatePortfolioTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

const builder50k = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Builder,
});
const rapidEod50k = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});
const apexEod50k = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

function comparable(out: PortfolioTimelineResult) {
    return {
        breakEvenMonthValues: out.breakEvenMonthValues,
        netP10: out.netP10,
        netP50: out.netP50,
        netP90: out.netP90,
        payoutP50: out.payoutP50,
        pEverCashflowPositive: out.pEverCashflowPositive,
        spendP50: out.spendP50,
    };
}

function run(plan: Plan, accounts: number): PortfolioTimelineResult {
    return simulatePortfolioTimeline({
        accounts,
        maxEvalDays: 60,
        plan,
        riskPerTrade: 300,
        rrRatio: 2,
        seed: 12_345,
        tradesPerDay: 3,
        trials: 40,
        winrate: 0.6,
    });
}

describe('simulatePortfolioTimeline: never simulates more concurrent funded accounts than the plan allows', () => {
    it('clamps MFF Builder 50K (cap 1) to a single simulated account when 5 are requested', () => {
        expect(builder50k.maxFundedAccounts).toBe(1);
        const out = run(builder50k, 5);
        expect(out.accountsSimulated).toBe(1);
    });

    it('gives MFF Builder 50K with 5 requested accounts the same figures as the 1-account run', () => {
        const capped = run(builder50k, 5);
        const single = run(builder50k, 1);
        expect(comparable(capped)).toEqual(comparable(single));
    });

    it('clamps MFF Rapid EOD 50K (cap 3) to 3 simulated accounts when 10 are requested', () => {
        expect(rapidEod50k.maxFundedAccounts).toBe(3);
        const capped = run(rapidEod50k, 10);
        const three = run(rapidEod50k, 3);
        expect(capped.accountsSimulated).toBe(3);
        expect(comparable(capped)).toEqual(comparable(three));
    });

    it('still runs every requested account when the count is under the cap (Apex EOD 50K, cap 20, 7 accounts)', () => {
        expect(apexEod50k.maxFundedAccounts).toBeGreaterThanOrEqual(7);
        const seven = run(apexEod50k, 7);
        const single = run(apexEod50k, 1);
        expect(seven.accountsSimulated).toBe(7);
        expect(seven.spendP50.at(-1) ?? 0).toBeGreaterThan(
            single.spendP50.at(-1) ?? 0,
        );
    });

    it.each([0, -1, 2.5, NaN, Infinity])(
        'throws instead of producing a result when the plan cap is %s',
        (cap) => {
            const broken = builder50k.withOverrides({ maxFundedAccounts: cap });
            expect(() => run(broken, 5)).toThrow(
                /maxFundedAccounts must be a positive integer/,
            );
        },
    );
});
