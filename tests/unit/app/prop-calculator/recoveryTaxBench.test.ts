import { describe, expect, it } from 'vitest';

import {
    recoveryTaxBench,
    RecoveryTaxBench,
} from '~/app/(app)/prop-calculator/_components/recoveryTaxBench';

describe('recoveryTaxBench grades the gain required on the thresholds the removed colours used', () => {
    it.each([
        { bench: RecoveryTaxBench.Light, gainRequired: 0 },
        { bench: RecoveryTaxBench.Light, gainRequired: 0.119999 },
        { bench: RecoveryTaxBench.Moderate, gainRequired: 0.12 },
        { bench: RecoveryTaxBench.Moderate, gainRequired: 0.249999 },
        { bench: RecoveryTaxBench.Heavy, gainRequired: 0.25 },
        { bench: RecoveryTaxBench.Heavy, gainRequired: 33 / 67 },
    ])('reads $gainRequired as $bench', ({ bench, gainRequired }) => {
        expect(recoveryTaxBench(gainRequired)).toBe(bench);
    });

    it('names each grade in one plain word', () => {
        expect(Object.values(RecoveryTaxBench)).toStrictEqual([
            'heavy',
            'light',
            'moderate',
        ]);
    });
});
