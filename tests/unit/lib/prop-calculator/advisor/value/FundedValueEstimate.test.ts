import { describe, expect, it } from 'vitest';

import { buildEnginePolicy, DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { type DocumentedPolicySpec, type EnginePolicy } from '~/lib/prop-calculator/advisor/policy';
import {
    FUNDED_VALUE_SAMPLE_RANGE_LABEL,
    fundedValueEstimate,
} from '~/lib/prop-calculator/advisor/value/FundedValueEstimate';
import { FirmId, MffuVariant, type Plan } from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function policyFor(plan: Plan): EnginePolicy {
    return buildEnginePolicy({
        fundedHorizonDays: 90,
        plan,
        rulebook: DEFAULT_RULEBOOK,
    }).policy;
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function specFor(plan: Plan, trials = 40): DocumentedPolicySpec {
    return {
        enginePolicy: policyFor(plan),
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 40, seed: 5, trials },
    };
}

describe('fundedValueEstimate (F-V17, PT-65b step 6)', () => {
    it('gives the mean payouts per funded account with an SE, at the full trial count', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan, 40);

        const result = fundedValueEstimate(plan, spec, null);

        expect(result.trials).toBe(40);
        expect(result.payoutCountDistribution.length).toBeGreaterThan(0);
        const totalProbability = result.payoutCountDistribution.reduce(
            (sum, probability) => sum + probability,
            0,
        );
        expect(totalProbability).toBeCloseTo(1);
        expect(result.meanPayoutsPerAccount.value).toBeGreaterThanOrEqual(0);
        expect(result.meanPayoutsPerAccount.standardError).not.toBeNull();
    });

    it('gives P(0 payouts) as the distribution first bin', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan, 40);

        const result = fundedValueEstimate(plan, spec, null);

        expect(result.probabilityZeroPayouts.value).toBeCloseTo(
            result.payoutCountDistribution[0] ?? 0,
        );
        expect(result.probabilityZeroPayouts.standardError).toBeGreaterThan(0);
    });

    it('gates P(0 payouts) SE to null when too few trials reach a funded outcome to trust it', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan, 1);

        const result = fundedValueEstimate(plan, spec, null);

        expect(result.probabilityZeroPayouts.standardError).toBeNull();
    });

    it('gives no sample range when no sample size is given', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);

        expect(fundedValueEstimate(plan, spec, null).sampleRange).toBeNull();
    });

    it('gives a labelled 95% sample range widening as n shrinks', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan, 200);

        const large = fundedValueEstimate(plan, spec, 500);
        const small = fundedValueEstimate(plan, spec, 5);
        if (large.sampleRange === null || small.sampleRange === null) {
            throw new Error('expected sample ranges');
        }

        expect(large.sampleRange.label).toBe(FUNDED_VALUE_SAMPLE_RANGE_LABEL);
        const largeWidth = large.sampleRange.upper - large.sampleRange.lower;
        const smallWidth = small.sampleRange.upper - small.sampleRange.lower;
        expect(smallWidth).toBeGreaterThan(largeWidth);
    });

    it('rejects a non-positive or non-integer sample size', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);

        expect(() => fundedValueEstimate(plan, spec, 0)).toThrow(RangeError);
        expect(() => fundedValueEstimate(plan, spec, -1)).toThrow(RangeError);
        expect(() => fundedValueEstimate(plan, spec, 1.5)).toThrow(RangeError);
    });

    it('is deterministic per seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);

        expect(fundedValueEstimate(plan, spec, 10)).toStrictEqual(
            fundedValueEstimate(plan, spec, 10),
        );
    });
});
