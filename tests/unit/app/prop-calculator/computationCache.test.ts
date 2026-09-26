import { describe, expect, it } from 'vitest';

import {
    ComputationCache,
    DEFAULT_COMPUTATION_CACHE_CAPACITY,
    initialFor,
} from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { type ScenarioRow } from '~/app/(app)/prop-calculator/_components/RuleStressTestPanel';
import { type Cell } from '~/app/(app)/prop-calculator/_components/SensitivityHeatmap';
import { simInputsCacheKey } from '~/app/(app)/prop-calculator/_components/simInputsCacheKey';
import {
    ApexVariant,
    FirmId,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

function inputs(): SimInputs {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return {
        fundedHorizonDays: 20,
        maxEvalDays: 20,
        plan,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 1,
        trials: 100,
        winrate: 0.4,
    };
}

const base: SimOutputs = simulate(inputs());
const stressRows: ScenarioRow[] = [
    { isNoOp: true, label: 'Baseline', out: base },
];
const cell: Cell = {
    evalPass: 0.5,
    fundedSurvival: 0.4,
    monthlyNet: 120,
    rr: 2,
    winrate: 0.4,
};
const cells: Cell[] = [cell];

describe('ComputationCache', () => {
    it('returns undefined on a miss', () => {
        const cache = new ComputationCache();
        expect(cache.get(ComputationId.OptimalRisk, 'k')).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it('returns what was set for the same id and key', () => {
        const cache = new ComputationCache();
        cache.set(ComputationId.Sensitivity, 'k', cells);
        expect(cache.get(ComputationId.Sensitivity, 'k')).toBe(cells);
        expect(cache.get(ComputationId.Sensitivity, 'other')).toBeUndefined();
    });

    it('keeps two ids that share one key string apart', () => {
        const cache = new ComputationCache();
        const key = simInputsCacheKey(inputs());
        cache.set(ComputationId.RuleStress, key, stressRows);
        cache.set(ComputationId.BaseSimulation, key, base);
        expect(cache.get(ComputationId.RuleStress, key)).toBe(stressRows);
        expect(cache.get(ComputationId.BaseSimulation, key)).toBe(base);
        expect(cache.get(ComputationId.OptimalRisk, key)).toBeUndefined();
        expect(cache.size).toBe(2);
    });

    it('keeps keys containing quotes, separators and unicode apart', () => {
        const cache = new ComputationCache();
        const tricky = ['a","b', 'a', '"b', 'a\u{0}b', '日本🙂', ''];
        for (const [index, key] of tricky.entries()) {
            cache.set(ComputationId.Sensitivity, key, [
                { ...cell, monthlyNet: index },
            ]);
        }
        for (const [index, key] of tricky.entries()) {
            expect(
                cache.get(ComputationId.Sensitivity, key)?.[0]?.monthlyNet,
            ).toBe(index);
        }
    });

    it('stores a null result as a hit, distinct from a miss', () => {
        const cache = new ComputationCache();
        cache.set(ComputationId.CashFlow, 'k', null);
        expect(cache.get(ComputationId.CashFlow, 'k')).toBeNull();
        expect(initialFor(ComputationId.CashFlow, 'k', cache)).toEqual({
            pending: false,
            result: null,
            shouldCompute: false,
        });
    });

    it('overwrites an existing entry without growing', () => {
        const cache = new ComputationCache();
        cache.set(ComputationId.Sensitivity, 'k', []);
        cache.set(ComputationId.Sensitivity, 'k', cells);
        expect(cache.get(ComputationId.Sensitivity, 'k')).toBe(cells);
        expect(cache.size).toBe(1);
    });

    it('is bounded and evicts the least recently used entry', () => {
        const cache = new ComputationCache(3);
        cache.set(ComputationId.Sensitivity, 'a', cells);
        cache.set(ComputationId.Sensitivity, 'b', cells);
        cache.set(ComputationId.Sensitivity, 'c', cells);
        expect(cache.get(ComputationId.Sensitivity, 'a')).toBe(cells);
        cache.set(ComputationId.Sensitivity, 'd', cells);
        expect(cache.size).toBe(3);
        expect(cache.get(ComputationId.Sensitivity, 'b')).toBeUndefined();
        expect(cache.get(ComputationId.Sensitivity, 'a')).toBe(cells);
        expect(cache.get(ComputationId.Sensitivity, 'c')).toBe(cells);
        expect(cache.get(ComputationId.Sensitivity, 'd')).toBe(cells);
    });

    it('treats a re-set as a use for eviction', () => {
        const cache = new ComputationCache(2);
        cache.set(ComputationId.Sensitivity, 'a', cells);
        cache.set(ComputationId.Sensitivity, 'b', cells);
        cache.set(ComputationId.Sensitivity, 'a', []);
        cache.set(ComputationId.Sensitivity, 'c', cells);
        expect(cache.get(ComputationId.Sensitivity, 'b')).toBeUndefined();
        expect(cache.get(ComputationId.Sensitivity, 'a')).toEqual([]);
    });

    it('stays within the default capacity under many writes', () => {
        const cache = new ComputationCache();
        for (let index = 0; index < 10_000; index++) {
            cache.set(ComputationId.Sensitivity, `k${index}`, cells);
        }
        expect(cache.size).toBe(DEFAULT_COMPUTATION_CACHE_CAPACITY);
        expect(cache.get(ComputationId.Sensitivity, 'k9999')).toBe(cells);
        expect(cache.get(ComputationId.Sensitivity, 'k0')).toBeUndefined();
    });

    it('rejects a capacity below one', () => {
        expect(() => new ComputationCache(0)).toThrow();
        expect(() => new ComputationCache(1.5)).toThrow();
    });
});

describe('initialFor', () => {
    it.each([
        ['hit', true],
        ['miss', false],
    ])('%s', (_name, isHit) => {
        const cache = new ComputationCache();
        if (isHit) cache.set(ComputationId.RuleStress, 'k', stressRows);
        const initial = initialFor(ComputationId.RuleStress, 'k', cache);
        expect(initial).toEqual(
            isHit
                ? { pending: false, result: stressRows, shouldCompute: false }
                : { pending: true, result: null, shouldCompute: true },
        );
    });

    it('does not borrow another id result for the same key', () => {
        const cache = new ComputationCache();
        cache.set(ComputationId.BaseSimulation, 'k', base);
        expect(initialFor(ComputationId.RuleStress, 'k', cache)).toEqual({
            pending: true,
            result: null,
            shouldCompute: true,
        });
    });
});
