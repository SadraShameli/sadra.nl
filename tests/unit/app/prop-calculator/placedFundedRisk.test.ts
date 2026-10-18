import { readFileSync } from 'node:fs';
import path from 'node:path';
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
import {
    placedFundedRisk as enginePlacedFundedRisk,
    INSTRUMENTS,
    InstrumentSymbol,
    SIM_INPUTS_REFUSAL_PREFIX,
} from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

const PLAN = defaultCalculatorState().plan;
const COMPONENTS_ROOT = path.join(
    process.cwd(),
    'src/app/(app)/prop-calculator/_components',
);

function componentSource(file: string): string {
    return readFileSync(path.join(COMPONENTS_ROOT, file), 'utf8');
}

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
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.NQ],
                stopPoints: 10,
            },
            risk: 200,
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

    it('places nothing for NQ at a 10 point stop and $150, where the engine refuses, rather than rounding up to one contract', () => {
        const inputs = {
            instrument: InstrumentSymbol.NQ,
            riskPerTrade: 150,
            stopPoints: 10,
        };
        expect(simInputsSizingIssue(inputs)).not.toBeNull();
        expect(placedFundedRisk({ ...inputs, plan: PLAN })).toEqual({
            contracts: 0,
            isCapped: false,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.NQ],
                stopPoints: 10,
            },
            risk: 0,
        });
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

describe('placedFundedRisk delegates to the engine (PT-11g)', () => {
    it.each([
        [InstrumentSymbol.NQ, 150, 10],
        [InstrumentSymbol.NQ, 199.99, 10],
        [InstrumentSymbol.NQ, 200, 10],
        [InstrumentSymbol.NQ, 450, 10],
        [InstrumentSymbol.NQ, 20_000, 10],
        [InstrumentSymbol.MNQ, 150, 10],
        [InstrumentSymbol.ES, 400, 7.5],
    ])(
        'places %s at $%s and a %s point stop exactly like the engine',
        (instrument, riskPerTrade, stopPoints) => {
            const inputs = { instrument, riskPerTrade, stopPoints };
            expect(placedFundedRisk({ ...inputs, plan: PLAN })).toEqual(
                enginePlacedFundedRisk(inputs, PLAN),
            );
        },
    );

    it('keeps no local copy of the whole-contract placement or the funded start limit', () => {
        const source = componentSource('placedFundedRisk.ts');
        expect(source).not.toMatch(
            /wholeContractRisk|contractLimitAt|beginFundedPhase|simInputsSizingIssue/,
        );
    });

    it('strips the engine refusal prefix through the shared constant, not a local literal', () => {
        expect(
            describeSimulationFailure(
                new Error(`${SIM_INPUTS_REFUSAL_PREFIX}groups must be 1`),
            ),
        ).toBe('groups must be 1');
        const source = componentSource('simulationFailure.ts');
        expect(source).toContain('SIM_INPUTS_REFUSAL_PREFIX');
        expect(source).not.toContain(`'${SIM_INPUTS_REFUSAL_PREFIX}'`);
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
