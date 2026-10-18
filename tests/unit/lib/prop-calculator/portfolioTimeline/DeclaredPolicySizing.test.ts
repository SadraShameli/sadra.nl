import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    type DayPolicy,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    type Plan,
    PolicySizing,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type AccountTimelineInputs,
    runAccountTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';
import { mulberry32 } from '~/lib/prop-calculator/rng';

function apexEod50k(): Plan {
    const found = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!found) throw new Error('Apex EOD 50K plan not found');
    return found;
}

function declaredLadder(sizing: PolicySizing): DayPolicy {
    return {
        ladder: [250, 250],
        maxLossesPerDay: null,
        sizing,
        stopRule: { kind: DayStopRuleKind.None },
    };
}

function simulateRefusal(overrides: Partial<SimInputs>): string {
    try {
        simulate({
            fundedHorizonDays: 5,
            instrument: InstrumentSymbol.MNQ,
            maxEvalDays: 5,
            plan: apexEod50k(),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            stopPoints: 10,
            tradesPerDay: 1,
            trials: 2,
            winrate: 0.5,
            ...overrides,
        });
    } catch (error) {
        if (error instanceof Error) return error.message;
    }
    throw new Error('simulate did not refuse the declared sizing');
}

function timeline(overrides: Partial<AccountTimelineInputs>) {
    return () =>
        runAccountTimeline({
            dayBudget: 20,
            instrument: InstrumentSymbol.MNQ,
            maxEvalDays: 10,
            plan: apexEod50k(),
            riskPerTrade: 250,
            rng: mulberry32(3),
            rrRatio: 2,
            stopPoints: 10,
            tradesPerDay: 1,
            winrate: 0.5,
            ...overrides,
        });
}

describe('the portfolio timeline runs the declared-sizing check simulate runs (WP39d)', () => {
    it('refuses a declared funded ContractCapped policy under position sizing with the text simulate refuses it with', () => {
        const fundedDayPolicy = declaredLadder(PolicySizing.ContractCapped);
        expect(timeline({ fundedDayPolicy })).toThrow(
            simulateRefusal({ fundedDayPolicy }),
        );
    });

    it('refuses a declared eval WholeContracts policy under position sizing with the text simulate refuses it with', () => {
        const evalDayPolicy = declaredLadder(PolicySizing.WholeContracts);
        expect(timeline({ evalDayPolicy })).toThrow(
            simulateRefusal({ evalDayPolicy }),
        );
    });

    it('runs declared policies whose sizing matches their phase', () => {
        expect(
            timeline({
                evalDayPolicy: declaredLadder(PolicySizing.ContractCapped),
                fundedDayPolicy: declaredLadder(PolicySizing.WholeContracts),
            }),
        ).not.toThrow();
    });

    it('runs a declared funded ContractCapped policy without position sizing, where sizing places nothing', () => {
        expect(
            timeline({
                fundedDayPolicy: declaredLadder(PolicySizing.ContractCapped),
                instrument: undefined,
                stopPoints: undefined,
            }),
        ).not.toThrow();
    });
});
