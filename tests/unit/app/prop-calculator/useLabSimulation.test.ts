import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { type LabScenario } from '~/app/(app)/prop-calculator/_components/types';
import {
    type LabRun,
    lifetimeCapPoolingGapNote,
    simulateLabScenarios,
} from '~/app/(app)/prop-calculator/_components/useLabSimulation';
import {
    CorrelationMode,
    DayStopRuleKind,
    FirmId,
    LifetimeCapScope,
    MffuVariant,
    simulatePortfolio,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

const mffPro = findFirm(FirmId.Mffu)?.findPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});

if (mffPro === undefined) throw new Error('MFF Pro plan not found');

describe('lifetimeCapPoolingGapNote (PT-12h, F-110 REV-5)', () => {
    it('discloses the per-user cap gap on a multi-account MFF Pro scenario', () => {
        expect(lifetimeCapPoolingGapNote(mffPro, 2)).toBe(
            "$50K · Pro's $100,000 lifetime cap is per user; this projection pools it across your accounts, so combined payouts here never exceed $100,000.",
        );
    });

    it('says nothing for a single account, even on a pooled-cap plan', () => {
        expect(lifetimeCapPoolingGapNote(mffPro, 1)).toBeNull();
    });

    it('says nothing for a plan with no lifetime dollar cap', () => {
        const plan = defaultCalculatorState().plan;
        expect(lifetimeCapPoolingGapNote(plan, 5)).toBeNull();
    });

    it('says nothing for a per-account scope, even with multiple accounts', () => {
        const perAccount = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        expect(lifetimeCapPoolingGapNote(perAccount, 2)).toBeNull();
    });

    it('says nothing for an unconfirmed scope, even with multiple accounts', () => {
        const unconfirmed = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.Unconfirmed,
        });
        expect(lifetimeCapPoolingGapNote(unconfirmed, 2)).toBeNull();
    });
});

const labScenario: LabScenario = {
    accounts: 1,
    correlation: CorrelationMode.Copy,
    dayStop: { kind: DayStopRuleKind.None },
    groups: 1,
    id: 'one',
    instrument: null,
    label: 'One',
    riskPerTrade: 250,
    rrRatio: 2,
    stopPoints: null,
    tradesPerDay: 1,
    winrate: 0.55,
};

const labRun: LabRun = {
    activationDiscountPercent: 0,
    commissionPerRoundTrip: 0,
    discountPercent: 0,
    fundedHorizonDays: 60,
    linkActivationDiscount: false,
    liveTransferHazard: undefined,
    maxEvalDays: 30,
    minRetainedCushion: undefined,
    monthlySubscriptionDiscountPercent: 0,
    payoutRequestSize: undefined,
    plan: mffPro,
    resetDiscountPercent: 0,
    rungSizing: undefined,
    seed: 7,
};

function countingSimulator() {
    let calls = 0;
    return {
        calls: () => calls,
        simulate: ((inputs) => {
            calls += 1;
            return simulatePortfolio(inputs);
        }) satisfies typeof simulatePortfolio,
    };
}

describe('simulateLabScenarios simulates once per scenario (PT-73b)', () => {
    it('costs one simulation per scenario with no hazard', () => {
        const counter = countingSimulator();

        const results = simulateLabScenarios(
            labRun,
            [labScenario, { ...labScenario, id: 'two' }],
            new Map(),
            counter.simulate,
        );

        expect(counter.calls()).toBe(2);
        expect(results.get('one')?.noTransferMonthlyNet).toBeNull();
    });

    it('costs one simulation per scenario when a hazard is added after the same scenarios ran without one, and again when the hazard changes', () => {
        const counter = countingSimulator();
        const baselines = new Map<string, number>();
        const scenarios = [labScenario, { ...labScenario, id: 'two' }];

        const unpriced = simulateLabScenarios(
            labRun,
            scenarios,
            baselines,
            counter.simulate,
        );
        expect(counter.calls()).toBe(2);

        const half = simulateLabScenarios(
            { ...labRun, liveTransferHazard: 0.5 },
            scenarios,
            baselines,
            counter.simulate,
        );
        expect(counter.calls()).toBe(4);

        simulateLabScenarios(
            { ...labRun, liveTransferHazard: 0.6 },
            scenarios,
            baselines,
            counter.simulate,
        );
        expect(counter.calls()).toBe(6);

        expect(half.get('one')?.noTransferMonthlyNet).toBe(
            unpriced.get('one')?.expectedMonthlyNet,
        );
    });

    it('computes the no-transfer figure once for a scenario first run with a hazard, and reuses it afterwards', () => {
        const counter = countingSimulator();
        const baselines = new Map<string, number>();
        const priced = { ...labRun, liveTransferHazard: 0.5 };

        const first = simulateLabScenarios(
            priced,
            [labScenario],
            baselines,
            counter.simulate,
        );
        expect(counter.calls()).toBe(2);

        const second = simulateLabScenarios(
            { ...priced, liveTransferHazard: 0.7 },
            [labScenario],
            baselines,
            counter.simulate,
        );
        expect(counter.calls()).toBe(3);
        expect(second.get('one')?.noTransferMonthlyNet).toBe(
            first.get('one')?.noTransferMonthlyNet,
        );
        expect(first.get('one')?.noTransferMonthlyNet).not.toBeNull();
    });

    it('does not reuse a no-transfer figure across a different scenario input', () => {
        const counter = countingSimulator();
        const baselines = new Map<string, number>();
        const priced = { ...labRun, liveTransferHazard: 0.5 };

        simulateLabScenarios(priced, [labScenario], baselines, counter.simulate);
        simulateLabScenarios(
            priced,
            [{ ...labScenario, winrate: 0.6 }],
            baselines,
            counter.simulate,
        );

        expect(counter.calls()).toBe(4);
    });
});
