import { describe, expect, it } from 'vitest';

import {
    RecoveryTimeBench,
    recoveryTimeBench,
    UnderwaterBench,
    underwaterBench,
    VShapeBench,
    vShapeBench,
} from '~/app/(app)/prop-calculator/_components/drawdownBench';
import {
    TailRatioBench,
    tailRatioBench,
} from '~/app/(app)/prop-calculator/_components/tailRiskBench';

describe('the drawdown and tail grades in words', () => {
    it.each([
        [2.9, RecoveryTimeBench.Fast],
        [3, RecoveryTimeBench.Moderate],
        [9.9, RecoveryTimeBench.Moderate],
        [10, RecoveryTimeBench.Slow],
    ])('reads a %s-day average recovery as %s', (days, bench) => {
        expect(recoveryTimeBench(days)).toBe(bench);
    });

    it.each([
        [0.19, UnderwaterBench.Brief],
        [0.2, UnderwaterBench.Moderate],
        [0.39, UnderwaterBench.Moderate],
        [0.4, UnderwaterBench.Prolonged],
    ])('reads %s of days underwater as %s', (share, bench) => {
        expect(underwaterBench(share)).toBe(bench);
    });

    it.each([
        [0.61, VShapeBench.MostlyFast],
        [0.6, VShapeBench.Mixed],
        [0.31, VShapeBench.Mixed],
        [0.3, VShapeBench.MostlySlow],
    ])('reads %s V-shaped episodes as %s', (share, bench) => {
        expect(vShapeBench(share)).toBe(bench);
    });

    it.each([
        [1.51, TailRatioBench.Healthy],
        [1.5, TailRatioBench.Marginal],
        [1.01, TailRatioBench.Marginal],
        [1, TailRatioBench.DownsideHeavy],
    ])('reads a %s tail ratio as %s', (ratio, bench) => {
        expect(tailRatioBench(ratio)).toBe(bench);
    });
});
