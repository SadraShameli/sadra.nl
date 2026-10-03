import { beforeAll, describe, expect, it } from 'vitest';

import {
    FirmId,
    fraction,
    InstrumentSymbol,
    MffuVariant,
    oneContractRisk,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core';
import {
    RateSearchStatus,
    solveAverageRewardPolicy,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import { RenewalCycleObjective } from '~/lib/prop-calculator/core/RenewalCycleObjective';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

import { memoise } from '../../../memoise';

const K1_INSTRUMENT = InstrumentSymbol.MNQ;
const K1_STOP_POINTS = 12.5;

function k1PositionSizing(): PositionSizingConfig {
    const positionSizing = resolvePositionSizing(K1_INSTRUMENT, K1_STOP_POINTS);
    if (positionSizing === null) throw new Error('MNQ sizing did not resolve');
    return positionSizing;
}

function rapidEodPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

const K1_RR_RATIO = 2;
const K1_WINRATE = 0.4;
const K1_TRADES_PER_DAY = 4;
const K1_MAX_EVAL_DAYS = 8;
const K1_FUNDED_HORIZON_DAYS = 252;
const K1_REBUY_LAG_DAYS = 2;
const K1_SEED = 42;
const K1_FLAT_CANDIDATES = [200, 250, 300, 400];
const K1_PERCENT_CANDIDATES = [0.05, 0.075, 0.1, 0.15];

const k1BestFlatMonthlyNet = memoise(() => {
    const plan = rapidEodPlan();
    const flatSweepTrials = 3000;
    let bestFlatMonthlyNet = -Infinity;
    for (const evalRisk of K1_FLAT_CANDIDATES) {
        for (const fundedRisk of K1_FLAT_CANDIDATES) {
            const out = simulate({
                fundedHorizonDays: K1_FUNDED_HORIZON_DAYS,
                fundedRiskPerTrade: fundedRisk,
                instrument: K1_INSTRUMENT,
                maxEvalDays: K1_MAX_EVAL_DAYS,
                plan,
                rebuyLagDays: K1_REBUY_LAG_DAYS,
                riskPerTrade: evalRisk,
                rrRatio: K1_RR_RATIO,
                seed: K1_SEED,
                stopPoints: K1_STOP_POINTS,
                tradesPerDay: K1_TRADES_PER_DAY,
                trials: flatSweepTrials,
                winrate: K1_WINRATE,
            });
            bestFlatMonthlyNet = Math.max(
                bestFlatMonthlyNet,
                out.expectedMonthlyNet,
            );
        }
    }
    for (const percent of K1_PERCENT_CANDIDATES) {
        const out = simulate({
            fundedCushionPercent: fraction(percent),
            fundedHorizonDays: K1_FUNDED_HORIZON_DAYS,
            instrument: K1_INSTRUMENT,
            maxEvalDays: K1_MAX_EVAL_DAYS,
            plan,
            rebuyLagDays: K1_REBUY_LAG_DAYS,
            riskPerTrade: 250,
            rrRatio: K1_RR_RATIO,
            seed: K1_SEED,
            stopPoints: K1_STOP_POINTS,
            tradesPerDay: K1_TRADES_PER_DAY,
            trials: flatSweepTrials,
            winrate: K1_WINRATE,
        });
        bestFlatMonthlyNet = Math.max(
            bestFlatMonthlyNet,
            out.expectedMonthlyNet,
        );
    }
    return bestFlatMonthlyNet;
});

const k1Objective = memoise(
    () =>
        new RenewalCycleObjective({
            fundedHorizonDays: K1_FUNDED_HORIZON_DAYS,
            maxEvalDays: K1_MAX_EVAL_DAYS,
            plan: rapidEodPlan(),
            rebuyLagDays: K1_REBUY_LAG_DAYS,
        }),
);

const k1Solution = memoise(() =>
    solveAverageRewardPolicy({
        evalGrid: {
            actionStepDollars: 300,
            cushionStepDollars: 600,
            profitStepDollars: 1200,
            tradesPerDay: K1_TRADES_PER_DAY,
        },
        fundedGrid: {
            actionStepMultiple: 0.1,
            cushionStepMultiple: 0.5,
            maxActionMultiple: 0.3,
            maxCushionMultiple: 3,
            maxTailCushionMultiple: 3,
            tradesPerDay: K1_TRADES_PER_DAY,
        },
        maxSolves: 10,
        objective: k1Objective(),
        rrRatio: K1_RR_RATIO,
        winrate: fraction(K1_WINRATE),
    }),
);

const k1Empirical = memoise(() => {
    const solution = k1Solution();
    return simulate({
        evalDayPolicy: solution.evalResult.dayPolicy,
        fundedDayPolicy: solution.fundedResult.dayPolicy,
        fundedHorizonDays: K1_FUNDED_HORIZON_DAYS,
        instrument: K1_INSTRUMENT,
        maxEvalDays: K1_MAX_EVAL_DAYS,
        plan: rapidEodPlan(),
        rebuyLagDays: K1_REBUY_LAG_DAYS,
        riskPerTrade: 250,
        rrRatio: K1_RR_RATIO,
        seed: K1_SEED,
        stopPoints: K1_STOP_POINTS,
        tradesPerDay: K1_TRADES_PER_DAY,
        trials: 6000,
        winrate: K1_WINRATE,
    });
});

const K1_DP_REPLAY_TOLERANCE = 0.3;

describe(
    'solveAverageRewardPolicy vs the best flat/percent-of-cushion policy ' +
        '(K1, replacing the removed lifetime-net regression per D11): ' +
        'the DP must never underperform the best fixed-risk or ' +
        'fixed-percent-of-cushion candidate on expectedMonthlyNet, since a ' +
        'state-aware policy is a strict superset of a fixed policy (a ' +
        'fixed policy is a state-aware one that happens to ignore state). ' +
        'Re-pinned inputs, because the one test took 1,073 s: 8 eval days, ' +
        'a $300 eval action step, a $600 eval cushion step, a $1,200 ' +
        'profit step, a funded cushion grid of 0.5x steps up to 3x, 3,000 ' +
        'trials per flat candidate and 6,000 for the DP policy, down from ' +
        '15 eval days, $100, $200 and $600 steps, the default funded ' +
        'cushion grid, 8,000 trials per candidate and 12,000 for the DP ' +
        'policy. At a $400 eval step and a 1x funded step the solved rate ' +
        'was $870 a month against $2,093 simulated and below the best flat ' +
        'candidate ($1,083), so those grids were too coarse for the premise ' +
        'to hold; at these grids the solved rate is about $1,738 against ' +
        'about $2,157 simulated. The DP policy is replayed with the same ' +
        'instrument and stop points as the flat candidates. The solve and ' +
        'each simulation run once and are shared by the tests below',
    () => {
        beforeAll(() => {
            k1Solution();
        });

        beforeAll(() => {
            k1BestFlatMonthlyNet();
        });

        it('places every flat candidate in whole MNQ micros at a 12.5 point stop ($25 each, T33: percent-of-cushion needs a stop, and each flat candidate is a whole number of contracts, at least one, so it trades exactly as before)', () => {
            const contractRisk = oneContractRisk(k1PositionSizing());
            for (const risk of K1_FLAT_CANDIDATES) {
                expect(Number.isSafeInteger(risk / contractRisk)).toBe(true);
                expect(risk).toBeGreaterThanOrEqual(contractRisk);
            }
        });

        it('MFF Rapid EOD 50K: the rate search converges for the average-reward DP', () => {
            expect(k1Solution().status).toBe(RateSearchStatus.Converged);
        });

        it('MFF Rapid EOD 50K: the DP own solved monthly rate clears the best flat/percent candidate, so the state-aware superset premise holds on these grids', () => {
            const predicted = k1Objective().monthlyRate(
                k1Solution().ratePerDay,
            );

            expect(predicted).toBeGreaterThanOrEqual(k1BestFlatMonthlyNet());
        });

        it(
            'MFF Rapid EOD 50K: simulate() driven by the exact same DP policy ' +
                "earns at least the best flat/percent candidate's " +
                'expectedMonthlyNet and lands within 30% of the rate the DP ' +
                'predicted, the double check the original K1 harness ' +
                "applied beside the DP's own solved rate",
            () => {
                const empiricalOut = k1Empirical();
                const bestFlatMonthlyNet = k1BestFlatMonthlyNet();
                const predicted = k1Objective().monthlyRate(
                    k1Solution().ratePerDay,
                );

                expect(empiricalOut.expectedMonthlyNet).toBeGreaterThanOrEqual(
                    bestFlatMonthlyNet,
                );
                expect(
                    Math.abs(predicted - empiricalOut.expectedMonthlyNet) /
                        empiricalOut.expectedMonthlyNet,
                ).toBeLessThanOrEqual(K1_DP_REPLAY_TOLERANCE);

                console.info(
                    'K1: DP predicted $/month %s vs empirical $/month %s (best flat %s)',
                    predicted.toFixed(2),
                    empiricalOut.expectedMonthlyNet.toFixed(2),
                    bestFlatMonthlyNet.toFixed(2),
                );
            },
        );
    },
);
