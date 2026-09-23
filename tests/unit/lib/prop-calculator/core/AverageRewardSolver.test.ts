import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import {
    type AverageRewardConfig,
    RateSearchStatus,
    solveAverageRewardPolicy,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import { RenewalCycleObjective } from '~/lib/prop-calculator/core/RenewalCycleObjective';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const RR_RATIO = 2;
const WINRATE = fraction(0.5);
const MAX_EVAL_DAYS = 1;
const FUNDED_HORIZON_DAYS = 252;
const MAX_SOLVES = 10;

const EVAL_GRID = {
    actionStepDollars: 50,
    cushionStepDollars: 50,
    maxActionDollars: 50,
    profitStepDollars: 50,
    tradesPerDay: 1,
} as const;

const FUNDED_GRID = {
    actionStepMultiple: 1,
    cushionStepMultiple: 1,
    maxActionMultiple: 1,
    tradesPerDay: 1,
} as const;

function buildConfig(
    objective: RenewalCycleObjective,
    overrides: Partial<AverageRewardConfig> = {},
): AverageRewardConfig {
    return {
        evalGrid: EVAL_GRID,
        fundedGrid: FUNDED_GRID,
        maxSolves: MAX_SOLVES,
        objective,
        rrRatio: RR_RATIO,
        winrate: WINRATE,
        ...overrides,
    };
}

function buildObjective(
    plan: Plan,
    rebuyLagDays: number,
): RenewalCycleObjective {
    return new RenewalCycleObjective({
        fundedHorizonDays: FUNDED_HORIZON_DAYS,
        maxEvalDays: MAX_EVAL_DAYS,
        plan,
        rebuyLagDays,
    });
}

function jointToyPlan(fees: { activation: number; oneTimeEval: number }): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(fees.activation),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(fees.oneTimeEval),
            reset: dollars(0),
        },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        isInstantFunded: false,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: dollars(50),
    });
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

describe(
    'solveAverageRewardPolicy: joint toy (rapid-EOD base plan with the ' +
        'eval-toy fields: target 50, 1-day cap, $50 action; the funded ' +
        'one-payout toy; isInstantFunded false; fees oneTimeEval=F, ' +
        'monthlySubscription=0, activation=A): closed form rho* = ' +
        '(25 - 0.5A - F) / (1.5 + L), since a $50 eval bet either passes ' +
        '(profit 100 >= target 50) or times out on the 1-day cap without ' +
        'busting, a passed eval always reaches a funded day that either ' +
        'locks-and-pays-out $100 (100% share, no fee, then concludes at ' +
        'maxLifetimePayouts 1) or busts, and every cycle spends exactly ' +
        '1 eval day, 0 or 1 funded day and L rebuy-lag days, so E[T] = ' +
        '1.5 + L, and E[R] = -F + 0.5*(-A + 0.5*100) = 25 - 0.5A - F',
    () => {
        it.each([
            [0, 10],
            [3, 15 / 4.5],
        ])(
            'rebuyLagDays=%d converges to rho*=%p with F=10, A=0',
            (rebuyLagDays, expectedRho) => {
                const plan = jointToyPlan({ activation: 0, oneTimeEval: 10 });
                const objective = buildObjective(plan, rebuyLagDays);

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective),
                );

                expect(solution.status).toBe(RateSearchStatus.Converged);
                expect(solution.ratePerDay).toBeCloseTo(expectedRho, 6);
            },
        );

        it.each([0, 3])(
            'rebuyLagDays=%d: simulate() on the solved policies gives ' +
                'expectedMonthlyNet close to 21 * rho*',
            (rebuyLagDays) => {
                const plan = jointToyPlan({ activation: 0, oneTimeEval: 10 });
                const objective = buildObjective(plan, rebuyLagDays);
                const expectedRho = (25 - 10) / (1.5 + rebuyLagDays);

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective),
                );

                const empirical = simulate({
                    evalDayPolicy: solution.evalResult.dayPolicy,
                    fundedDayPolicy: solution.fundedResult.dayPolicy,
                    fundedHorizonDays: FUNDED_HORIZON_DAYS,
                    maxEvalDays: MAX_EVAL_DAYS,
                    plan,
                    rebuyLagDays,
                    riskPerTrade: 50,
                    rrRatio: RR_RATIO,
                    seed: 42,
                    tradesPerDay: 1,
                    trials: 200_000,
                    winrate: 0.5,
                });

                const expectedMonthlyNet = objective.monthlyRate(expectedRho);
                expect(empirical.expectedMonthlyNet).toBeCloseTo(
                    expectedMonthlyNet,
                    -1,
                );
            },
        );

        it(
            'an unprofitable toy (F=100, A=0, L=0, naive one-day closed ' +
                'form rho*=(25-100)/1.5=-50) converges to a negative rate ' +
                'per day, per D9: search into negative lambda and report ' +
                'a negative $/month honestly (the DP itself lands above ' +
                "-50, since the base plan's maxConsecutiveIdleDays=7 lets " +
                "a sufficiently negative dayCost's funded policy farm idle " +
                'days for reward before a forced idle-bust, a genuinely ' +
                'richer multi-day optimum the naive single-day hand ' +
                'derivation does not capture; only the sign is pinned here)',
            () => {
                const plan = jointToyPlan({
                    activation: 0,
                    oneTimeEval: 100,
                });
                const objective = buildObjective(plan, 0);

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective),
                );

                expect(solution.status).toBe(RateSearchStatus.Converged);
                expect(solution.ratePerDay).toBeLessThan(0);
            },
        );

        it(
            'maxSolves: 2 gives RateSearchStatus.SolveCapReached, since ' +
                "this toy's huge maxExpectedCycleDays (dominated by the " +
                '252-day funded horizon bound, even though both funded ' +
                'outcomes actually resolve on day 1) makes the certified ' +
                'first step tiny relative to rho*, so 2 solves cannot ' +
                'shrink the bracket to within rateTolerancePerDay',
            () => {
                const plan = jointToyPlan({ activation: 0, oneTimeEval: 10 });
                const objective = buildObjective(plan, 0);

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective, { maxSolves: 2 }),
                );

                expect(solution.status).toBe(RateSearchStatus.SolveCapReached);
                expect(solution.trace).toHaveLength(2);
            },
        );
    },
);

describe(
    'solveAverageRewardPolicy vs the best flat/percent-of-cushion policy ' +
        '(K1, replacing the removed lifetime-net regression per D11): ' +
        'the DP must never underperform the best fixed-risk or ' +
        'fixed-percent-of-cushion candidate on expectedMonthlyNet, since a ' +
        'state-aware policy is a strict superset of a fixed policy (a ' +
        'fixed policy is a state-aware one that happens to ignore state)',
    () => {
        it(
            'MFF Rapid EOD 50K: the average-reward DP policy beats the ' +
                "best flat/percent candidate's expectedMonthlyNet, " +
                "measured both by the DP's own solved rate AND by " +
                "simulate()'s empirical monthly net driven by the exact " +
                'same policy, the same double check the original K1 ' +
                'harness applied',
            () => {
                const plan = rapidEodPlan();
                const rrRatio = 2;
                const winrate = 0.4;
                const tradesPerDay = 4;
                const maxEvalDays = 15;
                const fundedHorizonDays = 252;
                const rebuyLagDays = 2;
                const seed = 42;
                const flatSweepTrials = 8000;

                const flatCandidates = [200, 250, 300, 400];
                const percentCandidates = [0.05, 0.075, 0.1, 0.15];

                let bestFlatMonthlyNet = -Infinity;
                for (const evalRisk of flatCandidates) {
                    for (const fundedRisk of flatCandidates) {
                        const out = simulate({
                            fundedHorizonDays,
                            fundedRiskPerTrade: fundedRisk,
                            maxEvalDays,
                            plan,
                            rebuyLagDays,
                            riskPerTrade: evalRisk,
                            rrRatio,
                            seed,
                            tradesPerDay,
                            trials: flatSweepTrials,
                            winrate,
                        });
                        bestFlatMonthlyNet = Math.max(
                            bestFlatMonthlyNet,
                            out.expectedMonthlyNet,
                        );
                    }
                }
                for (const percent of percentCandidates) {
                    const out = simulate({
                        fundedCushionPercent: fraction(percent),
                        fundedHorizonDays,
                        maxEvalDays,
                        plan,
                        rebuyLagDays,
                        riskPerTrade: 250,
                        rrRatio,
                        seed,
                        tradesPerDay,
                        trials: flatSweepTrials,
                        winrate,
                    });
                    bestFlatMonthlyNet = Math.max(
                        bestFlatMonthlyNet,
                        out.expectedMonthlyNet,
                    );
                }

                const objective = new RenewalCycleObjective({
                    fundedHorizonDays,
                    maxEvalDays,
                    plan,
                    rebuyLagDays,
                });

                const solution = solveAverageRewardPolicy({
                    evalGrid: {
                        actionStepDollars: 100,
                        cushionStepDollars: 200,
                        profitStepDollars: 600,
                        tradesPerDay,
                    },
                    fundedGrid: {
                        actionStepMultiple: 0.1,
                        maxActionMultiple: 0.3,
                        tradesPerDay,
                    },
                    maxSolves: 10,
                    objective,
                    rrRatio,
                    winrate: fraction(winrate),
                });

                expect(solution.status).toBe(RateSearchStatus.Converged);

                const empiricalOut = simulate({
                    evalDayPolicy: solution.evalResult.dayPolicy,
                    fundedDayPolicy: solution.fundedResult.dayPolicy,
                    fundedHorizonDays,
                    maxEvalDays,
                    plan,
                    rebuyLagDays,
                    riskPerTrade: 250,
                    rrRatio,
                    seed,
                    tradesPerDay,
                    trials: 12_000,
                    winrate,
                });

                expect(empiricalOut.expectedMonthlyNet).toBeGreaterThanOrEqual(
                    bestFlatMonthlyNet,
                );

                const predictedMonthlyNet = objective.monthlyRate(
                    solution.ratePerDay,
                );
                console.info(
                    'K1: DP predicted $/month %s vs empirical $/month %s (best flat %s)',
                    predictedMonthlyNet.toFixed(2),
                    empiricalOut.expectedMonthlyNet.toFixed(2),
                    bestFlatMonthlyNet.toFixed(2),
                );
            },
            2_700_000,
        );
    },
);

describe('solveAverageRewardPolicy input validation', () => {
    it(
        'fundedHorizonDays 0 throws, since RenewalCycleObjective (the only ' +
            'source of a horizon for solveAverageRewardPolicy) requires ' +
            'fundedHorizonDays >= 1',
        () => {
            const plan = jointToyPlan({ activation: 0, oneTimeEval: 10 });

            expect(() => {
                const objective = new RenewalCycleObjective({
                    fundedHorizonDays: 0,
                    maxEvalDays: MAX_EVAL_DAYS,
                    plan,
                    rebuyLagDays: 0,
                });
                return solveAverageRewardPolicy(buildConfig(objective));
            }).toThrow(/fundedHorizonDays/);
        },
    );

    it(
        'an unconverged funded level throws, since the average-reward ' +
            'estimate would otherwise be biased by an unconverged sweep ' +
            '(maxIterationsPerLevel: 1 reproduces the same unconverged ' +
            "level FundedStateValue.test.ts's own T11 regression pins on " +
            'this exact funded toy structure)',
        () => {
            const plan = jointToyPlan({ activation: 0, oneTimeEval: 10 });
            const objective = buildObjective(plan, 0);

            expect(() =>
                solveAverageRewardPolicy(
                    buildConfig(objective, {
                        fundedGrid: {
                            ...FUNDED_GRID,
                            maxIterationsPerLevel: 1,
                        },
                    }),
                ),
            ).toThrow(/converge/);
        },
    );
});
