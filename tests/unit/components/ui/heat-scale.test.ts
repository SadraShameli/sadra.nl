import { describe, expect, it } from 'vitest';

import { HEAT_STEP_CLASSES, HeatScale } from '~/components/ui/heat-scale';

const LAST_STEP = HEAT_STEP_CLASSES.length - 1;

function camelStrengths(pattern: RegExp): number[] {
    return HEAT_STEP_CLASSES.map((className) => {
        const match = pattern.exec(className);
        if (match?.[1] === undefined) {
            throw new Error(`no camel strength in ${className}`);
        }
        return Number(match[1]);
    });
}

describe('HeatScale: the sizing heatmap tile strength', () => {
    it('never lowers the tile strength as the value rises across a grid that spans a loss and a profit', () => {
        const scale = HeatScale.spanning([-480, 120, 1250, -35, 900]);
        let previous = 0;
        for (let value = -480; value <= 1250; value += 5) {
            const step = scale.step(value);
            expect(step).toBeGreaterThanOrEqual(previous);
            previous = step;
        }
        expect(scale.step(-480)).toBe(0);
        expect(scale.step(1250)).toBe(LAST_STEP);
    });

    it('climbs one step per equal slice of the range, so each higher slice is strictly stronger', () => {
        const scale = HeatScale.spanning([0, 800]);
        const sliceStarts = HEAT_STEP_CLASSES.map(
            (_, index) => (800 * index) / HEAT_STEP_CLASSES.length + 1,
        );
        expect(sliceStarts.map((value) => scale.step(value))).toEqual(
            HEAT_STEP_CLASSES.map((_, index) => index),
        );
    });

    it('places probabilities on a fixed 0% to 100% scale, so a 10% pass rate is near the card and 90% near camel', () => {
        expect(HeatScale.PROBABILITY.low).toBe(0);
        expect(HeatScale.PROBABILITY.high).toBe(1);
        expect(HeatScale.PROBABILITY.step(0)).toBe(0);
        expect(HeatScale.PROBABILITY.step(0.1)).toBe(0);
        expect(HeatScale.PROBABILITY.step(0.9)).toBe(LAST_STEP);
        expect(HeatScale.PROBABILITY.step(1)).toBe(LAST_STEP);
        expect(HeatScale.PROBABILITY.step(0.13)).toBeLessThan(
            HeatScale.PROBABILITY.step(0.45),
        );
        expect(HeatScale.PROBABILITY.step(0.45)).toBeLessThan(
            HeatScale.PROBABILITY.step(0.58),
        );
    });

    it('keeps every tile on the lowest step when the whole grid holds one value', () => {
        const scale = HeatScale.spanning([250, 250, 250]);
        expect(scale.step(250)).toBe(0);
        expect(HeatScale.spanning([]).step(0)).toBe(0);
    });

    it('mixes more camel into each step than the one below it, in Day and in Night', () => {
        const day = camelStrengths(
            /(?:^|\s)bg-\[color-mix\(in_oklab,var\(--camel\)_(\d+)%,var\(--card\)\)\]/,
        );
        const night = camelStrengths(
            /dark:bg-\[color-mix\(in_oklab,var\(--camel\)_(\d+)%,var\(--card\)\)\]/,
        );
        for (const strengths of [day, night]) {
            for (let index = 1; index < strengths.length; index++) {
                expect(strengths[index]).toBeGreaterThan(
                    strengths[index - 1] ?? Infinity,
                );
            }
        }
    });

    it('draws the tiles in camel only, never a status colour', () => {
        for (const className of HEAT_STEP_CLASSES) {
            expect(className).not.toMatch(/success|warning|destructive|danger/);
        }
    });

    it('gives each tile the class of its step', () => {
        const scale = HeatScale.spanning([0, 100]);
        expect(scale.tileClassName(0)).toBe(HEAT_STEP_CLASSES[0]);
        expect(scale.tileClassName(100)).toBe(HEAT_STEP_CLASSES[LAST_STEP]);
    });
});
