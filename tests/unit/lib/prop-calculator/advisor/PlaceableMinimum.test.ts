import { describe, expect, it } from 'vitest';

import {
    InstrumentSymbol,
    ONE_CENT,
    PolicySizing,
} from '~/lib/prop-calculator';
import {
    floorToPlaceableUnit,
    placeableMinimumFor,
} from '~/lib/prop-calculator/advisor';

describe('placeableMinimumFor', () => {
    it('is one cent without a position sizing', () => {
        expect(placeableMinimumFor(PolicySizing.WholeContracts, null)).toBe(
            ONE_CENT,
        );
        expect(
            placeableMinimumFor(PolicySizing.WholeContracts, undefined),
        ).toBe(ONE_CENT);
        expect(placeableMinimumFor(PolicySizing.WholeContracts, {})).toBe(
            ONE_CENT,
        );
    });

    it('is the risk of one contract at the entered stop for whole-contract sizing', () => {
        expect(
            placeableMinimumFor(PolicySizing.WholeContracts, {
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 20,
            }),
        ).toBe(40);
        expect(
            placeableMinimumFor(PolicySizing.WholeContracts, {
                instrument: InstrumentSymbol.NQ,
                stopPoints: 20,
            }),
        ).toBe(400);
    });

    it('stays one cent when the sizing does not place whole contracts', () => {
        expect(
            placeableMinimumFor(PolicySizing.ContractCapped, {
                instrument: InstrumentSymbol.NQ,
                stopPoints: 20,
            }),
        ).toBe(ONE_CENT);
    });

    it('falls back to one cent for a stop that does not resolve to a position', () => {
        expect(
            placeableMinimumFor(PolicySizing.WholeContracts, {
                instrument: InstrumentSymbol.MNQ,
                stopPoints: 0,
            }),
        ).toBe(ONE_CENT);
    });
});

describe('floorToPlaceableUnit', () => {
    it('rounds down to whole units, never up', () => {
        expect(floorToPlaceableUnit(100, 40)).toBe(80);
        expect(floorToPlaceableUnit(119.99, 40)).toBe(80);
        expect(floorToPlaceableUnit(39.99, 40)).toBe(0);
    });

    it('keeps an exact multiple through floating-point noise', () => {
        expect(floorToPlaceableUnit(0.3, 0.1)).toBe(0.3);
        expect(floorToPlaceableUnit(120, 40)).toBe(120);
    });
});
