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
            bustProbability: 0.185,
            daysToPassP50: 11,
            expectancyDollars: 197.3361417420394,
            expectedDaysToPass: 12.122699386503067,
            expectedFirstPayoutDay: 0,
            expectedGrossPayout: 10_270.8,
            expectedNet: 10_061.8,
            expectedTotalCost: 209,
            finalBalanceP50: 50_100,
            fundedBustProbability: 0.815,
            maxDrawdownP50: 3900,
            maxLosingStreakP95: 7,
            passProbability: 0,
            profitFactor: 1.9827235145307582,
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
            bustProbability: 0.2,
            daysToPassP50: 6,
            expectancyDollars: 197.5919651500484,
            expectedDaysToPass: 6.85,
            expectedFirstPayoutDay: 15.217054263565892,
            expectedGrossPayout: 8475,
            expectedNet: 7813.8,
            expectedTotalCost: 661.2,
            finalBalanceP50: 55_700,
            fundedBustProbability: 0.155,
            maxDrawdownP50: 3500,
            maxLosingStreakP95: 9,
            passProbability: 0.645,
            profitFactor: 1.9844456502079941,
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
            bustProbability: 0.2,
            daysToPassP50: 5.5,
            expectancyDollars: 196.76692858215304,
            expectedDaysToPass: 6.975,
            expectedFirstPayoutDay: 14.053571428571429,
            expectedGrossPayout: 30_206.7,
            expectedNet: 30_038.5,
            expectedTotalCost: 168.2,
            finalBalanceP50: 80_200,
            fundedBustProbability: 0.24,
            maxDrawdownP50: 4400,
            maxLosingStreakP95: 11,
            passProbability: 0.56,
            profitFactor: 1.9785617097534265,
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
            bustProbability: 0.17,
            daysToPassP50: 6,
            expectancyDollars: 200.52468399713808,
            expectedDaysToPass: 6.771084337349397,
            expectedFirstPayoutDay: 0,
            expectedGrossPayout: 5244.8,
            expectedNet: 4966.9,
            expectedTotalCost: 277.9,
            finalBalanceP50: 50_000,
            fundedBustProbability: 0.83,
            maxDrawdownP50: 3600,
            maxLosingStreakP95: 6,
            passProbability: 0,
            profitFactor: 2.003500954805856,
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
