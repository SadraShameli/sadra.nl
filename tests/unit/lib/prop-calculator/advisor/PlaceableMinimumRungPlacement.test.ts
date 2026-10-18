import { describe, expect, it } from 'vitest';

import { InstrumentSymbol } from '~/lib/prop-calculator';
import {
    RungPlacement,
    rungPlacementOf,
} from '~/lib/prop-calculator/advisor/PlaceableMinimum';

const NQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 20,
} as const;

describe('rungPlacementOf (PT-36h, F-154)', () => {
    it('flags a rung below the risk of one contract at the entered stop', () => {
        expect(rungPlacementOf(399.99, NQ_AT_20_POINTS)).toBe(
            RungPlacement.BelowOneContract,
        );
        expect(rungPlacementOf(150, NQ_AT_20_POINTS)).toBe(
            RungPlacement.BelowOneContract,
        );
    });

    it('places a rung that fits at least one whole contract', () => {
        expect(rungPlacementOf(400, NQ_AT_20_POINTS)).toBe(
            RungPlacement.Placeable,
        );
        expect(rungPlacementOf(1000, NQ_AT_20_POINTS)).toBe(
            RungPlacement.Placeable,
        );
    });

    it('says it was not checked without a resolvable position sizing', () => {
        expect(rungPlacementOf(150, null)).toBe(RungPlacement.NotChecked);
        expect(rungPlacementOf(150, undefined)).toBe(RungPlacement.NotChecked);
        expect(rungPlacementOf(150, {})).toBe(RungPlacement.NotChecked);
        expect(
            rungPlacementOf(150, {
                instrument: InstrumentSymbol.NQ,
                stopPoints: 0,
            }),
        ).toBe(RungPlacement.NotChecked);
    });

    it('never flags a rung of no risk', () => {
        expect(rungPlacementOf(0, NQ_AT_20_POINTS)).toBe(
            RungPlacement.Placeable,
        );
    });
});
