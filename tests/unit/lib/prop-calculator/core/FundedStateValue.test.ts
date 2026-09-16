import { describe, expect, it } from 'vitest';

import {
    computeEvalStateValue,
    computeFundedStateValue,
    createInitialState,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    isFundedDpEligible,
    lifetimeExpectedNet,
    MffuVariant,
    type Plan,
    points,
    replacementEconomics,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { simulate } from '~/lib/prop-calculator/simulator';

function onePayoutToyPlan(): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        isInstantFunded: true,
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

function tinySoloActionConfig(plan: Plan) {
    return {
        actionStepMultiple: 1,
        maxActionMultiple: 1,
        maxCushionMultiple: 1,
        maxPreLockOffsetMultiple: 0.5,
        payoutRegimeCap: 0,
        plan,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.5,
    };
}

describe(
    'computeFundedStateValue terminal-value formula — regression: must not ' +
        "double-count Replacement.ts's costPerFundedAccount",
    () => {
        it(
            'bustTerminalValue is exactly evalInitialValue - feePerAttempt, per ' +
                "the plan's V(bust_funded) = -feePerAttempt + V_eval(initial) " +
                "recursion — never evalInitialValue minus Replacement.ts's " +
                'costPerFundedAccount, which already bakes in the 1/passRate ' +
                "expected-retry-count that this DP's own recursion reproduces " +
                'on its own; plugging in both would double-count the same ' +
                'retry loop, which is why costPerFundedAccount (computed here ' +
                'from a realistic sub-1 passRate) is strictly larger than the ' +
                'single-attempt feePerAttempt this formula actually uses',
            () => {
                const plan = rapidEodPlan();
                const evalInitialValue = 20_000;
                const feePerAttempt = plan.fees.reset;

                const result = computeFundedStateValue({
                    ...tinySoloActionConfig(plan),
                    evalInitialValue,
                    feePerAttempt,
                });

                expect(result.bustTerminalValue).toBe(
                    evalInitialValue - feePerAttempt,
                );

                const wrongDoubleCountedCost = replacementEconomics({
                    evalPrice: feePerAttempt,
                    meanDaysOnFail: 10,
                    meanDaysOnPass: 20,
                    passRate: 0.4,
                }).costPerFundedAccount;

                expect(wrongDoubleCountedCost).toBeGreaterThan(feePerAttempt);
                expect(result.bustTerminalValue).not.toBe(
                    evalInitialValue - wrongDoubleCountedCost,
                );
            },
        );

        it(
            'the same regression holds at bustTerminalValue = 0 (evalInitialValue ' +
                'exactly equal to feePerAttempt), the boundary case most likely ' +
                'to silently pass a broken formula by coincidence',
            () => {
                const plan = rapidEodPlan();
                const feePerAttempt = plan.fees.reset;

                const result = computeFundedStateValue({
                    ...tinySoloActionConfig(plan),
                    evalInitialValue: feePerAttempt,
                    feePerAttempt,
                });

                expect(result.bustTerminalValue).toBe(0);
            },
        );
    },
);

describe(
    'computeFundedStateValue vs simulate() — full simulate()-level ' +
        'integration test (a hand-designed, one-payout-and-conclude toy ' +
        'funded plan with a single trade/day and a single action size, so ' +
        "the DP's own predicted V(initial) is exactly hand-computable: " +
        'winrate 0.5 at 1:2 risk:reward from a $1,000 account with a $100 ' +
        "trailing drawdown either locks-and-pays-out $100 profit's worth " +
        '(reached via one win) or drops to a $50 cushion (no bust yet) and ' +
        'must recover over further days; V(initial) = winrate * (grossPayout ' +
        'on lock) + (1-winrate) * V(recovery state), which this test proves ' +
        "matches simulate()'s own empirical outcome within Monte Carlo " +
        'tolerance when the DP-computed dayPolicy drives the real funded-day ' +
        'loop end to end',
    () => {
        it(
            "computeFundedStateValue's V(initial) for the one-payout toy " +
                'exactly equals the hand-computable closed form (0.5*100 + ' +
                '0.5*0 = 50, since a win locks-and-pays-out $100 immediately ' +
                "and a loss's cushion=50 state has zero further reachable " +
                'value at this tiny grid resolution)',
            () => {
                const plan = onePayoutToyPlan();
                expect(isFundedDpEligible(plan)).toBe(true);

                const result = computeFundedStateValue({
                    actionStepMultiple: 1,
                    cushionStepMultiple: 1,
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    maxActionMultiple: 1,
                    plan,
                    rrRatio: 2,
                    tradesPerDay: 1,
                    winrate: 0.5,
                });

                expect(result.initialValue).toBeCloseTo(50, 10);
                expect(result.bustTerminalValue).toBe(0);

                const risk = result.dayPolicy.computeRisk?.(
                    plan.initialState(),
                    0,
                );
                expect(risk).toBe(100);
            },
        );

        it(
            "a real simulate() run driven end-to-end by the DP's own " +
                'dayPolicy reproduces V(initial)=50 empirically: expected ' +
                'gross payout plus bust-probability-weighted bustTerminalValue ' +
                'matches the DP prediction within Monte Carlo tolerance at ' +
                '50,000 trials',
            () => {
                const plan = onePayoutToyPlan();
                const result = computeFundedStateValue({
                    actionStepMultiple: 1,
                    cushionStepMultiple: 1,
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    maxActionMultiple: 1,
                    plan,
                    rrRatio: 2,
                    tradesPerDay: 1,
                    winrate: 0.5,
                });

                const out = simulate({
                    fundedDayPolicy: result.dayPolicy,
                    fundedHorizonDays: 200,
                    maxEvalDays: 1,
                    plan,
                    riskPerTrade: 100,
                    rrRatio: 2,
                    seed: 7,
                    tradesPerDay: 1,
                    trials: 50_000,
                    winrate: 0.5,
                });

                const empiricalValue =
                    out.expectedGrossPayout +
                    out.fundedBustProbability * result.bustTerminalValue;

                expect(empiricalValue).toBeCloseTo(result.initialValue, 0);
            },
            15_000,
        );
    },
);

describe(
    'computeFundedStateValue vs Part K1 — the DP must never underperform ' +
        "the best flat/percentage-of-cushion policy K1's own " +
        'lifetimeExpectedNet sweep finds, since a state-aware policy is a ' +
        'strict superset of a fixed policy (a fixed policy is a state-aware ' +
        'one that happens to ignore state)',
    () => {
        it(
            'MFF Rapid EOD 50K: the DP-driven funded policy (fed a ' +
                "self-consistent evalInitialValue from L1's own eval DP, " +
                "reusing L1's validated V_eval per the plan's sequencing " +
                "note) beats K1's best flat-$/percent-of-cushion candidate " +
                "by a wide margin, measured both by the DP's own predicted " +
                "value AND by simulate()'s empirical, renewal-adjusted " +
                'lifetime value driven by the exact same policy — this ' +
                'double check (not trusting the DP math in isolation) is ' +
                "the same discipline L1's own validation harness applied",
            () => {
                const plan = rapidEodPlan();
                const rrRatio = 2;
                const winrate = 0.4;
                const tradesPerDay = 4;
                const maxEvalDays = 30;
                const feePerAttempt = plan.fees.reset;

                const flatCandidates = [200, 250, 300, 400];
                const percentCandidates = [0.05, 0.075, 0.1, 0.15];
                let bestK1 = -Infinity;
                for (const dollarRisk of flatCandidates) {
                    const out = simulate({
                        fundedHorizonDays: 250,
                        fundedRiskPerTrade: dollarRisk,
                        maxEvalDays,
                        plan,
                        riskPerTrade: 250,
                        rrRatio,
                        seed: 42,
                        tradesPerDay,
                        trials: 8000,
                        winrate,
                    });
                    const lifetimeNet = lifetimeExpectedNet({
                        costOfOneMoreAttempt: plan.feesUntilPass(
                            out.expectedDaysToPass,
                        ),
                        expectedNet: out.expectedNet,
                        fundedBustProbability: out.fundedBustProbability,
                    });
                    bestK1 = Math.max(bestK1, lifetimeNet);
                }
                for (const percent of percentCandidates) {
                    const out = simulate({
                        fundedCushionPercent: fraction(percent),
                        fundedHorizonDays: 250,
                        maxEvalDays,
                        plan,
                        riskPerTrade: 250,
                        rrRatio,
                        seed: 42,
                        tradesPerDay,
                        trials: 8000,
                        winrate,
                    });
                    const lifetimeNet = lifetimeExpectedNet({
                        costOfOneMoreAttempt: plan.feesUntilPass(
                            out.expectedDaysToPass,
                        ),
                        expectedNet: out.expectedNet,
                        fundedBustProbability: out.fundedBustProbability,
                    });
                    bestK1 = Math.max(bestK1, lifetimeNet);
                }

                let guessEvalInitialValue = 0;
                let fundedResult: ReturnType<typeof computeFundedStateValue> =
                    computeFundedStateValue({
                        actionStepMultiple: 0.1,
                        evalInitialValue: 0,
                        feePerAttempt,
                        maxActionMultiple: 0.3,
                        plan,
                        rrRatio,
                        tradesPerDay,
                        winrate,
                    });
                let evalResult: ReturnType<typeof computeEvalStateValue> =
                    computeEvalStateValue({
                        actionStepDollars: 100,
                        cushionStepDollars: 200,
                        maxEvalDays,
                        plan,
                        profitStepDollars: 600,
                        rrRatio,
                        terminalValueAtPass: 0,
                        tradesPerDay,
                        winrate: fraction(winrate),
                    });
                for (let iteration = 0; iteration < 12; iteration++) {
                    evalResult = computeEvalStateValue({
                        actionStepDollars: 100,
                        cushionStepDollars: 200,
                        maxEvalDays,
                        plan,
                        profitStepDollars: 600,
                        rrRatio,
                        terminalValueAtPass: guessEvalInitialValue,
                        tradesPerDay,
                        winrate: fraction(winrate),
                    });
                    fundedResult = computeFundedStateValue({
                        actionStepMultiple: 0.1,
                        evalInitialValue: evalResult.initialValue,
                        feePerAttempt,
                        maxActionMultiple: 0.3,
                        plan,
                        rrRatio,
                        tradesPerDay,
                        winrate,
                    });
                    guessEvalInitialValue = fundedResult.initialValue;
                }

                expect(fundedResult.initialValue).toBeGreaterThan(bestK1);

                const empiricalOut = simulate({
                    evalDayPolicy: evalResult.dayPolicy,
                    fundedDayPolicy: fundedResult.dayPolicy,
                    fundedHorizonDays: 3000,
                    maxEvalDays,
                    plan,
                    riskPerTrade: 250,
                    rrRatio,
                    seed: 42,
                    tradesPerDay,
                    trials: 12_000,
                    winrate,
                });
                const empiricalLifetimeNet = lifetimeExpectedNet({
                    costOfOneMoreAttempt: feePerAttempt,
                    expectedNet: empiricalOut.expectedNet,
                    fundedBustProbability: empiricalOut.fundedBustProbability,
                });

                expect(empiricalLifetimeNet).toBeGreaterThan(bestK1);
            },
            60_000,
        );
    },
);

describe(
    "computeFundedStateValue vs TopStep's tiered fundedMinis ContractLimits " +
        "— the one documented break in scale invariance: bestActionAt's " +
        'candidateRisks must never choose a risk that implies more ' +
        'contracts than the $0/$1,500/$2,000 profit tier allows, end to ' +
        "end through the DP's own solved policy table, not just through " +
        'resolveContractLimit/capRiskToContractLimit in isolation (already ' +
        'covered by ContractLimits.test.ts)',
    () => {
        it(
            "the DP's chosen risk at each tier never implies more " +
                'contracts than that tier permits (2 below $1,500 profit, ' +
                '3 from $1,500, 5 from $2,000), using a stop-loss small ' +
                'enough ($100/contract) that the contract tier, not the ' +
                'cushion, is the binding constraint at every tested profit ' +
                'level',
            () => {
                const plan = new TopStep().plans[0];
                if (!plan) throw new Error('No TopStep plan registered');
                expect(isFundedDpEligible(plan)).toBe(true);

                const riskPerContract = 100;
                const result = computeFundedStateValue({
                    actionStepMultiple: 0.5,
                    cushionStepMultiple: 0.25,
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    maxActionMultiple: 3,
                    payoutRegimeCap: 0,
                    plan,
                    positionSizing: {
                        instrument: INSTRUMENTS[InstrumentSymbol.ES],
                        stopPoints: points(2),
                    },
                    rrRatio: 2,
                    tradesPerDay: 1,
                    winrate: 0.5,
                });

                const tiers = [
                    { maxContracts: 2, profit: 500 },
                    { maxContracts: 3, profit: 1500 },
                    { maxContracts: 5, profit: 2000 },
                ];
                for (const { maxContracts, profit } of tiers) {
                    const state = createInitialState(
                        plan.accountSize,
                        plan.accountSize,
                    );
                    state.thresholdLocked = true;
                    state.balance = plan.accountSize + profit;

                    const risk = result.dayPolicy.computeRisk?.(state, 0);
                    expect(risk).toBeDefined();
                    expect(risk ?? 0).toBeLessThanOrEqual(
                        maxContracts * riskPerContract + 1e-6,
                    );
                }

                const topTierState = createInitialState(
                    plan.accountSize,
                    plan.accountSize,
                );
                topTierState.thresholdLocked = true;
                topTierState.balance = plan.accountSize + 2000;
                const topTierRisk = result.dayPolicy.computeRisk?.(
                    topTierState,
                    0,
                );
                expect(topTierRisk ?? 0).toBeGreaterThan(0);
            },
        );
    },
);

describe('isFundedDpEligible scope cut', () => {
    it(
        'fails loud instead of silently computing a wrong policy for a ' +
            'plan whose funded daily loss limit depends on peak-day-close ' +
            'profit',
        () => {
            const plan = rapidEodPlan().withOverrides({
                fundedDailyLossLimit: {
                    kind: DailyLossLimitKind.PeakProfitShare,
                    share: fraction(0.5),
                },
            });
            expect(isFundedDpEligible(plan)).toBe(false);
            expect(() =>
                computeFundedStateValue({
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    plan,
                    rrRatio: 2,
                    winrate: 0.4,
                }),
            ).toThrow(/not eligible/);
        },
    );
});
