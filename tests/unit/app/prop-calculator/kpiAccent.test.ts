import { describe, expect, it } from 'vitest';

import {
    KPI_ACCENT_STAT_TONE,
    KpiAccent,
    probabilityAccent,
    roiAccent,
    signAccent,
} from '~/app/(app)/prop-calculator/_components/kpiAccent';
import { StatTone } from '~/components/StatStrip';
import { RoiBasis } from '~/lib/prop-calculator';

describe('probabilityAccent (eval pass and funded survive KPIs)', () => {
    it.each([
        { expected: KpiAccent.Positive, probability: 0.6 },
        { expected: KpiAccent.Positive, probability: 1 },
        { expected: KpiAccent.Neutral, probability: 0.59 },
        { expected: KpiAccent.Neutral, probability: 0.3 },
        { expected: KpiAccent.Negative, probability: 0.29 },
        { expected: KpiAccent.Negative, probability: 0 },
    ])('$probability is $expected', ({ expected, probability }) => {
        expect(probabilityAccent(probability)).toBe(expected);
    });
});

describe('signAccent (monthly net KPI)', () => {
    it.each([
        { expected: KpiAccent.Neutral, value: null },
        { expected: KpiAccent.Neutral, value: 0 },
        { expected: KpiAccent.Positive, value: 0.01 },
        { expected: KpiAccent.Negative, value: -0.01 },
    ])('$value is $expected', ({ expected, value }) => {
        expect(signAccent(value)).toBe(expected);
    });
});

describe('roiAccent (ROI on cost in the results and cash-flow panels)', () => {
    it.each([
        { expected: KpiAccent.Neutral, value: null },
        { expected: KpiAccent.Neutral, value: 0 },
        { expected: KpiAccent.Positive, value: 0.01 },
        { expected: KpiAccent.Negative, value: -0.01 },
    ])('$value is $expected', ({ expected, value }) => {
        expect(roiAccent({ basis: RoiBasis.TotalOnCost, value })).toBe(
            expected,
        );
    });
});

describe('KpiAccent', () => {
    it('is a fixed enum of the three accent identifiers', () => {
        expect(Object.values(KpiAccent)).toEqual([
            'negative',
            'neutral',
            'positive',
        ]);
    });
});

describe('KPI_ACCENT_STAT_TONE', () => {
    it('renders a neutral accent in the default ink tone, not green', () => {
        expect(KPI_ACCENT_STAT_TONE).toEqual({
            [KpiAccent.Negative]: StatTone.Negative,
            [KpiAccent.Neutral]: StatTone.Default,
            [KpiAccent.Positive]: StatTone.Positive,
        });
    });
});
