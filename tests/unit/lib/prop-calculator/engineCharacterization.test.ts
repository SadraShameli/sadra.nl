import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    FirmId,
    MffuVariant,
    type Plan,
    type PlanId,
    RungSizing,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type SimOutputs, simulate } from '~/lib/prop-calculator/simulator';

interface Characterization {
    expected: Record<PinnedKey, number>;
    id: PlanId;
    label: string;
}

type PinnedKey =
    | 'bustProbability'
    | 'daysToPassP50'
    | 'expectancyDollars'
    | 'expectedDaysToPass'
    | 'expectedFirstPayoutDay'
    | 'expectedGrossPayout'
    | 'expectedNet'
    | 'expectedTotalCost'
    | 'finalBalanceP50'
    | 'fundedBustProbability'
    | 'maxDrawdownP50'
    | 'maxLosingStreakP95'
    | 'passProbability'
    | 'profitFactor'
    | 'timeoutProbability';

const CASES: readonly Characterization[] = [
    {
        expected: {
            bustProbability: 0.225,
            daysToPassP50: 11,
            expectancyDollars: 131.2752857572097,
            expectedDaysToPass: 11.535483870967742,
            expectedFirstPayoutDay: 0,
            expectedGrossPayout: 9007.2,
            expectedNet: 8850.2,
            expectedTotalCost: 157,
            finalBalanceP50: 50_400,
            fundedBustProbability: 0.775,
            maxDrawdownP50: 3600,
            maxLosingStreakP95: 7,
            passProbability: 0,
            profitFactor: 1.982444473999202,
            timeoutProbability: 0,
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        },
        label: 'MFFU Rapid EOD',
    },
    {
        expected: {
            bustProbability: 0.225,
            daysToPassP50: 6,
            expectancyDollars: 130.00185237858716,
            expectedDaysToPass: 6.838709677419355,
            expectedFirstPayoutDay: 16.30275229357798,
            expectedGrossPayout: 7115,
            expectedNet: 6426,
            expectedTotalCost: 689,
            finalBalanceP50: 56_600,
            fundedBustProbability: 0.23,
            maxDrawdownP50: 2900,
            maxLosingStreakP95: 9,
            passProbability: 0.545,
            profitFactor: 1.9869542753810385,
            timeoutProbability: 0,
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        },
        label: 'Apex EOD',
    },
    {
        expected: {
            bustProbability: 0.165,
            daysToPassP50: 6,
            expectancyDollars: 120.91995115984656,
            expectedDaysToPass: 6.766467065868263,
            expectedFirstPayoutDay: 13.508064516129032,
            expectedGrossPayout: 33_058.8,
            expectedNet: 32_860.065,
            expectedTotalCost: 198.735,
            finalBalanceP50: 83_200,
            fundedBustProbability: 0.215,
            maxDrawdownP50: 4400,
            maxLosingStreakP95: 11,
            passProbability: 0.62,
            profitFactor: 1.9814350074078553,
            timeoutProbability: 0,
        },
        id: {
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        },
        label: 'TopStep Standard XFA',
    },
    {
        expected: {
            bustProbability: 0.195,
            daysToPassP50: 6,
            expectancyDollars: 121.02839427229,
            expectedDaysToPass: 7.012422360248447,
            expectedFirstPayoutDay: 22,
            expectedGrossPayout: 14_411.2,
            expectedNet: 14_111.2,
            expectedTotalCost: 300,
            finalBalanceP50: 50_000,
            fundedBustProbability: 0.8,
            maxDrawdownP50: 4800,
            maxLosingStreakP95: 8,
            passProbability: 0.005,
            profitFactor: 1.9759669545625234,
            timeoutProbability: 0,
        },
        id: { accountSize: 50_000, firm: FirmId.Tpt },
        label: 'TPT Test to PRO',
    },
];

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error(`plan not found for ${id.firm}`);
    return plan;
}

function run(id: PlanId): SimOutputs {
    return simulate({
        fundedHorizonDays: 252,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan: planFor(id),
        riskPerTrade: 400,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.5,
    });
}

describe.each(CASES)('engine characterization: $label', (characterization) => {
    const out = run(characterization.id);

    it.each(
        Object.entries(characterization.expected).map(([key, value]) => ({
            key: key as PinnedKey,
            value,
        })),
    )('pins $key', ({ key, value }) => {
        expect(out[key]).toBe(value);
    });
});
