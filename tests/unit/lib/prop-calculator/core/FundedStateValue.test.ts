import { describe, expect, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    contracts,
    createInitialState,
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    FundedNextVariant,
    INSTRUMENTS,
    InstrumentSymbol,
    MffuVariant,
    PayoutCountTieredPayoutCap,
    PayoutFloorEffect,
    type Plan,
    points,
    replacementEconomics,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    defaultPayoutRegimeCap,
    findRegistryPlanId,
    isFundedDpEligible,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { simulate } from '~/lib/prop-calculator/simulator';

function bigLockedToyPlan(): Plan {
    return rapidEodPlan().withOverrides({
        accountSize: dollars(1_000_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100_000) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100_000),
            lock: {
                atProfit: dollars(150_000),
                lockedThreshold: () => 1_000_000,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(1_000_000_000),
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

function consistencyToyPlan(rule: ConsistencyRule | null): Plan {
    return onePayoutToyPlan().withOverrides({
        fundedConsistency: { kind: 'set', rule },
    });
}

function legacyPlan(): Plan {
    const plan = new FundedNext().findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant: FundedNextVariant.Legacy,
    });
    if (!plan) throw new Error('FundedNext Legacy 50K plan not found');
    return plan;
}

function noPayoutToyPlan(): Plan {
    return onePayoutToyPlan().withOverrides({
        minPayoutProfit: dollars(1_000_000),
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

function qualifyingDayGatedToyPlan(): Plan {
    return onePayoutToyPlan().withOverrides({
        minDaysAfterPassForPayout: 2,
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
    'computeFundedStateValue vs FundedPayoutCycle.tryPayout — regression: ' +
        'the funded DP must model minDaysAfterPassForPayout exactly as ' +
        'tryFundedPayout enforces it, not bypass the gate with a fabricated ' +
        'permanently-unlocked qualifyingDays (the D14 bug: buildState used ' +
        'to hardcode a LARGE_QUALIFYING_DAYS constant and dayCloseValue ' +
        'reset qualifyingDaysAtLastPayout to 0, so hasQualifyingDays was ' +
        'trivially true on every day, letting the DP cash out a locked ' +
        "profit on day 1 even when the plan's own minDaysAfterPassForPayout " +
        'requires waiting). qualifyingDayGatedToyPlan is the one-payout toy ' +
        'with minDaysAfterPassForPayout raised from 0 to 2 (every other ' +
        'field, including the single $100 action/1:2 risk:reward/winrate ' +
        '0.5 setup, is untouched, so this is a pure isolation of the gate): ' +
        'day 1 either locks (win, profit $200 clears the $150 trigger, ' +
        'cushion $200) or busts outright (loss drops the $100 cushion to ' +
        'exactly $0). A locked day 1 cannot pay out (only 1 qualifying day ' +
        'accrued, needs 2) and must continue to day 2 at cushion $200; day ' +
        '2 either pays out $300 and concludes (win, cycleProfit $400, ' +
        'capped by withdrawable $300 above the $1,100 floor) or is denied ' +
        'for $0 withdrawable (loss, cycleProfit $100 but cushion is back ' +
        'down to exactly the $100 floor headroom) and must continue to day ' +
        '3 at cushion $100, where the gate is already permanently satisfied ' +
        'and the account either pays out $200 and concludes (win) or busts ' +
        '(loss, cushion $100 to $0 again). Hand-solving this three-level ' +
        'chain backward — V(day3)=0.5*200=100, V(day2)=0.5*300+0.5*(0+' +
        'V(day3))=200, V(day1)=0.5*V(day2)=100 — gives V(initial)=100. A DP ' +
        'that bypasses the gate (as the pre-fix engine did) instead cashes ' +
        'out immediately on the day-1 win (cycleProfit $200, withdrawable ' +
        '$100, concludes for $100) and busts on the day-1 loss, giving the ' +
        'materially different, provably wrong V(initial)=0.5*100=50',
    () => {
        it(
            "computeFundedStateValue's V(initial) for the qualifying-day-" +
                "gated toy is exactly 100, not the gate-bypassing engine's " +
                '50 — the qualifying-day gate makes the DP wait for a ' +
                'bigger, later cycleProfit instead of cashing out on day 1, ' +
                'a real, hand-verified prediction change no unfixed engine ' +
                'could produce for this plan',
            () => {
                const plan = qualifyingDayGatedToyPlan();
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

                expect(result.initialValue).toBeCloseTo(100, 10);
                expect(result.initialValue).not.toBeCloseTo(50, 5);
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
                'dayPolicy reproduces V(initial)=100 empirically: expected ' +
                'gross payout plus bust-probability-weighted ' +
                'bustTerminalValue matches the fixed-DP prediction within ' +
                'Monte Carlo tolerance at 50,000 trials — simulate() always ' +
                'enforced the real minDaysAfterPassForPayout gate through ' +
                "FundedPayoutCycle's shared tryFundedPayout, so this also " +
                "proves the DP's own newly gate-aware policy (unchanged " +
                'here, since this toy only ever has one nonzero action) ' +
                "matches reality once the DP's prediction does",
            () => {
                const plan = qualifyingDayGatedToyPlan();
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

describe('defaultPayoutRegimeCap', () => {
    it('falls back to the default cap of 6 for a plan with neither maxLifetimePayouts nor a payoutLadder', () => {
        const plan = rapidEodPlan();
        expect(plan.maxLifetimePayouts).toBeNull();
        expect(plan.payoutLadder).toBeNull();
        expect(defaultPayoutRegimeCap(plan)).toBe(6);
    });

    it('raises the cap to maxLifetimePayouts when it exceeds the default of 6', () => {
        const plan = rapidEodPlan().withOverrides({ maxLifetimePayouts: 9 });
        expect(defaultPayoutRegimeCap(plan)).toBe(9);
    });

    it('raises the cap to the payout ladder step count when it exceeds the default of 6', () => {
        const plan = rapidEodPlan().withOverrides({
            payoutLadder: {
                minRequestAmount: dollars(500),
                steps: [1, 2, 3, 4, 5, 6, 7, 8],
            },
        });
        expect(defaultPayoutRegimeCap(plan)).toBe(8);
    });

    it('takes the max across the default, maxLifetimePayouts, and the payout ladder step count', () => {
        const plan = rapidEodPlan().withOverrides({
            maxLifetimePayouts: 3,
            payoutLadder: {
                minRequestAmount: dollars(500),
                steps: Array.from({ length: 10 }, () => 1),
            },
        });
        expect(defaultPayoutRegimeCap(plan)).toBe(10);
    });
});

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

    it(
        'refuses FundedNext Legacy: its payoutCapOverride is a ' +
            'QualifyingDaysMilestonePayoutCap, keyed on state.qualifyingDays ' +
            'as a lifetime cumulative count in Plan.resolvedPayoutCap. The ' +
            'DP instead tracks qualifyingDays as a bounded, per-cycle ' +
            "gate that resets on payout, so Legacy's post-30-day " +
            'uncapped regime is unreachable inside it -- the DP would ' +
            'silently value every payout under the capped, ' +
            'before-milestone regime',
        () => {
            expect(isFundedDpEligible(legacyPlan())).toBe(false);
            expect(() =>
                computeFundedStateValue({
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    plan: legacyPlan(),
                    rrRatio: 2,
                    winrate: 0.4,
                }),
            ).toThrow(/not eligible/);
        },
    );

    it(
        'keeps a plan DP-eligible when its payoutCapOverride is a ' +
            'PayoutCountTieredPayoutCap (keyed on payoutsIssued, not ' +
            'cumulative qualifying days) -- only ' +
            'QualifyingDaysMilestonePayoutCap is excluded, not every ' +
            'payoutCapOverride',
        () => {
            const tieredCapPlan = rapidEodPlan().withOverrides({
                payoutCapOverride: new PayoutCountTieredPayoutCap([
                    {
                        fromPayoutIndex: 0,
                        regime: {
                            balanceShareCap: null,
                            requestCap: dollars(1250),
                        },
                    },
                ]),
            });
            expect(isFundedDpEligible(tieredCapPlan)).toBe(true);
        },
    );
});

describe(
    'FundedStateValueResult.unconvergedLevelCount — surfaces a level that ' +
        'hit the maxIterationsPerLevel sweep cap without converging, which ' +
        'was silently swallowed before this change',
    () => {
        it(
            'a maxIterationsPerLevel of 1 leaves at least one level ' +
                'unconverged on the one-payout toy, since value iteration ' +
                'starting from 0 needs more than a single sweep to settle ' +
                'within convergenceTolerance of the true V(initial)=50',
            () => {
                const plan = onePayoutToyPlan();
                const result = computeFundedStateValue({
                    actionStepMultiple: 1,
                    cushionStepMultiple: 1,
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    maxActionMultiple: 1,
                    maxIterationsPerLevel: 1,
                    plan,
                    rrRatio: 2,
                    tradesPerDay: 1,
                    winrate: 0.5,
                });

                expect(result.unconvergedLevelCount).toBeGreaterThan(0);
            },
        );

        it(
            'the default one-payout toy converges every level within the ' +
                'default sweep cap, so unconvergedLevelCount is 0 and the ' +
                'existing V(initial)=50 pin is unaffected',
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

                expect(result.unconvergedLevelCount).toBe(0);
                expect(result.initialValue).toBeCloseTo(50, 10);
            },
        );
    },
);

describe(
    'FundedStateValueConfig.dayCost / meanHorizonDays -- a geometric ' +
        'end-of-horizon hazard q=1/meanHorizonDays and a per-day charge, ' +
        "wired into the funded DP's day-settlement function the same way " +
        "change 3's rebuyLagDays wired into the engine, and reusing " +
        'FundedCycleTracker.closeoutCredit (T6) at the hazard branch',
    () => {
        it(
            'meanHorizonDays: 1 makes the hazard q exactly 1, so every ' +
                'continuing day resolves at the horizon with certainty and ' +
                "the recursive continuation term's weight (1-q) is exactly " +
                'zero: V(initial) collapses to the closed form -dayCost + ' +
                'winrate * closeoutCredit(winState), independent of the ' +
                'value map, on a no-payout toy (onePayoutToyPlan with ' +
                'minPayoutProfit raised to $1,000,000 so the real, ' +
                'scheduled tryFundedPayout on the winning day is blocked ' +
                'by its own requiredProfit gate, forcing the account to ' +
                "reach this change's new continuing-with-hazard branch " +
                'instead of concluding immediately the way the unmodified ' +
                'one-payout toy does). A $200 win locks the drawdown at ' +
                '$1,000 (profit 200 clears the $150 lock trigger) and ' +
                'closeoutCredit ignores minPayoutProfit entirely (D4), so ' +
                'it is exactly payoutFromProfit(withdrawableNow) = ' +
                'payoutFromProfit($100 cushion above the $1,100 payout ' +
                "floor) = $100 at this plan's 100%-trader-share, no-fee " +
                'payoutTiers. A $100 loss busts intraday for ' +
                'bustTerminalValue=0 (evalInitialValue=feePerAttempt=0), ' +
                'so V(initial) = -5 + 0.5*100 = 45',
            () => {
                const plan = noPayoutToyPlan();
                const dayCost = 5;

                const result = computeFundedStateValue({
                    actionStepMultiple: 1,
                    cushionStepMultiple: 1,
                    dayCost,
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    maxActionMultiple: 1,
                    meanHorizonDays: 1,
                    plan,
                    rrRatio: 2,
                    tradesPerDay: 1,
                    winrate: 0.5,
                });

                expect(result.initialValue).toBeCloseTo(45, 10);
            },
        );

        it(
            'worker parity: a real registry plan (findRegistryPlanId ' +
                'resolves it, so tryCreateWorkerPool genuinely dispatches ' +
                'to worker threads once the grid clears ' +
                'MIN_PARALLEL_GRID_CELLS) and the identical plan taken out ' +
                'of the registry via withOverrides({}) (which cannot ' +
                'resolve back to its own id, so it runs single-threaded, ' +
                "per this file's own findRegistryPlanId tests) produce the " +
                'same initialValue with dayCost != 0 and a horizon, on ' +
                'coarse grids -- proving dayCost/meanHorizonDays reach ' +
                'workers through SerializableFundedConfig/' +
                'toSerializableConfig/runFundedWorkerBootstrap correctly',
            async () => {
                await warmFirmsRegistryCache();
                const firm = ALL_FIRMS.find(
                    (candidate) => candidate.id === FirmId.TopStep,
                );
                if (!firm) throw new Error('TopStep firm not in the registry');
                const registryPlan = firm.plans[0];
                if (!registryPlan)
                    throw new Error('No TopStep plan registered');
                expect(findRegistryPlanId(registryPlan)).toEqual(
                    registryPlan.id,
                );

                const offRegistryPlan = registryPlan.withOverrides({});
                expect(findRegistryPlanId(offRegistryPlan)).toBeNull();

                const coarseConfig = {
                    actionStepMultiple: 1,
                    cushionStepMultiple: 1,
                    dayCost: 5,
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    maxActionMultiple: 1,
                    meanHorizonDays: 100,
                    payoutRegimeCap: 0,
                    rrRatio: 2,
                    tradesPerDay: 1,
                    winrate: 0.4,
                };

                const workerResult = computeFundedStateValue({
                    ...coarseConfig,
                    plan: registryPlan,
                });
                const singleThreadedResult = computeFundedStateValue({
                    ...coarseConfig,
                    plan: offRegistryPlan,
                });

                expect(workerResult.initialValue).toBeCloseTo(
                    singleThreadedResult.initialValue,
                    6,
                );
            },
            60_000,
        );

        it(
            'dayCost != 0 without meanHorizonDays throws, since a policy ' +
                'that never busts would have no terminal branch and the ' +
                'day-cost fixed point would diverge',
            () => {
                const plan = onePayoutToyPlan();
                expect(() =>
                    computeFundedStateValue({
                        actionStepMultiple: 1,
                        cushionStepMultiple: 1,
                        dayCost: 1,
                        evalInitialValue: 0,
                        feePerAttempt: dollars(0),
                        maxActionMultiple: 1,
                        plan,
                        rrRatio: 2,
                        tradesPerDay: 1,
                        winrate: 0.5,
                    }),
                ).toThrow(/meanHorizonDays/);
            },
        );

        it.each([0, 0.5, -1, Infinity, NaN])(
            'meanHorizonDays=%s throws, since it must be finite and >= 1',
            (meanHorizonDays) => {
                const plan = onePayoutToyPlan();
                expect(() =>
                    computeFundedStateValue({
                        actionStepMultiple: 1,
                        cushionStepMultiple: 1,
                        evalInitialValue: 0,
                        feePerAttempt: dollars(0),
                        maxActionMultiple: 1,
                        meanHorizonDays,
                        plan,
                        rrRatio: 2,
                        tradesPerDay: 1,
                        winrate: 0.5,
                    }),
                ).toThrow(/meanHorizonDays/);
            },
        );

        it(
            'omitting both dayCost and meanHorizonDays leaves the existing ' +
                'one-payout toy pin (V(initial)=50) byte-identical, since ' +
                'dayCost defaults to 0 and horizonHazard defaults to 0 -- ' +
                'a true no-op on both the finalTable subtraction and the ' +
                'dayCloseValue continuing branch',
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

                expect(result.initialValue).toBeCloseTo(50, 10);
            },
        );
    },
);

describe(
    'default maxIterationsPerLevel under a horizon hazard -- the per-level ' +
        'sweep cap must scale with the hazard so a genuinely convergent ' +
        'level is never mistaken for a non-convergent one just because it ' +
        'needs more than the flat 200-sweep default that ignores ' +
        'meanHorizonDays entirely',
    () => {
        it(
            'a locked level whose optimal policy always trades a ' +
                'guaranteed win (winrate 1, so a $100k risk at 1:2 R:R ' +
                'clears the $150k lock trigger on day 1 and then clamps ' +
                'at the top locked cushion bucket, self-referencing its ' +
                'own not-yet-converged value every sweep after) is a ' +
                'pure geometric approach to its fixed point at rate ' +
                '(1 - 1/meanHorizonDays): at meanHorizonDays 252 and ' +
                "this plan's dollar scale, that needs on the order of " +
                '2000 sweeps (measured: unconverged through 1500, ' +
                'converged by 2000), far past ' +
                'DEFAULT_MAX_ITERATIONS_PER_LEVEL (200), so calling ' +
                'computeFundedStateValue with default grid settings (no ' +
                'maxIterationsPerLevel override) must still converge to ' +
                'the same value an explicit high-iteration ground-truth ' +
                'run reaches, not merely avoid throwing or silently ' +
                'reporting a biased, under-converged initialValue the ' +
                'way the unfixed 200-sweep default does',
            () => {
                const plan = bigLockedToyPlan();
                const config = {
                    actionStepMultiple: 1,
                    cushionStepMultiple: 1,
                    dayCost: 1,
                    evalInitialValue: 0,
                    feePerAttempt: dollars(0),
                    maxActionMultiple: 1,
                    meanHorizonDays: 252,
                    payoutRegimeCap: 0,
                    plan,
                    rrRatio: 2,
                    tradesPerDay: 1,
                    winrate: 1,
                };

                const groundTruth = computeFundedStateValue({
                    ...config,
                    maxIterationsPerLevel: 5000,
                });
                expect(groundTruth.unconvergedLevelCount).toBe(0);

                const defaultResult = computeFundedStateValue(config);

                expect(defaultResult.unconvergedLevelCount).toBe(0);
                expect(defaultResult.initialValue).toBeCloseTo(
                    groundTruth.initialValue,
                    6,
                );
            },
        );
    },
);

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
            'observed output: initialValue=29505.52018082788, and the ' +
            'exported policy chooses identical risk at every (tradeIndex, ' +
            'payoutsIssued) combination checked below — because isViolated ' +
            'is never even called when fundedConsistencyRule() is null ' +
            '(short-circuited by `!consistency?.isViolated(...)`), the ' +
            'tracked cycleBestDayProfit value can never influence this ' +
            'plan. reachedStateCount is pinned at 39396, exactly 2x the ' +
            "pre-D14 19698, since this plan's minDaysAfterPassForPayout=1 " +
            'adds a real qualifyingDayKeyRadix=2 state dimension, but ' +
            "initialValue and the policy are unaffected by D14's fix " +
            'because a required count of 1 is already satisfied by the ' +
            "very first traded day's own qualifying-day accrual (by the " +
            'time tryFundedPayout runs on that same day-close), so the ' +
            'gate was never actually binding for this plan even before ' +
            'the fix',
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
            expect(result.reachedStateCount).toBe(39_396);

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
