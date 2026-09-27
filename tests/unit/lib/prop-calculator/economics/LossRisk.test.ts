import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    FirmId,
    fraction,
    RungSizing,
} from '~/lib/prop-calculator/core';
import {
    attemptsAffordable,
    batchLossClosedForm,
    cohortOutcome,
    EconomicsDisclosure,
    EconomicsReason,
    LossSampleUnit,
    MAX_LOSS_TARGET_CAP,
    minimumAttemptsForLossTarget,
    minimumAttemptsForNoPayout,
    minimumBudgetForLossTarget,
    noPayoutProbability,
    noPayoutProbabilityFromDistribution,
} from '~/lib/prop-calculator/economics';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

const videoThirtyThree = { attempts: 50, pAttemptPays: 0.33 * 0.33 } as const;

const videoHundredAttempts = {
    attemptCost: dollars(250),
    attempts: 100,
    pAttemptPays: fraction(0.12),
    valuePerPayingAttempt: dollars(4000),
} as const;

function twoPointLoss(attempts: number): number {
    return (
        batchLossClosedForm({
            attemptCost: dollars(100),
            attempts,
            pAttemptPays: fraction(0.2),
            valuePerPayingAttempt: dollars(1000),
        }).value ?? NaN
    );
}

describe('attemptsAffordable', () => {
    it.each([
        [5000, 250, 20],
        [5000, 100, 50],
        [5000, 300, 16],
        [0, 250, 0],
    ])('%f at %f per attempt affords %i attempts', (budget, cost, expected) => {
        expect(attemptsAffordable(dollars(budget), dollars(cost)).value).toBe(
            expected,
        );
    });

    it('refuses a non-positive attempt cost', () => {
        expect(attemptsAffordable(dollars(5000), dollars(0)).reason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});

describe('noPayoutProbability (secondary row, VD-26)', () => {
    it.each([
        [0.1, 10, 0.348678],
        [0.1, 20, 0.121577],
        [0.1, 50, 0.005154],
    ])('(1 - %f)^%i is %f', (p, n, expected) => {
        expect(noPayoutProbability(fraction(p), n).value).toBeCloseTo(
            expected,
            6,
        );
    });

    it('gives the video unrounded 0.33 x 0.33 = 0.1089 case 0.003136 at 50 attempts', () => {
        expect(
            noPayoutProbability(
                fraction(videoThirtyThree.pAttemptPays),
                videoThirtyThree.attempts,
            ).value,
        ).toBeCloseTo(0.003136, 6);
    });

    it('is labelled P(no payout from N attempts) and says it ignores payout size', () => {
        expect(noPayoutProbability(fraction(0.1), 10).disclosures).toEqual([
            EconomicsDisclosure.NoPayoutIgnoresPayoutSize,
        ]);
    });

    it('refuses a fractional attempt count', () => {
        expect(noPayoutProbability(fraction(0.1), 2.5).reason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});

describe('noPayoutProbabilityFromDistribution (PT-61d, F-V25)', () => {
    it('reads the share of no-payout trials from index 0', () => {
        expect(noPayoutProbabilityFromDistribution([0.42, 0.3, 0.28])).toBe(
            0.42,
        );
    });

    it('is null when no trial ever reached funded', () => {
        expect(noPayoutProbabilityFromDistribution([])).toBeNull();
    });

    it('is the single definition the CLI and web P(no payout) columns share', () => {
        expect(noPayoutProbabilityFromDistribution([1])).toBe(1);
        expect(noPayoutProbabilityFromDistribution([0])).toBe(0);
    });
});

describe('minimumAttemptsForNoPayout', () => {
    it('needs 51 attempts at p 0.1 for a 0.5% no-payout chance', () => {
        const result = minimumAttemptsForNoPayout(
            fraction(0.1),
            fraction(0.005),
        );
        expect(result.value).toBe(51);
        expect(result.disclosures).toContain(
            EconomicsDisclosure.NoPayoutIgnoresPayoutSize,
        );
    });

    it('lands exactly on a target that a whole count reaches', () => {
        expect(
            minimumAttemptsForNoPayout(fraction(0.5), fraction(0.25)).value,
        ).toBe(2);
    });

    it('never reaches the target when no attempt can pay', () => {
        expect(
            minimumAttemptsForNoPayout(fraction(0), fraction(0.005)).reason,
        ).toBe(EconomicsReason.NoPayoutChance);
    });

    it('counts accurately at a tiny pay chance, where 1 - p loses its digits', () => {
        const count = minimumAttemptsForNoPayout(
            fraction(1e-12),
            fraction(0.005),
        ).value;
        const exact = Math.log(0.005) / Math.log1p(-1e-12);
        expect(count).not.toBeNull();
        expect(Math.abs((count ?? 0) - exact) / exact).toBeLessThan(1e-9);
    });

    it('is Unreachable, and returns, when the count passes the largest safe integer (p 1e-17)', () => {
        const result = minimumAttemptsForNoPayout(
            fraction(1e-17),
            fraction(0.005),
        );
        expect(result.value).toBeNull();
        expect(result.reason).toBe(EconomicsReason.Unreachable);
    });
});

describe('batchLossClosedForm (one-value binomial cross-check)', () => {
    it('shows the zero-EV pin: P(net < 0) 0.431198 where P(no payout) is only 0.005154 (VD-2)', () => {
        const loss = batchLossClosedForm({
            attemptCost: dollars(100),
            attempts: 50,
            pAttemptPays: fraction(0.1),
            valuePerPayingAttempt: dollars(1000),
        });
        expect(loss.value).toBeCloseTo(0.431198, 6);
        expect(noPayoutProbability(fraction(0.1), 50).value).toBeCloseTo(
            0.005154,
            6,
        );
        expect(loss.disclosures).toContain(
            EconomicsDisclosure.OneValuePerPayingAttempt,
        );
    });

    it('gives the video 100-attempt batch (p 0.12, value 4,000, cost 250) 0.036737', () => {
        expect(batchLossClosedForm(videoHundredAttempts).value).toBeCloseTo(
            0.036737,
            6,
        );
    });

    it('stays finite in log space for a large batch', () => {
        const loss = batchLossClosedForm({
            attemptCost: dollars(100),
            attempts: 10_000,
            pAttemptPays: fraction(0.2),
            valuePerPayingAttempt: dollars(1000),
        }).value;
        expect(Number.isFinite(loss)).toBe(true);
        expect(loss).toBeLessThan(1e-12);
    });

    it('is zero at zero attempts, since an empty batch loses nothing', () => {
        expect(
            batchLossClosedForm({ ...videoHundredAttempts, attempts: 0 }).value,
        ).toBe(0);
    });

    it('is one when no attempt can pay', () => {
        expect(
            batchLossClosedForm({
                ...videoHundredAttempts,
                pAttemptPays: fraction(0),
            }).value,
        ).toBeCloseTo(1, 12);
    });
});

describe('minimumAttemptsForLossTarget (sawtooth-safe)', () => {
    it('pins the two-point probabilities the sawtooth case rests on', () => {
        expect(twoPointLoss(44)).toBeCloseTo(0.04401, 6);
        expect(twoPointLoss(30)).toBeCloseTo(0.044179, 6);
        expect(twoPointLoss(31)).toBeGreaterThan(0.1);
    });

    it('returns 44, not 30, because P(31) jumps back above the threshold', () => {
        const result = minimumAttemptsForLossTarget({
            cap: 200,
            lossProbability: twoPointLoss,
            meanNetPerSample: dollars(100),
            sampleUnit: LossSampleUnit.Attempt,
            threshold: fraction(0.05),
        });
        expect(result.value).toBe(44);
        expect(result.disclosures).toContain(
            EconomicsDisclosure.DiscreteSawtooth,
        );
    });

    it('prices the minimum budget as N x attempt cost', () => {
        expect(
            minimumBudgetForLossTarget({
                cap: 200,
                costPerSample: dollars(100),
                costUnit: LossSampleUnit.Attempt,
                lossProbability: twoPointLoss,
                meanNetPerSample: dollars(100),
                sampleUnit: LossSampleUnit.Attempt,
                threshold: fraction(0.05),
            }).value,
        ).toBe(4400);
    });

    it('is null with NoPositiveEdge when the mean net per attempt is not positive', () => {
        for (const mean of [0, -10]) {
            const result = minimumAttemptsForLossTarget({
                cap: 200,
                lossProbability: twoPointLoss,
                meanNetPerSample: dollars(mean),
                sampleUnit: LossSampleUnit.Attempt,
                threshold: fraction(0.05),
            });
            expect(result.reason).toBe(EconomicsReason.NoPositiveEdge);
        }
    });

    it('is null with ThresholdNotSet when the user has not set a threshold', () => {
        expect(
            minimumAttemptsForLossTarget({
                cap: 200,
                lossProbability: twoPointLoss,
                meanNetPerSample: dollars(100),
                sampleUnit: LossSampleUnit.Attempt,
                threshold: null,
            }).reason,
        ).toBe(EconomicsReason.ThresholdNotSet);
        expect(
            minimumBudgetForLossTarget({
                cap: 200,
                costPerSample: dollars(100),
                costUnit: LossSampleUnit.Attempt,
                lossProbability: twoPointLoss,
                meanNetPerSample: dollars(100),
                sampleUnit: LossSampleUnit.Attempt,
                threshold: null,
            }).reason,
        ).toBe(EconomicsReason.ThresholdNotSet);
    });

    it('is null with AboveCap when the threshold is not held up to the cap', () => {
        expect(
            minimumAttemptsForLossTarget({
                cap: 31,
                lossProbability: twoPointLoss,
                meanNetPerSample: dollars(100),
                sampleUnit: LossSampleUnit.Attempt,
                threshold: fraction(0.05),
            }).reason,
        ).toBe(EconomicsReason.AboveCap);
    });

    it('refuses a cap above MAX_LOSS_TARGET_CAP without evaluating the loss function', () => {
        let calls = 0;
        const result = minimumAttemptsForLossTarget({
            cap: MAX_LOSS_TARGET_CAP + 1,
            lossProbability: () => {
                calls += 1;
                return 0;
            },
            meanNetPerSample: dollars(100),
            sampleUnit: LossSampleUnit.Attempt,
            threshold: fraction(0.05),
        });
        expect(result.reason).toBe(EconomicsReason.InvalidInput);
        expect(calls).toBe(0);
    });

    it('refuses to price a trial-unit loss curve with a per-attempt cost', () => {
        expect(
            minimumBudgetForLossTarget({
                cap: 200,
                costPerSample: dollars(100),
                costUnit: LossSampleUnit.Attempt,
                lossProbability: twoPointLoss,
                meanNetPerSample: dollars(100),
                sampleUnit: LossSampleUnit.Trial,
                threshold: fraction(0.05),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it('prices engine per-trial nets with the cost per trial at max attempts 3, the spend the Monte Carlo trials make', () => {
        const plan = findFirm(FirmId.Apex)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!plan) throw new Error('Apex 50K EOD plan not found');
        const outputs = simulate({
            fundedHorizonDays: 252,
            maxAttempts: 3,
            maxEvalDays: 150,
            minRetainedCushion: 2000,
            plan,
            riskPerTrade: 400,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seed: 42,
            tradesPerDay: 2,
            trials: 200,
            winrate: 0.5,
        });
        expect(outputs.expectedAttempts).toBeGreaterThan(1);
        const lossProbability = (trials: number): number =>
            cohortOutcome(outputs.netValues, trials, 400, 7).value
                ?.lossProbability.value ?? NaN;
        const inputs = {
            cap: 20,
            lossProbability,
            meanNetPerSample: dollars(outputs.expectedNet),
            sampleUnit: LossSampleUnit.Trial,
            threshold: fraction(1),
        };
        const trials = minimumAttemptsForLossTarget(inputs).value;
        expect(trials).toBe(1);
        const budget = minimumBudgetForLossTarget({
            ...inputs,
            costPerSample: dollars(outputs.expectedTotalCost),
            costUnit: LossSampleUnit.Trial,
        }).value;
        expect(budget).toBeCloseTo(outputs.expectedTotalCost, 9);
        expect(budget ?? 0).toBeGreaterThan(outputs.costPerAttempt);
    });

    it('refuses a non-positive cap', () => {
        expect(
            minimumAttemptsForLossTarget({
                cap: 0,
                lossProbability: twoPointLoss,
                meanNetPerSample: dollars(100),
                sampleUnit: LossSampleUnit.Attempt,
                threshold: fraction(0.05),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it('agrees with the Monte Carlo cohort outcome over per-attempt nets at N = 44 within 3 SE', () => {
        const netValues = [900, -100, -100, -100, -100];
        const cohort = cohortOutcome(netValues, 44, 20_000, 11).value;
        if (!cohort) throw new Error('cohort outcome missing');
        const standardError = cohort.lossProbability.standardError ?? 0;
        expect(standardError).toBeGreaterThan(0);
        expect(
            Math.abs(cohort.lossProbability.value - 0.04401),
        ).toBeLessThanOrEqual(3 * standardError);
    });
});
