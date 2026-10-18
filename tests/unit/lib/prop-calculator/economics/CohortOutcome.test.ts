import { describe, expect, expectTypeOf, it } from 'vitest';

import { type Fraction0to1 } from '~/lib/prop-calculator/core';
import {
    cohortOutcome,
    type CohortOutcome,
    EconomicsReason,
    MAX_COHORT_SAMPLES,
} from '~/lib/prop-calculator/economics';
import { binomialStandardError, percentile } from '~/lib/prop-calculator/stats';

const perAttemptNets = [900, -100, -100, -100, -100, 1400, -250, -250];

describe('cohortOutcome', () => {
    it('is deterministic per seed', () => {
        const first = cohortOutcome(perAttemptNets, 20, 2000, 5);
        const second = cohortOutcome(perAttemptNets, 20, 2000, 5);
        expect(second).toEqual(first);
    });

    it('changes with the seed', () => {
        const first = cohortOutcome(perAttemptNets, 20, 2000, 5).value;
        const other = cohortOutcome(perAttemptNets, 20, 2000, 6).value;
        expect(other?.meanNet).not.toBe(first?.meanNet);
    });

    it('centres the batch mean on N x the per-attempt mean', () => {
        const perAttemptMean =
            perAttemptNets.reduce((sum, value) => sum + value, 0) /
            perAttemptNets.length;
        const cohort = cohortOutcome(perAttemptNets, 20, 20_000, 3).value;
        expect(cohort?.meanNet ?? 0).toBeGreaterThan(20 * perAttemptMean - 60);
        expect(cohort?.meanNet ?? 0).toBeLessThan(20 * perAttemptMean + 60);
    });

    it('reports P(net < 0) with its binomial SE and P10 below P90', () => {
        const cohort = cohortOutcome(perAttemptNets, 10, 4000, 9).value;
        if (!cohort) throw new Error('cohort outcome missing');
        const p = cohort.lossProbability.value;
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
        expect(cohort.lossProbability.standardError).toBeCloseTo(
            binomialStandardError(p, 4000),
            12,
        );
        expect(cohort.netP10).toBeLessThan(cohort.netP90);
        expect(cohort.attempts).toBe(10);
        expect(cohort.draws).toBe(4000);
    });

    it('gives P 0 when every net is positive and P 1 when every net is negative', () => {
        const winners = cohortOutcome([100, 100, 100], 5, 100, 1).value;
        expect(winners?.lossProbability).toEqual({
            standardError: 0,
            value: 0,
        });
        expect(winners?.netP10).toBe(500);
        expect(winners?.netP90).toBe(500);
        const losers = cohortOutcome([-50, -50], 5, 100, 1).value;
        expect(losers?.lossProbability).toEqual({
            standardError: 0,
            value: 1,
        });
    });

    it('counts a batch that nets exactly zero as not a loss', () => {
        expect(
            cohortOutcome([0, 0], 3, 50, 1).value?.lossProbability.value,
        ).toBe(0);
    });

    it('judges a loss in whole cents, so float noise on a zero batch is not a loss', () => {
        const cohort = cohortOutcome([0.1, -0.7], 8, 40_000, 21).value;
        if (!cohort) throw new Error('cohort outcome missing');
        const exact = 1 - 9 / 256;
        expect(
            Math.abs(cohort.lossProbability.value - exact),
        ).toBeLessThanOrEqual(3 * (cohort.lossProbability.standardError ?? 0));
    });

    it('reads its quantiles through stats.percentile', () => {
        const cohort = cohortOutcome([10, -10], 1, 1000, 2).value;
        expect(cohort?.netP10).toBe(percentile([-10, 10], 0));
        expect(cohort?.netP90).toBe(percentile([-10, 10], 100));
    });

    it('prices expected payouts and fees when per-sample fees are given', () => {
        const nets = [900, -100];
        const fees = [100, 100];
        const cohort = cohortOutcome(nets, 10, 20_000, 4, fees).value;
        expect(cohort?.expectedFees).toBeCloseTo(1000, 9);
        expect(cohort?.expectedPayouts).toBeCloseTo(5000, 9);
    });

    it('leaves expected payouts and fees null without fee samples', () => {
        const cohort = cohortOutcome([900, -100], 10, 100, 4).value;
        expect(cohort?.expectedFees).toBeNull();
        expect(cohort?.expectedPayouts).toBeNull();
    });

    it('brands the loss probability as a fraction', () => {
        expectTypeOf<
            CohortOutcome['lossProbability']['value']
        >().toEqualTypeOf<Fraction0to1>();
    });

    it('refuses more than MAX_COHORT_SAMPLES draws x attempts in one call, so a caller cannot freeze the page', () => {
        const attempts = 1000;
        const draws = MAX_COHORT_SAMPLES / attempts + 1;
        expect(cohortOutcome([1, -1], attempts, draws, 1).reason).toBe(
            EconomicsReason.InvalidInput,
        );
        expect(
            cohortOutcome([1, -1], attempts, draws - 1, 1).reason,
        ).toBeNull();
    });

    it.each([
        { attempts: 10, draws: 100, fees: undefined, nets: [] },
        { attempts: 0, draws: 100, fees: undefined, nets: [1] },
        { attempts: 1.5, draws: 100, fees: undefined, nets: [1] },
        { attempts: 10, draws: 0, fees: undefined, nets: [1] },
        { attempts: 10, draws: 100, fees: undefined, nets: [NaN] },
        { attempts: 10, draws: 100, fees: [1, 2], nets: [1] },
    ])('refuses %o', ({ attempts, draws, fees, nets }) => {
        expect(cohortOutcome(nets, attempts, draws, 1, fees).reason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});
