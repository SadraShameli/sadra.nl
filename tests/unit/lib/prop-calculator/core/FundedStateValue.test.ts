import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    computeEvalStateValue,
    computeFundedStateValue,
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    createInitialState,
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    findRegistryPlanId,
    FirmId,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    isFundedDpEligible,
    lifetimeExpectedNet,
    MffuVariant,
    PayoutFloorEffect,
    type Plan,
    points,
    replacementEconomics,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { simulate } from '~/lib/prop-calculator/simulator';

function consistencyToyPlan(rule: ConsistencyRule | null): Plan {
    return onePayoutToyPlan().withOverrides({
        fundedConsistency: { kind: 'set', rule },
    });
}

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

function rapidPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Rapid,
    });
    if (!plan) throw new Error('MFF Rapid 50K plan not found');
    return plan;
}

function secondTradeRisk(plan: Plan, todayPnL: number): number {
    const result = computeFundedStateValue({
        actionStepMultiple: 0.25,
        cushionStepMultiple: 1,
        cycleBestDayBucketCount: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        payoutRegimeCap: 0,
        plan,
        positionSizing: {
            instrument: INSTRUMENTS[InstrumentSymbol.NQ],
            stopPoints: points(1.25),
        },
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: 0.5,
    });
    const state = createInitialState(plan.accountSize, plan.accountSize);
    state.balance = plan.accountSize + 350;
    state.threshold = plan.accountSize;
    state.thresholdLocked = true;
    state.todayPnL = todayPnL;
    return result.dayPolicy.computeRisk?.(state, 1) ?? 0;
}

function tieredContractToyPlan(isEffectiveNextSession: boolean): Plan {
    return onePayoutToyPlan().withOverrides({
        contractLimits: {
            evalMicros: contracts(10),
            evalMinis: contracts(1),
            fundedMicros: null,
            fundedMinis: {
                ...(isEffectiveNextSession && { isEffectiveNextSession }),
                kind: ContractLimitKind.Tiered,
                tiers: [
                    { maxContracts: contracts(1), minBalance: dollars(0) },
                    { maxContracts: contracts(4), minBalance: dollars(300) },
                ],
            },
        },
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(ConsistencyScope.Funded, fraction(1)),
        },
    });
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
            2_700_000,
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
                    minRetainedCushion: plan.fundedDrawdown.amount,
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

describe(
    'computeFundedStateValue vs a funded contract cap opted into the day-' +
        "start-frozen tier (isEffectiveNextSession): the DP's own day tree " +
        'must size its second trade off the profit the day opened at, not ' +
        'the profit accrued so far within that same day. The toy carries a ' +
        'never-violated funded consistency rule (share 1.0) purely to put ' +
        'the solver on its cushion-at-day-start-tracking path, which is the ' +
        'only path where the DP distinguishes day-start state from live ' +
        'state at all',
    () => {
        const DAY_START_TIER_RISK = 25;
        const LIVE_TIER_RISK = 100;

        it(
            'a plan that has not opted in keeps sizing its second trade off ' +
                'live profit ($300 cushion at a $1,000 locked threshold = ' +
                'the 4-contract tier, $100 of risk at $25/contract), ' +
                'unchanged by the new day-start argument',
            () => {
                expect(secondTradeRisk(tieredContractToyPlan(false), 150)).toBe(
                    LIVE_TIER_RISK,
                );
            },
        );

        it(
            'an opted-in plan sizes the same second trade off the profit ' +
                'the day opened at ($200, the 1-contract tier) even though ' +
                "the day's first trade has already carried live profit into " +
                'the 4-contract tier',
            () => {
                const frozen = secondTradeRisk(
                    tieredContractToyPlan(true),
                    150,
                );
                expect(frozen).toBeLessThanOrEqual(DAY_START_TIER_RISK);
                expect(frozen).toBeLessThan(LIVE_TIER_RISK);
            },
        );

        it(
            'an opted-in plan is frozen at the day-start tier, not pinned to ' +
                'the bottom tier: with a flat day so far (todayPnL 0) the ' +
                'day-start profit is the live profit and the 4-contract tier ' +
                'applies again',
            () => {
                expect(secondTradeRisk(tieredContractToyPlan(true), 0)).toBe(
                    LIVE_TIER_RISK,
                );
            },
        );
    },
);

describe('isFundedDpEligible scope cut', () => {
    it(
        'refuses a plan whose funded daily loss limit terminates the account, ' +
            'because the DP builds every synthetic state with todayPnL 0 and so ' +
            'cannot see a daily-loss breach at all — returning a value computed ' +
            'under a rule it cannot model would understate the risk silently',
        () => {
            const soft = rapidEodPlan().withOverrides({
                fundedDailyLossLimit: {
                    amount: dollars(1000),
                    kind: DailyLossLimitKind.Flat,
                },
            });
            expect(isFundedDpEligible(soft)).toBe(true);

            const hard = soft.withOverrides({
                fundedDailyLossLimitBreach:
                    DailyLossLimitBreachEffect.Terminate,
            });
            expect(isFundedDpEligible(hard)).toBe(false);
        },
    );

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

    it(
        'a real, currently idle-limited funded plan (MFF Rapid EOD 50K, ' +
            'maxConsecutiveIdleDays=7) is DP-eligible — isFundedDpEligible ' +
            'never excluded on maxConsecutiveIdleDays to begin with (it ' +
            'only checks drawdown kind, the peak-share daily-loss-limit ' +
            'dependency, and whether the plan has a funded drawdown lock ' +
            'or a ReleaseFloor payout floor effect), so this pins ' +
            'idle-limited plans as eligible while confirming the other ' +
            'exclusion categories (peak-share DLL, covered by the ' +
            "scope-cut case above; MFF Rapid's IntradayTrailingDrawdown " +
            'funded drawdown; and a lock-less, non-ReleaseFloor funded ' +
            'drawdown) all stay excluded, independent of ' +
            'maxConsecutiveIdleDays',
        () => {
            const idleLimitedPlan = rapidEodPlan();
            expect(idleLimitedPlan.maxConsecutiveIdleDays).not.toBeNull();
            expect(isFundedDpEligible(idleLimitedPlan)).toBe(true);

            expect(isFundedDpEligible(rapidPlan())).toBe(false);

            const noLockNoReleaseFloorPlan = rapidEodPlan().withOverrides({
                fundedDrawdown: new EodTrailingDrawdown({
                    amount: dollars(2000),
                }),
            });
            expect(
                noLockNoReleaseFloorPlan.fundedDrawdown.lock,
            ).toBeUndefined();
            expect(noLockNoReleaseFloorPlan.payoutFloorEffect).toBe(
                PayoutFloorEffect.None,
            );
            expect(isFundedDpEligible(noLockNoReleaseFloorPlan)).toBe(false);
        },
    );
});

describe('idle-days DP state dimension', () => {
    it(
        'plans without maxConsecutiveIdleDays set are byte-for-byte ' +
            'unaffected by the idle-days dimension: the one-payout toy ' +
            '(winrate 0.5, feePerAttempt 0) was measured against the ' +
            'unmodified pre-idle-days engine at initialValue=50, ' +
            'reachedStateCount=105, risk@0=100 (matching the existing ' +
            'hand-derived one-payout toy case above) — asserting those ' +
            'exact, previously-measured figures here pins the ' +
            'post-change engine to produce identical output for every ' +
            'plan that never sets the field',
        () => {
            const plan = onePayoutToyPlan().withOverrides({
                maxConsecutiveIdleDays: undefined,
            });
            expect(plan.maxConsecutiveIdleDays).toBeNull();

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
            expect(result.reachedStateCount).toBe(105);

            const risk = result.dayPolicy.computeRisk?.(plan.initialState(), 0);
            expect(risk).toBe(100);
        },
    );

    it(
        'the one-payout toy (winrate 0.1, a single $100 trade at 1:2 ' +
            'either locks-and-pays-out $100 and immediately concludes the ' +
            'account, hand-verified to be exactly $100 regardless of ' +
            'winrate/bustTerminalValue since isAccountConcluded short ' +
            'circuits before any further continuation, or drops the ' +
            'cushion to exactly 0 and busts, worth bustTerminalValue=-200 ' +
            'from feePerAttempt=200) makes trading a real expected loss: ' +
            'V(trade) = 0.1*100 + 0.9*(-200) = -170. An idle-blind engine ' +
            "has no way to ever bust from idling — its 'stay idle forever' " +
            'action is a pure zero-reward self-loop from the initial ' +
            'value-iteration seed of 0 — so it reports idling as strictly ' +
            'better than trading (0 > -170) and picks it, hand-verified ' +
            'directly below by clearing maxConsecutiveIdleDays to null on ' +
            'the identical config. But maxConsecutiveIdleDays=1 busts on ' +
            'the very first idle day (worth the same bustTerminalValue, ' +
            '-200, which is worse than trading), so the real engine is ' +
            'forced to trade instead: V(initial) = -170, a real, ' +
            'materially worse expected loss the old idle-blind DP would ' +
            'have completely missed by reporting the impossible-in-practice ' +
            'V=0',
        () => {
            const idleBlindPlan = onePayoutToyPlan().withOverrides({
                maxConsecutiveIdleDays: undefined,
            });
            expect(idleBlindPlan.maxConsecutiveIdleDays).toBeNull();
            const idleBlindResult = computeFundedStateValue({
                actionStepMultiple: 1,
                cushionStepMultiple: 1,
                evalInitialValue: 0,
                feePerAttempt: dollars(200),
                maxActionMultiple: 1,
                plan: idleBlindPlan,
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0.1,
            });
            expect(idleBlindResult.bustTerminalValue).toBe(-200);
            expect(idleBlindResult.initialValue).toBeCloseTo(0, 10);
            expect(
                idleBlindResult.dayPolicy.computeRisk?.(
                    idleBlindPlan.initialState(),
                    0,
                ),
            ).toBe(0);

            const plan = onePayoutToyPlan().withOverrides({
                maxConsecutiveIdleDays: 1,
            });
            expect(plan.maxConsecutiveIdleDays).toBe(1);
            const result = computeFundedStateValue({
                actionStepMultiple: 1,
                cushionStepMultiple: 1,
                evalInitialValue: 0,
                feePerAttempt: dollars(200),
                maxActionMultiple: 1,
                plan,
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0.1,
            });

            expect(result.bustTerminalValue).toBe(-200);
            expect(result.initialValue).toBeCloseTo(-170, 10);
            expect(result.initialValue).toBeLessThan(
                idleBlindResult.initialValue,
            );

            const risk = result.dayPolicy.computeRisk?.(plan.initialState(), 0);
            expect(risk).toBe(100);
        },
    );
});

describe('cycleBestDayProfit DP state dimension', () => {
    it(
        'zero-regression: MFF Rapid EOD 50K (no funded consistency rule — ' +
            'plan.fundedConsistencyRule() is null) is byte-for-byte ' +
            'unaffected by the new cycleBestDayProfit dimension — measured ' +
            'directly against the pre-fix engine (git HEAD at the time of ' +
            'this change) by literally swapping in its FundedStateValue.ts, ' +
            'rerunning this exact config standalone, and pinning the real ' +
            'observed output: initialValue=29505.52018082788, ' +
            'reachedStateCount=19698, and the exported policy chooses ' +
            'identical risk at every (tradeIndex, payoutsIssued) ' +
            'combination checked below — because isViolated is never even ' +
            'called when fundedConsistencyRule() is null (short-circuited ' +
            'by `!consistency?.isViolated(...)`), the tracked ' +
            'cycleBestDayProfit value can never influence this plan',
        () => {
            const plan = rapidEodPlan();
            expect(plan.fundedConsistencyRule()).toBeNull();

            const result = computeFundedStateValue({
                actionStepMultiple: 0.1,
                evalInitialValue: 20_000,
                feePerAttempt: plan.fees.reset,
                maxActionMultiple: 0.3,
                plan,
                rrRatio: 2,
                tradesPerDay: 4,
                winrate: 0.4,
            });

            expect(result.initialValue).toBeCloseTo(29_505.52018082788, 6);
            expect(result.reachedStateCount).toBe(19_698);

            const state = plan.initialState();
            const expectedRisksByPayoutsIssued = [
                [200, 0, 0, 0],
                [200, 0, 0, 0],
                [200, 0, 0, 0],
            ];
            for (const [
                payoutsIssued,
                expectedRisks,
            ] of expectedRisksByPayoutsIssued.entries()) {
                for (const [
                    tradeIndex,
                    expectedRisk,
                ] of expectedRisks.entries()) {
                    expect(
                        result.dayPolicy.computeRisk?.(
                            state,
                            tradeIndex,
                            payoutsIssued,
                        ),
                    ).toBe(expectedRisk);
                }
            }
        },
    );

    it(
        "hand-verified boundary proof that the fix's isViolated check is " +
            'real, not a no-op: a one-payout toy (win locks-and-would-pay-' +
            'out a same-day $100 profit — a 100%-concentrated cycle, ' +
            'bestDayProfit === cycleProfit === 200 exactly, hand-traced ' +
            "from the plan's own $100 drawdown/action/rr=2 setup) sits " +
            'exactly on a consistency-share boundary: ' +
            'isViolated(200,200) = 200/200=1.0 > maxBestDayShare. At ' +
            'maxBestDayShare=1.0, 1.0 > 1.0 is false (never violated), so ' +
            'the day-1 payout is allowed exactly as in the no-rule ' +
            'baseline — initialValue must come out byte-identical to the ' +
            'no-rule case (50, from the existing one-payout-toy test ' +
            'above). At maxBestDayShare=0.9999, the identical trade path ' +
            'now has 1.0 > 0.9999 (violated), so the DP is forced to deny ' +
            'the day-1 payout and continue — a real, hand-predicted ' +
            'behavior change that an unfixed engine (bestDayProfit ' +
            'hardcoded to 0, so isViolated(0, x) is always false) could ' +
            'never produce for any maxBestDayShare',
        () => {
            const baseline = consistencyToyPlan(null);
            const config = {
                actionStepMultiple: 1,
                cushionStepMultiple: 1,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0.5,
            };
            const baselineResult = computeFundedStateValue({
                ...config,
                plan: baseline,
            });
            expect(baselineResult.initialValue).toBeCloseTo(50, 10);

            const neverViolatedPlan = consistencyToyPlan(
                new ConsistencyRule(ConsistencyScope.Funded, fraction(1)),
            );
            const neverViolatedResult = computeFundedStateValue({
                ...config,
                plan: neverViolatedPlan,
            });
            expect(neverViolatedResult.initialValue).toBeCloseTo(50, 10);

            const alwaysViolatedOnDayOnePlan = consistencyToyPlan(
                new ConsistencyRule(ConsistencyScope.Funded, fraction(0.9999)),
            );
            const alwaysViolatedResult = computeFundedStateValue({
                ...config,
                plan: alwaysViolatedOnDayOnePlan,
            });
            expect(alwaysViolatedResult.initialValue).not.toBeCloseTo(50, 5);
            expect(alwaysViolatedResult.initialValue).toBeGreaterThan(
                baselineResult.initialValue,
            );
        },
    );

    it(
        "a realistic funded-consistency share (0.4, matching TopStep's " +
            "'Consistency' variants) also produces a real, materially " +
            'different value from the no-rule baseline for the same ' +
            'one-payout toy, confirming the fix matters at realistic, not ' +
            'just boundary, share values',
        () => {
            const baseline = consistencyToyPlan(null);
            const withRealisticShare = consistencyToyPlan(
                new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4)),
            );
            const config = {
                actionStepMultiple: 1,
                cushionStepMultiple: 1,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 1,
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0.5,
            };
            const baselineResult = computeFundedStateValue({
                ...config,
                plan: baseline,
            });
            const withRealisticShareResult = computeFundedStateValue({
                ...config,
                plan: withRealisticShare,
            });

            expect(baselineResult.initialValue).toBeCloseTo(50, 10);
            expect(withRealisticShareResult.initialValue).not.toBeCloseTo(
                50,
                2,
            );
        },
    );
});

describe('findRegistryPlanId (worker-thread pool safety gate)', () => {
    it(
        'resolves every real registry plan back to its own id, under ' +
            'whatever runtime is executing this test -- a regression for ' +
            "the parallel path's registry lookup silently degrading to " +
            'the sequential fallback forever if this ever stops resolving ' +
            '(e.g. the firms module gets moved or renamed)',
        async () => {
            await warmFirmsRegistryCache();
            for (const firm of ALL_FIRMS) {
                for (const plan of firm.plans) {
                    expect(findRegistryPlanId(plan)).toEqual(plan.id);
                }
            }
        },
    );

    it('returns null for a plan not present in the static registry', async () => {
        await warmFirmsRegistryCache();
        const [firstFirm] = ALL_FIRMS;
        const [firstPlan] = firstFirm?.plans ?? [];
        if (firstPlan === undefined) throw new Error('no plans in registry');

        expect(findRegistryPlanId(firstPlan.withOverrides({}))).toBeNull();
    });
});
