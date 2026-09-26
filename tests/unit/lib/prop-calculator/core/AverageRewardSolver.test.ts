import { describe, expect, it } from 'vitest';

import {
    computeEvalStateValue,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    InstrumentSymbol,
    MffuVariant,
    oneContractRisk,
    type Plan,
    type PositionSizingConfig,
    replacementEconomics,
    resolvePositionSizing,
    RetryKind,
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
const K1_INSTRUMENT = InstrumentSymbol.MNQ;
const K1_STOP_POINTS = 12.5;

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

interface JointToyFees {
    readonly activation: number;
    readonly monthlySubscription?: number;
    readonly oneTimeEval: number;
    readonly reset?: number;
    readonly retry?: RetryKind;
}

interface JointToyOptions {
    readonly evalDrawdownAmount?: number;
    readonly maxConsecutiveIdleDays?: number;
    readonly profitTarget?: number;
}

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
    maxEvalDays = MAX_EVAL_DAYS,
): RenewalCycleObjective {
    return new RenewalCycleObjective({
        fundedHorizonDays: FUNDED_HORIZON_DAYS,
        maxEvalDays,
        plan,
        rebuyLagDays,
    });
}

function jointToyPlan(fees: JointToyFees, options: JointToyOptions = {}): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({
            amount: dollars(options.evalDrawdownAmount ?? 100),
        }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        ...(options.maxConsecutiveIdleDays !== undefined && {
            evalMaxConsecutiveIdleDays: options.maxConsecutiveIdleDays,
        }),
        fees: {
            activation: dollars(fees.activation),
            monthlySubscription: dollars(fees.monthlySubscription ?? 0),
            oneTimeEval: dollars(fees.oneTimeEval),
            reset: dollars(fees.reset ?? fees.oneTimeEval),
            retry: fees.retry ?? RetryKind.Rebuy,
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
        profitTarget: dollars(options.profitTarget ?? 50),
    });
}

function k1PositionSizing(): PositionSizingConfig {
    const positionSizing = resolvePositionSizing(K1_INSTRUMENT, K1_STOP_POINTS);
    if (positionSizing === null) throw new Error('MNQ sizing did not resolve');
    return positionSizing;
}

function multiDayToyObjective(): RenewalCycleObjective {
    return buildObjective(
        jointToyPlan(
            { activation: 0, oneTimeEval: 10 },
            { evalDrawdownAmount: 200, profitTarget: 200 },
        ),
        0,
        20,
    );
}

function onlyAfterOneDay(value: number): (days: number) => number {
    return (days) => (days === 1 ? value : -100);
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
        'monthlySubscription=0, activation=A, every failed eval re-bought ' +
        'at F via RetryKind.Rebuy): closed form rho* = ' +
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
            'rebuyLagDays=%d converges to rho*=%s with F=10, A=0',
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
    'solveAverageRewardPolicy prices a failed eval at the D1 retry fee ' +
        '(N-12 and R1-2, DP half): the joint toy with a reset R cheaper ' +
        'than the eval fee F. After a failed eval the next attempt costs R, ' +
        'while a funded end is followed by a fresh purchase at F. Over one ' +
        'funded account: 1/p = 2 attempts costing F + R (the D1 cost per ' +
        'funded account), 2 * (1 + L) eval and lag days, 1 funded day and ' +
        'an expected $50 payout, so rho* = (50 - F - R) / (3 + 2L) = ' +
        '(25 - 0.5F - 0.5R) / (1.5 + L)',
    () => {
        const RETRY_FEES = {
            activation: 0,
            oneTimeEval: 10,
            reset: 4,
            retry: RetryKind.Reset,
        } as const;

        it.each([
            [0, 12],
            [3, 4],
        ])(
            'timeout failures: rebuyLagDays=%d converges to rho*=%s with F=10, R=4',
            (rebuyLagDays, expectedRho) => {
                const objective = buildObjective(
                    jointToyPlan(RETRY_FEES),
                    rebuyLagDays,
                );

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective),
                );

                expect(solution.status).toBe(RateSearchStatus.Converged);
                expect(solution.ratePerDay).toBeCloseTo(expectedRho, 6);
            },
        );

        it.each([0, 3])(
            'rebuyLagDays=%d: the rate is strictly above the same toy re-bought at F after every failure',
            (rebuyLagDays) => {
                const retryPlan = jointToyPlan(RETRY_FEES);
                const rebuyPlan = jointToyPlan({
                    ...RETRY_FEES,
                    retry: RetryKind.Rebuy,
                });
                const withRetry = solveAverageRewardPolicy(
                    buildConfig(buildObjective(retryPlan, rebuyLagDays)),
                );
                const rebuyEveryCycle = solveAverageRewardPolicy(
                    buildConfig(buildObjective(rebuyPlan, rebuyLagDays)),
                );

                expect(rebuyEveryCycle.ratePerDay).toBeCloseTo(
                    15 / (1.5 + rebuyLagDays),
                    6,
                );
                expect(withRetry.ratePerDay).toBeGreaterThan(
                    rebuyEveryCycle.ratePerDay + 0.5,
                );
            },
        );

        it.each([0, 3])(
            'rebuyLagDays=%d: the rate agrees with D1 replacementEconomics for the same toy',
            (rebuyLagDays) => {
                const plan = jointToyPlan(RETRY_FEES);
                const d1 = replacementEconomics({
                    discounts: undefined,
                    evalPassRate: 0.5,
                    fees: plan.fees,
                    meanDaysOnFail: 1,
                    meanDaysOnPass: 1,
                });
                const expectedPayoutPerFundedAccount = 0.5 * 100;
                const fundedDays = 1;
                const d1Rate =
                    (expectedPayoutPerFundedAccount - d1.costPerFundedAccount) /
                    (d1.daysPerFundedAccount +
                        d1.attemptsPerFundedAccount * rebuyLagDays +
                        fundedDays);

                const solution = solveAverageRewardPolicy(
                    buildConfig(buildObjective(plan, rebuyLagDays)),
                );

                expect(d1.costPerFundedAccount).toBe(14);
                expect(solution.ratePerDay).toBeCloseTo(d1Rate, 6);
            },
        );

        it.each([0, 3])(
            'bust failures (an eval drawdown of 50 dollars, so a losing 50-dollar bet busts): rebuyLagDays=%d converges to the same rho*, and simulate() with retries on the solved policies agrees',
            (rebuyLagDays) => {
                const plan = jointToyPlan(RETRY_FEES, {
                    evalDrawdownAmount: 50,
                });
                const objective = buildObjective(plan, rebuyLagDays);
                const expectedRho = (25 - 5 - 2) / (1.5 + rebuyLagDays);

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective),
                );

                expect(solution.status).toBe(RateSearchStatus.Converged);
                expect(solution.ratePerDay).toBeCloseTo(expectedRho, 6);

                const empirical = simulate({
                    evalDayPolicy: solution.evalResult.dayPolicy,
                    fundedDayPolicy: solution.fundedResult.dayPolicy,
                    fundedHorizonDays: FUNDED_HORIZON_DAYS,
                    maxAttempts: 1000,
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

                expect(empirical.expectedMonthlyNet).toBeCloseTo(
                    objective.monthlyRate(expectedRho),
                    -1,
                );
            },
        );
    },
);

describe('computeEvalStateValue terminalValueAtFail: the value of every eval failure terminal as a function of the failed attempt length in days (default 0)', () => {
    const TERMINAL_PASS = 1;

    function evalValue(
        plan: Plan,
        maxEvalDays: number,
        terminalValueAtFail?: (failedAttemptDays: number) => number,
    ): number {
        return computeEvalStateValue({
            ...EVAL_GRID,
            maxEvalDays,
            plan,
            rrRatio: RR_RATIO,
            terminalValueAtFail,
            terminalValueAtPass: TERMINAL_PASS,
            winrate: WINRATE,
        }).initialValue;
    }

    it('omitted and a constant 0 give the same value as before the field existed (0.5 on the timeout toy)', () => {
        const plan = jointToyPlan({ activation: 0, oneTimeEval: 10 });
        expect(evalValue(plan, MAX_EVAL_DAYS)).toBe(0.5);
        expect(evalValue(plan, MAX_EVAL_DAYS, () => 0)).toBe(0.5);
    });

    it('an eval-day-cap timeout after 1 day pays terminalValueAtFail(1): 0.5 * 1 + 0.5 * 0.2 = 0.6', () => {
        const plan = jointToyPlan({ activation: 0, oneTimeEval: 10 });
        expect(
            evalValue(plan, MAX_EVAL_DAYS, onlyAfterOneDay(0.2)),
        ).toBeCloseTo(0.6, 12);
    });

    it('an eval bust on day 0 pays terminalValueAtFail(1): 0.5 * 1 + 0.5 * 0.2 = 0.6 (a timeout-only change would give 0.5)', () => {
        const plan = jointToyPlan(
            { activation: 0, oneTimeEval: 10 },
            { evalDrawdownAmount: 50 },
        );
        expect(evalValue(plan, MAX_EVAL_DAYS, () => 0)).toBe(0.5);
        expect(
            evalValue(plan, MAX_EVAL_DAYS, onlyAfterOneDay(0.2)),
        ).toBeCloseTo(0.6, 12);
    });

    it('an inactivity breach on day 0 pays terminalValueAtFail(1): idling on day 0 with a 1-day idle limit is worth the full 10', () => {
        const plan = jointToyPlan(
            { activation: 0, oneTimeEval: 10 },
            { maxConsecutiveIdleDays: 1 },
        );
        expect(evalValue(plan, 3, onlyAfterOneDay(10))).toBe(10);
    });
});

describe(
    'solveAverageRewardPolicy keeps billing the subscription through a reset ' +
        '(a reset does not restart the monthly billing cycle in D1 or the ' +
        'simulator): the retry after a failed attempt of f days costs the ' +
        'reset plus the prorated S * f / 21 of the month that attempt used',
    () => {
        const SUBSCRIPTION_FEES = {
            activation: 0,
            monthlySubscription: 21,
            oneTimeEval: 0,
            reset: 4,
            retry: RetryKind.Reset,
        } as const;

        it.each([
            [0, 8],
            [3, 24 / 9],
        ])(
            'joint toy with S=21, R=4 and 1-day attempts: rebuyLagDays=%d converges to rho*=(50 - 21 - (4 + 1)) / (3 + 2L)=%s, not the 25 / (3 + 2L) of a reset that restarts the billing clock',
            (rebuyLagDays, expectedRho) => {
                const objective = buildObjective(
                    jointToyPlan(SUBSCRIPTION_FEES),
                    rebuyLagDays,
                );

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective),
                );

                expect(solution.status).toBe(RateSearchStatus.Converged);
                expect(solution.ratePerDay).toBeCloseTo(expectedRho, 6);
            },
        );

        it(
            'a TPT-like toy (S=170, R=99, no eval fee, about 4 attempts of ' +
                'several weeks per funded account): simulate() with retries on ' +
                'the solved policies lands within $12/month of the DP-predicted ' +
                'rate and passes its evals. The prorated reset billing is exact ' +
                'only on average over month residues, so the DP sits about ' +
                '$7/month above the simulator here; a reset that restarted the ' +
                'billing clock let the DP bust just before each month rolled ' +
                'over, predicting -$108/month for a policy that never passes ' +
                'and that the simulator scores at -$278/month',
            () => {
                const maxEvalDays = 60;
                const plan = jointToyPlan(
                    {
                        activation: 0,
                        monthlySubscription: 170,
                        oneTimeEval: 0,
                        reset: 99,
                        retry: RetryKind.Reset,
                    },
                    { evalDrawdownAmount: 100, profitTarget: 400 },
                );
                const objective = buildObjective(plan, 0, maxEvalDays);

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective),
                );
                const empirical = simulate({
                    evalDayPolicy: solution.evalResult.dayPolicy,
                    fundedDayPolicy: solution.fundedResult.dayPolicy,
                    fundedHorizonDays: FUNDED_HORIZON_DAYS,
                    maxAttempts: 1000,
                    maxEvalDays,
                    plan,
                    rebuyLagDays: 0,
                    riskPerTrade: 50,
                    rrRatio: RR_RATIO,
                    seed: 42,
                    tradesPerDay: 1,
                    trials: 100_000,
                    winrate: 0.5,
                });

                expect(solution.status).toBe(RateSearchStatus.Converged);
                expect(empirical.evalPassProbability).toBeGreaterThan(0.99);
                expect(
                    Math.abs(
                        objective.monthlyRate(solution.ratePerDay) -
                            empirical.expectedMonthlyNet,
                    ),
                ).toBeLessThan(12);
            },
            600_000,
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
                "best flat/percent candidate's expectedMonthlyNet, every " +
                'candidate placed in whole MNQ micros at a 12.5 point stop ' +
                '($25 each, T33: percent-of-cushion needs a stop, and each ' +
                'flat candidate is a whole number of contracts, at least ' +
                'one, so it trades exactly as before), ' +
                "measured both by the DP's own solved rate AND by " +
                "simulate()'s empirical monthly net driven by the exact " +
                'same policy, the same double check the original K1 ' +
                'harness applied',
            () => {
                const contractRisk = oneContractRisk(k1PositionSizing());
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
                for (const risk of flatCandidates) {
                    expect(Number.isSafeInteger(risk / contractRisk)).toBe(
                        true,
                    );
                    expect(risk).toBeGreaterThanOrEqual(contractRisk);
                }

                let bestFlatMonthlyNet = -Infinity;
                for (const evalRisk of flatCandidates) {
                    for (const fundedRisk of flatCandidates) {
                        const out = simulate({
                            fundedHorizonDays,
                            fundedRiskPerTrade: fundedRisk,
                            instrument: K1_INSTRUMENT,
                            maxEvalDays,
                            plan,
                            rebuyLagDays,
                            riskPerTrade: evalRisk,
                            rrRatio,
                            seed,
                            stopPoints: K1_STOP_POINTS,
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
                        instrument: K1_INSTRUMENT,
                        maxEvalDays,
                        plan,
                        rebuyLagDays,
                        riskPerTrade: 250,
                        rrRatio,
                        seed,
                        stopPoints: K1_STOP_POINTS,
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

describe(
    'DP and simulator agree on eval-day-cap timeouts (T29): both follow D1 ' +
        'and retry every failed eval at the retry fee, timeouts included',
    () => {
        it(
            'timeout toy (F=10, R=4, L=0): the DP solves to 12 per day and ' +
                'simulate() on the same policies with retries allowed earns ' +
                'the same 12 per day, (50 - 10 - 4) / 3: every cycle ends ' +
                'funded with an expected $50 payout after one expected $4 ' +
                'reset, over 2 expected eval days and 1 funded day, not the ' +
                'fresh-purchase rate 15 / 1.5 = 10 per day',
            () => {
                const plan = jointToyPlan({
                    activation: 0,
                    oneTimeEval: 10,
                    reset: 4,
                    retry: RetryKind.Reset,
                });
                const objective = buildObjective(plan, 0);

                const solution = solveAverageRewardPolicy(
                    buildConfig(objective),
                );
                const empirical = simulate({
                    evalDayPolicy: solution.evalResult.dayPolicy,
                    fundedDayPolicy: solution.fundedResult.dayPolicy,
                    fundedHorizonDays: FUNDED_HORIZON_DAYS,
                    maxAttempts: 1000,
                    maxEvalDays: MAX_EVAL_DAYS,
                    plan,
                    rebuyLagDays: 0,
                    riskPerTrade: 50,
                    rrRatio: RR_RATIO,
                    seed: 42,
                    tradesPerDay: 1,
                    trials: 100_000,
                    winrate: 0.5,
                });

                expect(solution.ratePerDay).toBeCloseTo(12, 6);
                expect(empirical.timeoutProbability).toBe(0);
                expect(empirical.expectedAttempts).toBeCloseTo(2, 1);
                expect(empirical.expectedMonthlyNet).toBeCloseTo(
                    objective.monthlyRate(solution.ratePerDay),
                    -1,
                );
                expect(
                    Math.abs(
                        empirical.expectedMonthlyNet -
                            objective.monthlyRate(10),
                    ),
                ).toBeGreaterThan(20);
            },
            600_000,
        );
    },
);

describe('solveAverageRewardPolicy convergence', () => {
    it(
        'does not stop after the first conservative step h / tMax just because that step is under the rate tolerance: ' +
            'the re-bought toy at F=14 has h(0) = 25 - 14 = 11 and tMax = 253, a first step of 0.043 per day, ' +
            'while rho* = (25 - 14) / 1.5',
        () => {
            const plan = jointToyPlan({ activation: 0, oneTimeEval: 14 });

            const solution = solveAverageRewardPolicy(
                buildConfig(buildObjective(plan, 0)),
            );

            expect(solution.status).toBe(RateSearchStatus.Converged);
            expect(solution.ratePerDay).toBeCloseTo(11 / 1.5, 6);
        },
    );
});

describe('solveAverageRewardPolicy solve budget: the rate search from rate 0 on a multi-day joint toy (F=10, A=0, L=0, $200 eval drawdown and target, 20-day eval cap, $50 to $200 eval bets), whose eval policy changes with the rate, so h is convex and nonlinear and the search needs 7 solves', () => {
    const RATE_TOLERANCE_PER_DAY = 0.05;
    const ROOT_ROUNDING_DOLLARS = 1e-9;
    const MULTI_DAY_TOY_SOLVES = 7;

    function solveToy(maxSolves: number) {
        return solveAverageRewardPolicy(
            buildConfig(multiDayToyObjective(), {
                evalGrid: { ...EVAL_GRID, maxActionDollars: 200 },
                maxSolves,
                rateTolerancePerDay: RATE_TOLERANCE_PER_DAY,
                startRatePerDay: 0,
            }),
        );
    }

    it(`converges in ${MULTI_DAY_TOY_SOLVES} solves, so every cap from 2 to 6 below cuts a search that is still running`, () => {
        const solution = solveToy(MAX_SOLVES);

        expect(solution.status).toBe(RateSearchStatus.Converged);
        expect(solution.trace).toHaveLength(MULTI_DAY_TOY_SOLVES);
    });

    it.each([2, 3, 4, 5, 6])(
        'the trace at maxSolves %d stops at the cap and is the prefix of the trace at maxSolves + 4, so the cap truncates the path and never alters it',
        (maxSolves) => {
            const capped = solveToy(maxSolves);
            const longer = solveToy(maxSolves + 4).trace;

            expect(capped.status).toBe(RateSearchStatus.SolveCapReached);
            expect(capped.trace).toHaveLength(maxSolves);
            expect(capped.trace).toEqual(longer.slice(0, maxSolves));
        },
    );

    it('approaches the root from one side over the whole path: every trace point has cycleValue >= 0 (up to float rounding at the root), h falls strictly at every step, and every step moves the rate up', () => {
        const { status, trace } = solveToy(MAX_SOLVES);

        expect(status).toBe(RateSearchStatus.Converged);
        expect(trace[0]?.ratePerDay).toBe(0);
        for (const point of trace) {
            expect(point.cycleValue).toBeGreaterThanOrEqual(
                -ROOT_ROUNDING_DOLLARS,
            );
        }
        for (const [index, point] of trace.entries()) {
            const previous = trace[index - 1];
            if (previous === undefined) continue;
            expect(point.ratePerDay).toBeGreaterThan(previous.ratePerDay);
            expect(point.cycleValue).toBeLessThan(previous.cycleValue);
        }
    });

    it('the cap lags by exactly one solve: maxSolves n - 1 reaches the cap and n converges, with the final step or the last point rate bounds within the rate tolerance', () => {
        const needed = solveToy(MAX_SOLVES).trace.length;
        const objective = multiDayToyObjective();
        const underBudget = solveToy(needed - 1);
        const atBudget = solveToy(needed);
        const last = atBudget.trace.at(-1);
        const previous = atBudget.trace.at(-2);
        if (last === undefined || previous === undefined) {
            throw new Error('expected at least two trace points');
        }
        const finalStep = Math.abs(last.ratePerDay - previous.ratePerDay);
        const lastBoundsWidth =
            Math.abs(last.cycleValue) *
            (1 / objective.minCycleDays() -
                1 / objective.maxExpectedCycleDays());

        expect(underBudget.status).toBe(RateSearchStatus.SolveCapReached);
        expect(underBudget.trace).toHaveLength(needed - 1);
        expect(atBudget.status).toBe(RateSearchStatus.Converged);
        expect(atBudget.trace).toHaveLength(needed);
        expect(Math.min(finalStep, lastBoundsWidth)).toBeLessThanOrEqual(
            RATE_TOLERANCE_PER_DAY,
        );
    });
});

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
