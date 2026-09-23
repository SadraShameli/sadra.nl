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
import {
    CorrelationMode,
    type SimOutputs,
    simulate,
    simulatePortfolio,
} from '~/lib/prop-calculator/simulator';

interface Characterization {
    expected: Record<PinnedKey, number>;
    id: PlanId;
    label: string;
}

type PinnedKey =
    | 'bustProbability'
    | 'daysToPassP50'
    | 'evalPassProbability'
    | 'expectancyDollars'
    | 'expectedDaysToPass'
    | 'expectedFirstPayoutDay'
    | 'expectedGrossPayout'
    | 'expectedMonthlyNet'
    | 'expectedNet'
    | 'expectedTotalCost'
    | 'finalBalanceP50'
    | 'fundedBustProbability'
    | 'fundedSurvivalProbability'
    | 'maxDrawdownP50'
    | 'maxLosingStreakP95'
    | 'profitFactor'
    | 'timeoutProbability';

const CASES: readonly Characterization[] = [
    {
        expected: {
            bustProbability: 0.185,
            daysToPassP50: 11,
            evalPassProbability: 0.815,
            expectancyDollars: 197.3361417420394,
            expectedDaysToPass: 12.122699386503067,
            expectedFirstPayoutDay: 19.223076923076924,
            expectedGrossPayout: 10_270.8,
            expectedMonthlyNet: 5196.699458927693,
            expectedNet: 10_061.8,
            expectedTotalCost: 209,
            finalBalanceP50: 50_100,
            fundedBustProbability: 0.815,
            fundedSurvivalProbability: 0,
            maxDrawdownP50: 3900,
            maxLosingStreakP95: 7,
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
            evalPassProbability: 0.8,
            expectancyDollars: 197.5919651500484,
            expectedDaysToPass: 6.85,
            expectedFirstPayoutDay: 15.20863309352518,
            expectedGrossPayout: 8475,
            expectedMonthlyNet: 3958.8128845457836,
            expectedNet: 7813,
            expectedTotalCost: 662,
            finalBalanceP50: 55_700,
            fundedBustProbability: 0.155,
            fundedSurvivalProbability: 0.645,
            maxDrawdownP50: 3500,
            maxLosingStreakP95: 9,
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
            evalPassProbability: 0.8,
            expectancyDollars: 196.76692858215304,
            expectedDaysToPass: 6.975,
            expectedFirstPayoutDay: 13.920634920634921,
            expectedGrossPayout: 30_206.7,
            expectedMonthlyNet: 4343.868408772749,
            expectedNet: 30_038.5,
            expectedTotalCost: 168.2,
            finalBalanceP50: 80_200,
            fundedBustProbability: 0.24,
            fundedSurvivalProbability: 0.56,
            maxDrawdownP50: 4400,
            maxLosingStreakP95: 11,
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
            evalPassProbability: 0.83,
            expectancyDollars: 200.52468399713808,
            expectedDaysToPass: 6.771084337349397,
            expectedFirstPayoutDay: 11.971014492753623,
            expectedGrossPayout: 7932.8,
            expectedMonthlyNet: 5055.917597106462,
            expectedNet: 7654.9,
            expectedTotalCost: 277.9,
            finalBalanceP50: 50_000,
            fundedBustProbability: 0.83,
            fundedSurvivalProbability: 0,
            maxDrawdownP50: 3600,
            maxLosingStreakP95: 6,
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

describe('engine characterization: MFFU Rapid EOD portfolio (2 accounts, independent)', () => {
    const out = simulatePortfolio({
        accounts: 2,
        correlation: CorrelationMode.Independent,
        fundedHorizonDays: 252,
        groups: 2,
        maxEvalDays: 150,
        minRetainedCushion: 2000,
        plan: planFor({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        }),
        riskPerTrade: 400,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.5,
    });

    it('pins expectedMonthlyNet', () => {
        expect(out.expectedMonthlyNet).toBe(10_765.30693069307);
    });

    it('pins expectedNet', () => {
        expect(out.expectedNet).toBe(20_710.4);
    });
});
