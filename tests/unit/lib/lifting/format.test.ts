import { describe, expect, it } from 'vitest';

import {
    IncompatibleMeasurementUnitsError,
    MeasurementUnitConversion,
} from '~/lib/lifting/format';

describe('MeasurementUnitConversion', () => {
    it('converts a weight logged in pounds into kilograms', () => {
        expect(
            MeasurementUnitConversion.toDisplay(176.37, 'lb', 'kg'),
        ).toBeCloseTo(80, 2);
    });

    it('converts a length logged in inches into centimetres', () => {
        expect(MeasurementUnitConversion.toDisplay(10, 'in', 'cm')).toBeCloseTo(
            25.4,
            6,
        );
    });

    it('keeps a value already in the display unit', () => {
        expect(MeasurementUnitConversion.toDisplay(18, '%', '%')).toBe(18);
    });

    it('refuses to show a weight as a length', () => {
        expect(MeasurementUnitConversion.canDisplay('kg', 'cm')).toBe(false);
        expect(() =>
            MeasurementUnitConversion.toDisplay(80, 'kg', 'cm'),
        ).toThrow(IncompatibleMeasurementUnitsError);
    });
});
