import { describe, expect, it } from 'vitest';

import {
    type ScaleGateInputs,
    scaleGateOf,
    ScaleGateStatus,
    ScaleGateUnmetCondition,
} from '~/lib/prop-accounts/bankroll';
import { usdCents } from '~/lib/prop-accounts/core';
import { type SampleThresholds } from '~/lib/prop-calculator/advisor';

const NO_THRESHOLDS: SampleThresholds = {
    minClosedRounds: null,
    minEvalAttempts: null,
    minFundedAccounts: null,
    minTrades: null,
};

const THRESHOLDS: SampleThresholds = {
    minClosedRounds: null,
    minEvalAttempts: 5,
    minFundedAccounts: 2,
    minTrades: 30,
};

const BASE: ScaleGateInputs = {
    cohortMultiple: { interval: { lower: 1, upper: 3 }, n: 10, value: 2 },
    evalAttempts: 10,
    fundedAccounts: 5,
    pooledNetPerSlot: {
        standardError: usdCents(500),
        value: usdCents(5000),
    },
    thresholds: THRESHOLDS,
    trades: 100,
};

describe('scaleGateOf', () => {
    it('is ThresholdsNotSet when any sample threshold is null', () => {
        const result = scaleGateOf({ ...BASE, thresholds: NO_THRESHOLDS });
        expect(result).toEqual({
            status: ScaleGateStatus.ThresholdsNotSet,
            unmetConditions: [],
        });
    });

    it('is NotEnoughSample when a sample count is below its threshold', () => {
        const result = scaleGateOf({ ...BASE, evalAttempts: 3 });
        expect(result.status).toBe(ScaleGateStatus.NotEnoughSample);
        expect(result.unmetConditions).toEqual([
            ScaleGateUnmetCondition.EvalAttemptsBelowThreshold,
        ]);
    });

    it('is NotPositiveAfterCost when the pooled net is not beyond noise or the cohort multiple is not above 1', () => {
        const noNet = scaleGateOf({ ...BASE, pooledNetPerSlot: null });
        expect(noNet.status).toBe(ScaleGateStatus.NotPositiveAfterCost);
        expect(noNet.unmetConditions).toContain(
            ScaleGateUnmetCondition.PooledNetNotBeyondNoise,
        );

        const belowOne = scaleGateOf({
            ...BASE,
            cohortMultiple: { interval: { lower: 0, upper: 1 }, n: 10, value: 0.8 },
        });
        expect(belowOne.status).toBe(ScaleGateStatus.NotPositiveAfterCost);
        expect(belowOne.unmetConditions).toEqual([
            ScaleGateUnmetCondition.CohortMultipleNotAboveOne,
        ]);
    });

    it('is Ready when every condition passes', () => {
        expect(scaleGateOf(BASE)).toEqual({
            status: ScaleGateStatus.Ready,
            unmetConditions: [],
        });
    });

    it('never lets a first payout alone pass, even with trivial thresholds', () => {
        const trivialThresholds: SampleThresholds = {
            minClosedRounds: null,
            minEvalAttempts: 1,
            minFundedAccounts: 1,
            minTrades: 1,
        };
        const result = scaleGateOf({
            cohortMultiple: { interval: { lower: 2, upper: 2 }, n: 1, value: 2 },
            evalAttempts: 1,
            fundedAccounts: 1,
            pooledNetPerSlot: { standardError: null, value: usdCents(5000) },
            thresholds: trivialThresholds,
            trades: 1,
        });
        expect(result.status).not.toBe(ScaleGateStatus.Ready);
        expect(result.unmetConditions).toContain(
            ScaleGateUnmetCondition.PooledNetNotBeyondNoise,
        );
    });

    it('never lets a single ended account drive the cohort multiple to Ready, even with a beyond-noise pooled net', () => {
        const result = scaleGateOf({
            ...BASE,
            cohortMultiple: { interval: { lower: 0.1, upper: 10 }, n: 1, value: 2 },
        });
        expect(result.status).not.toBe(ScaleGateStatus.Ready);
        expect(result.unmetConditions).toContain(
            ScaleGateUnmetCondition.CohortSampleBelowThreshold,
        );
    });
});
