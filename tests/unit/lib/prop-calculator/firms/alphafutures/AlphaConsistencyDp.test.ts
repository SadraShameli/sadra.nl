import { beforeAll, describe, expect, it } from 'vitest';

import {
    ConsistencyBoundary,
    ConsistencyNonPositiveProfit,
    type ConsistencyRule,
    dollars,
    simulate,
} from '~/lib/prop-calculator';
import {
    computeFundedStateValue,
    isFundedDpEligible,
} from '~/lib/prop-calculator/core/FundedStateValue';

import { memoise } from '../../../../memoise';
import {
    alphaToy,
    lossExemptRuleOf,
    qualifiedAlphaRule,
} from './alphaConsistencyFixtures';

interface DpRun {
    dp: number;
    fundedBustProbability: number;
    payoutCount: number;
    simulated: number;
}

const SIMULATED_TRIALS = 1500;

const qualifiedRule = qualifiedAlphaRule();
const lossExemptRule = lossExemptRuleOf(qualifiedRule);

function averageRequest(run: DpRun): number {
    return run.simulated / run.payoutCount;
}

function simulateToy(
    rule: ConsistencyRule,
    result: ReturnType<typeof computeFundedStateValue>,
): DpRun {
    const out = simulate({
        fundedDayPolicy: result.dayPolicy,
        fundedHorizonDays: 400,
        maxEvalDays: 1,
        plan: alphaToy(rule),
        riskPerTrade: 100,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 2,
        trials: SIMULATED_TRIALS,
        winrate: 0.5,
    });
    return {
        dp: result.initialValue,
        fundedBustProbability: out.fundedBustProbability,
        payoutCount: out.expectedPayoutCount,
        simulated: out.expectedGrossPayout,
    };
}

function solveToy(rule: ConsistencyRule) {
    const result = computeFundedStateValue({
        actionStepMultiple: 0.5,
        cushionStepMultiple: 0.25,
        cycleBestDayBucketCount: 10,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxTailCushionMultiple: 6,
        plan: alphaToy(rule),
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: 0.5,
    });
    expect(result.unconvergedLevelCount).toBe(0);
    expect(result.bustTerminalValue).toBe(0);
    return result;
}

const qualifiedSolution = memoise(() => solveToy(qualifiedRule));
const lossExemptSolution = memoise(() => solveToy(lossExemptRule));
const qualifiedRun = memoise(() =>
    simulateToy(qualifiedRule, qualifiedSolution()),
);
const lossExemptRun = memoise(() =>
    simulateToy(lossExemptRule, lossExemptSolution()),
);

describe('N-45 in the funded dynamic program: the net-losing cycle rule holds from the second request on', () => {
    beforeAll(() => {
        qualifiedSolution();
    });

    beforeAll(() => {
        lossExemptSolution();
    });

    beforeAll(() => {
        qualifiedRun();
    });

    beforeAll(() => {
        lossExemptRun();
    });

    it('uses the real Alpha Qualified rule: inclusive and failing on a net-losing cycle', () => {
        expect(qualifiedRule.boundary).toBe(ConsistencyBoundary.Inclusive);
        expect(qualifiedRule.nonPositiveProfit).toBe(
            ConsistencyNonPositiveProfit.Violates,
        );
        expect(isFundedDpEligible(alphaToy(qualifiedRule))).toBe(true);
    });

    it('separates the Alpha rule from a loss-exempt rule after the first request, in the same direction as simulated trials of its own policy, at the 6 drawdown cushion grid with the coarse tail pinned off (WP58d, re-measured in WP58e: this toy sets no meanHorizonDays, so its hazard is 0 and its sweep cap is the plain 200 floor, and its loss-exempt rule needs more than that on two funded levels at the default 30 drawdown tail; it reaches the same value to 5e-8 with maxIterationsPerLevel 1000. With meanHorizonDays 400, as optimize dp gives it, the toy converges at the default tail and this test still passes, but the aggregate test below then misses its 0.03 bust-gap bound (0.0457 at the default tail, 0.0335 with the tail pinned) because the horizon changes the DP policy, not because of convergence, so the pin stays; the tail-on path of consistency-tracked rules is covered by the one-request toy below. PT-T1c: 10 best-day buckets instead of 25, which gives the same DP values to the cent on both toys, and 1,500 simulated trials instead of 20,000, where every figure the assertions read moves by about 1 percent or less from 1,500 to 6,000 trials)', () => {
        const alpha = qualifiedRun();
        const lossExempt = lossExemptRun();
        expect(alpha.simulated - lossExempt.simulated).toBeGreaterThan(50);
        expect(alpha.dp - lossExempt.dp).toBeGreaterThan(50);
        for (const run of [alpha, lossExempt]) {
            expect(Math.abs(run.dp - run.simulated)).toBeLessThan(
                0.2 * run.simulated,
            );
        }
    });
});

describe('N-45 aggregate explanation under the DP policies: both rules bust about equally and the strict rule wins on larger requests', () => {
    beforeAll(() => {
        qualifiedRun();
    });

    beforeAll(() => {
        lossExemptRun();
    });

    it('aggregate: under their DP policies both rules bust about equally and stay well under the 3-payout cap, and the strict rule wins on larger requests, at the 6 drawdown cushion grid with the coarse tail pinned off (WP58d and WP58e, same reason as the first DP test above)', () => {
        const strict = qualifiedRun();
        const lossExempt = lossExemptRun();

        expect(strict.payoutCount).toBeLessThan(2);
        expect(lossExempt.payoutCount).toBeLessThan(2);
        expect(
            Math.abs(
                strict.fundedBustProbability - lossExempt.fundedBustProbability,
            ),
        ).toBeLessThan(0.03);
        expect(averageRequest(strict)).toBeGreaterThan(
            1.15 * averageRequest(lossExempt),
        );
    });
});
