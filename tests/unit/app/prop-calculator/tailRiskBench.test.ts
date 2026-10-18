import { describe, expect, it } from 'vitest';

import {
    gainChanceBench,
    GainChanceBench,
    lossChanceBench,
    LossChanceBench,
} from '~/app/(app)/prop-calculator/_components/tailRiskBench';

describe('lossChanceBench grades P(loss) on the thresholds the removed colours used', () => {
    it.each([
        { bench: LossChanceBench.Low, probability: 0 },
        { bench: LossChanceBench.Low, probability: 0.1 },
        { bench: LossChanceBench.Moderate, probability: 0.100001 },
        { bench: LossChanceBench.Moderate, probability: 0.25 },
        { bench: LossChanceBench.High, probability: 0.250001 },
        { bench: LossChanceBench.High, probability: 1 },
    ])('reads $probability as $bench', ({ bench, probability }) => {
        expect(lossChanceBench(probability)).toBe(bench);
    });

    it('names each grade in one plain word', () => {
        expect(Object.values(LossChanceBench)).toStrictEqual([
            'high',
            'low',
            'moderate',
        ]);
    });
});

describe('gainChanceBench grades P(gain) on the thresholds the removed colours used', () => {
    it.each([
        { bench: GainChanceBench.Slim, probability: 0 },
        { bench: GainChanceBench.Slim, probability: 0.25 },
        { bench: GainChanceBench.Fair, probability: 0.250001 },
        { bench: GainChanceBench.Fair, probability: 0.5 },
        { bench: GainChanceBench.Strong, probability: 0.500001 },
        { bench: GainChanceBench.Strong, probability: 1 },
    ])('reads $probability as $bench', ({ bench, probability }) => {
        expect(gainChanceBench(probability)).toBe(bench);
    });

    it('names each grade in one plain word', () => {
        expect(Object.values(GainChanceBench)).toStrictEqual([
            'fair',
            'slim',
            'strong',
        ]);
    });
});
