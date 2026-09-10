import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    type Plan,
    type PlanId,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    resolveDayPolicy,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator/simulator';

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error(`plan not found for ${id.firm}`);
    return plan;
}

const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

function baseInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan: apexEod,
        riskPerTrade: 400,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.5,
        ...overrides,
    };
}

describe('funded-phase flat parameter overrides', () => {
    it('resolves a funded day policy independent of the eval day policy when set', () => {
        const inputs = baseInputs({
            fundedRiskPerTrade: 900,
            fundedTradesPerDay: 5,
        });
        const evalPolicy = resolveDayPolicy(inputs, TradingPhase.Eval);
        const fundedPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
        expect(evalPolicy.ladder).toEqual([400, 400]);
        expect(fundedPolicy.ladder).toEqual([900, 900, 900, 900, 900]);
    });

    it('mirrors the eval flat parameters when no funded override is given', () => {
        const inputs = baseInputs();
        const evalPolicy = resolveDayPolicy(inputs, TradingPhase.Eval);
        const fundedPolicy = resolveDayPolicy(inputs, TradingPhase.Funded);
        expect(fundedPolicy.ladder).toEqual(evalPolicy.ladder);
    });

    it('changes simulated funded-phase outcomes when fundedRiskPerTrade differs from riskPerTrade', () => {
        const baseline = simulate(baseInputs());
        const overridden = simulate(baseInputs({ fundedRiskPerTrade: 4000 }));
        expect(overridden.expectedNet).not.toBe(baseline.expectedNet);
        expect(overridden.maxDrawdownP50).not.toBe(baseline.maxDrawdownP50);
    });
});
