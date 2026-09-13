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
            expectancyDollars: 197.35506278386322,
            expectedDaysToPass: 11.535483870967742,
            expectedFirstPayoutDay: 0,
            expectedGrossPayout: 9007.2,
            expectedNet: 8798.2,
            expectedTotalCost: 209,
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
            bustProbability: 0.19,
            daysToPassP50: 6,
            expectancyDollars: 197.54648265286562,
            expectedDaysToPass: 6.932098765432099,
            expectedFirstPayoutDay: 16.17948717948718,
            expectedGrossPayout: 7690,
            expectedNet: 7001,
            expectedTotalCost: 689,
            finalBalanceP50: 55_800,
            fundedBustProbability: 0.225,
            maxDrawdownP50: 3300,
            maxLosingStreakP95: 9,
            passProbability: 0.585,
            profitFactor: 1.9843361986628463,
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
            expectancyDollars: 197.20226613405427,
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
            bustProbability: 0.18,
            daysToPassP50: 5,
            expectancyDollars: 199.31784960207892,
            expectedDaysToPass: 6.670731707317073,
            expectedFirstPayoutDay: 0,
            expectedGrossPayout: 7592,
            expectedNet: 7292,
            expectedTotalCost: 300,
            finalBalanceP50: 50_000,
            fundedBustProbability: 0.82,
            maxDrawdownP50: 3600,
            maxLosingStreakP95: 6,
            passProbability: 0,
            profitFactor: 1.9954574951330304,
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
