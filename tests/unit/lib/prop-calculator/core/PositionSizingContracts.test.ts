import { describe, expect, it } from 'vitest';

import * as core from '~/lib/prop-calculator/core';
import { minStopPoints } from '~/lib/prop-calculator/core/ContractLimits';
import {
    INSTRUMENTS,
    InstrumentSymbol,
} from '~/lib/prop-calculator/core/Instruments';
import { contracts, points } from '~/lib/prop-calculator/core/lib/units';
import {
    contractsAtStop,
    MismatchSeverity,
    type PositionSizingConfig,
    siblingInstrumentRisk,
} from '~/lib/prop-calculator/core/PositionSizing';

const ES = INSTRUMENTS[InstrumentSymbol.ES];
const MNQ = INSTRUMENTS[InstrumentSymbol.MNQ];
const NQ = INSTRUMENTS[InstrumentSymbol.NQ];

function nqSizingAt(stopPoints: number): PositionSizingConfig {
    return { instrument: NQ, stopPoints: points(stopPoints) };
}

describe('contractsAtStop', () => {
    it('places whole contracts and reports the dollars left over', () => {
        const result = contractsAtStop(450, nqSizingAt(8), null);
        expect(result.contracts).toBe(2);
        expect(result.fittingContracts).toBe(2);
        expect(result.leftover).toBe(130);
        expect(result.placedRisk).toBe(320);
        expect(result.isCapped).toBe(false);
    });

    it('places exactly, within cent tolerance, with nothing left over', () => {
        const result = contractsAtStop(450, nqSizingAt(7.5), null);
        expect(result.contracts).toBe(3);
        expect(result.leftover).toBe(0);
        expect(result.placedRisk).toBe(450);
        expect(result.isCapped).toBe(false);
    });

    it('binds at the contract cap and flags it', () => {
        const result = contractsAtStop(450, nqSizingAt(5), contracts(3));
        expect(result.fittingContracts).toBe(4);
        expect(result.contracts).toBe(3);
        expect(result.isCapped).toBe(true);
        expect(result.placedRisk).toBe(300);
        expect(result.leftover).toBe(150);
    });

    it('gives 0 contracts and the whole risk left over below one contract', () => {
        const result = contractsAtStop(50, nqSizingAt(10), null);
        expect(result.contracts).toBe(0);
        expect(result.fittingContracts).toBe(0);
        expect(result.placedRisk).toBe(0);
        expect(result.leftover).toBe(50);
        expect(result.isCapped).toBe(false);
    });
});

describe('siblingInstrumentRisk', () => {
    it('gives no mismatch when the sibling risks less than what was planned', () => {
        const result = siblingInstrumentRisk({
            contracts: contracts(2),
            instrument: NQ,
            room: 1000,
            stopPoints: points(10),
        });
        expect(result.sibling?.symbol).toBe(MNQ.symbol);
        expect(result.siblingRisk).toBe(40);
        expect(result.severity).toBe(MismatchSeverity.None);
    });

    it('flags a mismatch that exceeds the planned risk but still fits the room', () => {
        const result = siblingInstrumentRisk({
            contracts: contracts(2),
            instrument: MNQ,
            room: 1000,
            stopPoints: points(10),
        });
        expect(result.sibling?.symbol).toBe(NQ.symbol);
        expect(result.siblingRisk).toBe(400);
        expect(result.severity).toBe(MismatchSeverity.ExceedsPlannedRisk);
    });

    it('flags a mismatch that exceeds the room, the more severe case', () => {
        const result = siblingInstrumentRisk({
            contracts: contracts(10),
            instrument: MNQ,
            room: 300,
            stopPoints: points(10),
        });
        expect(result.siblingRisk).toBe(2000);
        expect(result.severity).toBe(MismatchSeverity.ExceedsRoom);
    });

    it('has no sibling for ES until a modeled S&P 500 micro exists', () => {
        const result = siblingInstrumentRisk({
            contracts: contracts(1),
            instrument: ES,
            room: 1000,
            stopPoints: points(10),
        });
        expect(result.sibling).toBeNull();
        expect(result.siblingRisk).toBeNull();
        expect(result.severity).toBe(MismatchSeverity.None);
    });
});

describe('the minimum stop for a placed risk', () => {
    it('reuses minStopPoints instead of a new helper', () => {
        expect(minStopPoints(450, 2, NQ.pointValue)).toBe(11.25);
        expect(minStopPoints(450, 3, 20)).toBe(7.5);
    });

    it('exports no stopForExactRisk or exactStopPointsForRisk helper', () => {
        expect(
            'stopForExactRisk' in core || 'exactStopPointsForRisk' in core,
        ).toBe(false);
    });
});
