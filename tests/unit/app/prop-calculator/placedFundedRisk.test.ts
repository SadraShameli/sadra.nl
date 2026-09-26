import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    describePlacedFundedRisk,
    placedFundedRisk,
} from '~/app/(app)/prop-calculator/_components/placedFundedRisk';
import {
    describeSimulationFailure,
    partitionBySizing,
} from '~/app/(app)/prop-calculator/_components/simulationFailure';
import { InstrumentSymbol } from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

const PLAN = defaultCalculatorState().plan;

describe('placedFundedRisk (PT-11f)', () => {
    it('returns null without a stop, so the default inputs show no hint', () => {
        expect(
            placedFundedRisk({
                instrument: InstrumentSymbol.NQ,
                plan: PLAN,
                riskPerTrade: 250,
                stopPoints: undefined,
            }),
        ).toBeNull();
        expect(
            placedFundedRisk({
                instrument: undefined,
                plan: PLAN,
                riskPerTrade: 250,
                stopPoints: 10,
            }),
        ).toBeNull();
    });

    it('places exactly one contract when the risk equals one contract, and the engine accepts it', () => {
        const inputs = {
            instrument: InstrumentSymbol.NQ,
            riskPerTrade: 200,
            stopPoints: 10,
        };
        expect(simInputsSizingIssue(inputs)).toBeNull();
        expect(placedFundedRisk({ ...inputs, plan: PLAN })).toEqual({
            contracts: 1,
            isCapped: false,
            risk: 200,
            stopPoints: 10,
            symbol: InstrumentSymbol.NQ,
        });
    });

    it('places no contract a cent below one contract, where the engine refuses', () => {
        const inputs = {
            instrument: InstrumentSymbol.NQ,
            riskPerTrade: 199.99,
            stopPoints: 10,
        };
        expect(simInputsSizingIssue(inputs)).not.toBeNull();
        expect(placedFundedRisk({ ...inputs, plan: PLAN })?.contracts).toBe(0);
    });

    it('rounds micro risk down to whole contracts', () => {
        const placed = placedFundedRisk({
            instrument: InstrumentSymbol.MNQ,
            plan: PLAN,
            riskPerTrade: 150,
            stopPoints: 10,
        });
        expect(placed?.contracts).toBe(7);
        expect(placed?.risk).toBe(140);
        expect(placed === null ? '' : describePlacedFundedRisk(placed)).toBe(
            'Funded risk placed in whole contracts: 7 MNQ at a 10 point stop, $140 per trade.',
        );
    });
});

describe('simulation failure text (PT-11f)', () => {
    it('drops the engine input prefix and keeps any other message whole', () => {
        expect(
            describeSimulationFailure(new Error('Invalid SimInputs: too low')),
        ).toBe('too low');
        expect(describeSimulationFailure(new Error('groups must be 1'))).toBe(
            'groups must be 1',
        );
        expect(describeSimulationFailure('plain text')).toBe('plain text');
    });

    it('partitions items by the engine sizing check and keeps the refusal text', () => {
        const { accepted, refused } = partitionBySizing(
            [100, 200, 300],
            (risk) => ({
                instrument: InstrumentSymbol.NQ,
                riskPerTrade: risk,
                stopPoints: 10,
            }),
        );
        expect(accepted).toEqual([200, 300]);
        expect(refused.map((refusal) => refusal.item)).toEqual([100]);
        expect(refused[0]?.issue).toBe(
            simInputsSizingIssue({
                instrument: InstrumentSymbol.NQ,
                riskPerTrade: 100,
                stopPoints: 10,
            }),
        );
    });

    it('accepts everything for an empty list', () => {
        expect(partitionBySizing([], () => ({ riskPerTrade: 1 }))).toEqual({
            accepted: [],
            refused: [],
        });
    });
});
