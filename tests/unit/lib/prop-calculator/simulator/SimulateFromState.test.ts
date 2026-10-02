import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    computedDayPolicy,
    dollars,
    FirmId,
    fraction,
    type FundedCycleSeed,
    MffuVariant,
    PayoutRequestPolicy,
    type Plan,
    PolicySizing,
    RungSizing,
    TopStepVariant,
    TRADING_DAYS_PER_MONTH,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import {
    fromStateCashSamples,
    SIM_INPUTS_REFUSAL_PREFIX,
    simStartIssue,
    simulate,
    simulateFromState,
    simulateTrial,
    type TrialOptions,
    type TrialResult,
} from '~/lib/prop-calculator/simulator';

import { evalToyPlan, fundedResetToyPlan, payoutCapToyPlan } from './toyPlans';

interface CountedRng {
    draws: () => number;
    rng: Rng;
}

function countedRng(seed: number): CountedRng {
    const inner = mulberry32(seed);
    let count = 0;
    return {
        draws: () => count,
        rng: () => {
            count += 1;
            return inner();
        },
    };
}

function evalSeedState(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 1000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 1000,
        threshold: 900,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
        ...overrides,
    };
}

function fullFundedSeed(
    overrides: Partial<FundedCycleSeed> = {},
): FundedCycleSeed {
    return {
        calendarDayGateProgress: 0,
        cumulativePayout: 0,
        cycleBestDayProfit: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance: 1000,
        payoutsIssued: 0,
        qualifyingDaysAtLastPayout: 0,
        ...overrides,
    };
}

function fundedSeedState(overrides: Partial<AccountState> = {}): AccountState {
    return {
        balance: 1000,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 1000,
        threshold: 900,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
        ...overrides,
    };
}

describe('simulateFromState: eval start reduces to simulate() at a virgin state (RNG parity, PD-31)', () => {
    it('gives the same RNG draw count and the same trial-level result as a plain trial, at plan.initialState()', () => {
        const plan = findFirm(FirmId.Mffu)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        });
        if (!plan) throw new Error('plan not found');

        const baseOptions: Omit<TrialOptions, 'rng' | 'start'> = {
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: computedDayPolicy(
                () => 300,
                1,
                undefined,
                PolicySizing.ContractCapped,
            ),
            fundedDayPolicy: computedDayPolicy(
                () => 300,
                1,
                undefined,
                PolicySizing.ContractCapped,
            ),
            fundedHorizonDays: 10,
            maxAttempts: 2,
            maxEvalDays: 20,
            minRetainedCushion: dollars(500),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        };

        const plain = countedRng(99);
        const plainResult = simulateTrial({ ...baseOptions, rng: plain.rng });

        const seeded = countedRng(99);
        const startResult = simulateTrial({
            ...baseOptions,
            rng: seeded.rng,
            start: {
                attempt: {
                    dayCap: plan.evalDayCap(20),
                    state: plan.initialState(),
                },
                phase: TradingPhase.Eval,
                sunkSubscriptionDays: 0,
            },
        });

        expect(seeded.draws()).toBe(plain.draws());
        expect(startResult).toStrictEqual(plainResult);
    });
});

describe('simulateFromState: eval start excludes the sunk initial eval fee (T15)', () => {
    it('costs exactly the sunk initial eval fee less than an equivalent fresh run', () => {
        const plan = evalToyPlan();
        const winDayPolicy = computedDayPolicy(
            () => 100,
            1,
            undefined,
            PolicySizing.ContractCapped,
        );

        const fresh = simulate({
            evalDayPolicy: winDayPolicy,
            fundedHorizonDays: 1,
            fundedRiskPerTrade: 0,
            maxAttempts: 1,
            maxEvalDays: 10,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });
        expect(fresh.expectedNet).toBeCloseTo(-150, 6);

        const fromState = simulateFromState({
            evalDayPolicy: winDayPolicy,
            fundedHorizonDays: 1,
            fundedRiskPerTrade: 0,
            maxAttempts: 1,
            maxEvalDays: 10,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 1,
            start: {
                phase: TradingPhase.Eval,
                state: evalSeedState({
                    balance: 1100,
                    elapsedDays: 1,
                    threshold: 1000,
                    tradingDays: 1,
                }),
            },
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });
        expect(fromState.expectedNet).toBeCloseTo(-50, 6);
        expect(fresh.expectedNet - fromState.expectedNet).toBeCloseTo(-100, 6);
    });
});

describe('simulateFromState: eval start refusals (PD-29 and T15)', () => {
    const plan = evalToyPlan();

    it('refuses an eval start on an instant-funded plan', () => {
        const instantFunded = plan.withOverrides({ isInstantFunded: true });
        const issue = simStartIssue(
            instantFunded,
            { phase: TradingPhase.Eval, state: instantFunded.initialState() },
            10,
        );
        expect(issue).not.toBeNull();
        expect(() =>
            simulateFromState({
                fundedHorizonDays: 1,
                maxEvalDays: 10,
                plan: instantFunded,
                riskPerTrade: 100,
                rrRatio: 1,
                seed: 1,
                start: {
                    phase: TradingPhase.Eval,
                    state: instantFunded.initialState(),
                },
                tradesPerDay: 1,
                trials: 1,
                winrate: 0.5,
            }),
        ).toThrow(SIM_INPUTS_REFUSAL_PREFIX);
    });

    it('refuses an eval start already at or past the day cap', () => {
        const state = evalSeedState({ elapsedDays: 10, tradingDays: 10 });
        expect(
            simStartIssue(plan, { phase: TradingPhase.Eval, state }, 10),
        ).not.toBeNull();
        expect(() =>
            simulateFromState({
                fundedHorizonDays: 1,
                maxEvalDays: 10,
                plan,
                riskPerTrade: 100,
                rrRatio: 1,
                seed: 1,
                start: { phase: TradingPhase.Eval, state },
                tradesPerDay: 1,
                trials: 1,
                winrate: 0.5,
            }),
        ).toThrow(SIM_INPUTS_REFUSAL_PREFIX);
    });

    it('refuses an eval start that has already passed', () => {
        const state = evalSeedState({ balance: 1400, tradingDays: 3 });
        expect(
            simStartIssue(plan, { phase: TradingPhase.Eval, state }, 10),
        ).not.toBeNull();
    });

    it('refuses an eval start that is already busted', () => {
        const state = evalSeedState({ balance: 900, threshold: 900 });
        expect(
            simStartIssue(plan, { phase: TradingPhase.Eval, state }, 10),
        ).not.toBeNull();
    });

    it('refuses an eval start closed for inactivity', () => {
        const limited = plan.withOverrides({ maxConsecutiveIdleDays: 3 });
        const state = evalSeedState({ consecutiveIdleDays: 3 });
        expect(
            simStartIssue(limited, { phase: TradingPhase.Eval, state }, 10),
        ).not.toBeNull();
    });

    it('refuses a subscriptionElapsedDays below the seeded elapsedDays', () => {
        const state = evalSeedState({ elapsedDays: 5, tradingDays: 5 });
        const start = {
            phase: TradingPhase.Eval as const,
            state,
            subscriptionElapsedDays: 2,
        };
        expect(simStartIssue(plan, start, 10)).not.toBeNull();
        expect(() =>
            simulateFromState({
                fundedHorizonDays: 1,
                maxEvalDays: 10,
                plan,
                riskPerTrade: 100,
                rrRatio: 1,
                seed: 1,
                start,
                tradesPerDay: 1,
                trials: 1,
                winrate: 0.5,
            }),
        ).toThrow(SIM_INPUTS_REFUSAL_PREFIX);
    });

    it('refuses a negative subscriptionElapsedDays', () => {
        const state = evalSeedState({ elapsedDays: 0, tradingDays: 0 });
        const start = {
            phase: TradingPhase.Eval as const,
            state,
            subscriptionElapsedDays: -1,
        };
        expect(simStartIssue(plan, start, 10)).not.toBeNull();
    });
});

describe('simulateFromState: funded seeded state is not reset by beginFundedPhase (T33)', () => {
    it("the first day's day policy sees the seeded balance and threshold, not accountSize/initialThreshold", () => {
        const plan = payoutCapToyPlan().withOverrides({
            maxLifetimePayouts: 10,
        });
        const recorded: Array<{ balance: number; threshold: number }> = [];
        const recordingPolicy = computedDayPolicy(
            (state) => {
                recorded.push({
                    balance: state.balance,
                    threshold: state.threshold,
                });
                return 0;
            },
            1,
            undefined,
            PolicySizing.ContractCapped,
        );

        const seedState = fundedSeedState({ balance: 1100, threshold: 950 });
        const preCallState = { ...seedState };
        const seed = fullFundedSeed();

        simulateFromState({
            fundedDayPolicy: recordingPolicy,
            fundedHorizonDays: 1,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 2,
            start: { phase: TradingPhase.Funded, seed, state: seedState },
            tradesPerDay: 1,
            trials: 1,
            winrate: 0.5,
        });

        expect(recorded[0]).toStrictEqual({ balance: 1100, threshold: 950 });
        expect(seedState).toStrictEqual(preCallState);
    });
});

function recordingResetPolicy(recorded: number[]) {
    return computedDayPolicy(
        (_state, _index, fundedCycle) => {
            recorded.push(fundedCycle?.fundedResetsUsed ?? -1);
            return 100;
        },
        1,
        undefined,
        PolicySizing.ContractCapped,
    );
}

describe('simulateFromState: funded reset gating honours seed.fundedResetsUsed (T31, maxPerAccount 2)', () => {
    const plan = fundedResetToyPlan().withOverrides({ maxLifetimePayouts: 10 });

    it('a seed with fundedResetsUsed 1 records [1, 2] and buys exactly one reset before busting', () => {
        const recorded: number[] = [];
        const out = simulateFromState({
            fundedDayPolicy: recordingResetPolicy(recorded),
            fundedHorizonDays: 5,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 3,
            start: {
                phase: TradingPhase.Funded,
                seed: fullFundedSeed({ fundedResetsUsed: 1 }),
                state: fundedSeedState(),
            },
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });
        expect(recorded).toStrictEqual([1, 2]);
        expect(out.expectedFundedResets).toBe(1);
        expect(out.fundedBustProbability).toBe(1);
    });

    it('a seed with fundedResetsUsed 2 (at the maximum) records [2], buys none and busts', () => {
        const recorded: number[] = [];
        const out = simulateFromState({
            fundedDayPolicy: recordingResetPolicy(recorded),
            fundedHorizonDays: 5,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 3,
            start: {
                phase: TradingPhase.Funded,
                seed: fullFundedSeed({ fundedResetsUsed: 2 }),
                state: fundedSeedState(),
            },
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });
        expect(recorded).toStrictEqual([2]);
        expect(out.expectedFundedResets).toBe(0);
        expect(out.fundedBustProbability).toBe(1);
    });

    it('a seed with payoutsIssued 1 never resets, even with reset room left', () => {
        const recorded: number[] = [];
        const out = simulateFromState({
            fundedDayPolicy: recordingResetPolicy(recorded),
            fundedHorizonDays: 5,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 3,
            start: {
                phase: TradingPhase.Funded,
                seed: fullFundedSeed({ payoutsIssued: 1 }),
                state: fundedSeedState(),
            },
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });
        expect(recorded).toStrictEqual([0]);
        expect(out.expectedFundedResets).toBe(0);
        expect(out.fundedBustProbability).toBe(1);
    });
});

describe('simulateFromState: refuses an impossible funded seed (T31 gating validated up front)', () => {
    const plan = fundedResetToyPlan().withOverrides({ maxLifetimePayouts: 10 });

    it('refuses fundedResetsUsed above the policy maximum', () => {
        expect(
            simStartIssue(
                plan,
                {
                    phase: TradingPhase.Funded,
                    seed: fullFundedSeed({ fundedResetsUsed: 3 }),
                    state: fundedSeedState(),
                },
                1,
            ),
        ).not.toBeNull();
    });

    it('refuses fundedResetsUsed above 0 without a funded reset offered', () => {
        const noReset = payoutCapToyPlan().withOverrides({
            maxLifetimePayouts: 10,
        });
        expect(
            simStartIssue(
                noReset,
                {
                    phase: TradingPhase.Funded,
                    seed: fullFundedSeed({ fundedResetsUsed: 1 }),
                    state: fundedSeedState(),
                },
                1,
            ),
        ).not.toBeNull();
    });

    it('refuses a busted funded seed state', () => {
        expect(
            simStartIssue(
                plan,
                {
                    phase: TradingPhase.Funded,
                    seed: fullFundedSeed(),
                    state: fundedSeedState({ balance: 900, threshold: 900 }),
                },
                1,
            ),
        ).not.toBeNull();
    });

    it('refuses a concluded funded seed', () => {
        const concluding = plan.withOverrides({ maxLifetimePayouts: 2 });
        expect(
            simStartIssue(
                concluding,
                {
                    phase: TradingPhase.Funded,
                    seed: fullFundedSeed({
                        cumulativePayout: 400,
                        payoutsIssued: 2,
                    }),
                    state: fundedSeedState(),
                },
                1,
            ),
        ).not.toBeNull();
    });

    it('refuses non-integer and negative seed counts', () => {
        expect(
            simStartIssue(
                plan,
                {
                    phase: TradingPhase.Funded,
                    seed: fullFundedSeed({ payoutsIssued: 1.5 }),
                    state: fundedSeedState(),
                },
                1,
            ),
        ).not.toBeNull();
        expect(
            simStartIssue(
                plan,
                {
                    phase: TradingPhase.Funded,
                    seed: fullFundedSeed({ fundedResetsUsed: -1 }),
                    state: fundedSeedState(),
                },
                1,
            ),
        ).not.toBeNull();
    });

    it('refuses a non-integer payoutsIssued with the schema message, even when it would also read as concluded', () => {
        const concluding = plan.withOverrides({ maxLifetimePayouts: 2 });
        const issue = simStartIssue(
            concluding,
            {
                phase: TradingPhase.Funded,
                seed: fullFundedSeed({ payoutsIssued: 2.5 }),
                state: fundedSeedState(),
            },
            1,
        );
        expect(issue).not.toBeNull();
        expect(issue).toContain('funded cycle seed is invalid');
        expect(issue).not.toContain('already concluded');
    });
});

function runTieredPayoutToy(seed: FundedCycleSeed, lastPayoutBalance: number) {
    const plan = tieredPayoutToyPlan();
    return simulateFromState({
        fundedHorizonDays: 3,
        fundedRiskPerTrade: 100,
        fundedRrRatio: 1,
        maxEvalDays: 1,
        payoutRequestSize: 150,
        plan,
        riskPerTrade: 100,
        rrRatio: 1,
        seed: 7,
        start: {
            phase: TradingPhase.Funded,
            seed: { ...seed, lastPayoutBalance },
            state: fundedSeedState(),
        },
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
    });
}

function tieredPayoutToyPlan(): Plan {
    return payoutCapToyPlan().withOverrides({
        maxLifetimePayouts: 10,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.7) },
        ],
        payoutTiersFromPayout: [
            {
                fromPayoutIndex: 2,
                tiers: [
                    { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
                ],
            },
            {
                fromPayoutIndex: 4,
                tiers: [
                    { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
                ],
            },
        ],
    });
}

describe('simulateFromState: the tiered payout split reads the seeded payout count (T24)', () => {
    it('pays the first (70%) tier for a seed that never requested a payout', () => {
        const out = runTieredPayoutToy(fullFundedSeed(), 1000);
        expect(out.fundedPayoutValues).toHaveLength(1);
        expect(out.fundedPayoutValues[0]).toBeCloseTo(105, 6);
    });

    it('pays the third-payout (80%) tier for a seed with payoutsIssued 2, per plan.payoutFromProfit(debit, 2)', () => {
        const plan = tieredPayoutToyPlan();
        const lastPayoutBalance = 1200;
        const sameCycleGateReference = runTieredPayoutToy(
            fullFundedSeed({ payoutsIssued: 1 }),
            lastPayoutBalance,
        );
        const actual = runTieredPayoutToy(
            fullFundedSeed({ cumulativePayout: 300, payoutsIssued: 2 }),
            lastPayoutBalance,
        );
        expect(sameCycleGateReference.fundedPayoutValues).toHaveLength(1);
        expect(actual.fundedPayoutValues).toHaveLength(1);
        const sameCycleGateReferencePayout =
            sameCycleGateReference.fundedPayoutValues[0] ?? 0;
        const actualPayout = actual.fundedPayoutValues[0] ?? 0;
        const debited = sameCycleGateReferencePayout / 0.7;
        expect(actualPayout).toBeCloseTo(plan.payoutFromProfit(debited, 2), 6);
        expect(actualPayout).not.toBeCloseTo(sameCycleGateReferencePayout, 6);
    });
});

describe('simulateFromState: the credit-inclusive and credit-free from-state objectives (Q11 default)', () => {
    it('is the mean of net-plus-credit when alive, and net plus a fresh continuation when not, over a scripted RNG', () => {
        const plan = payoutCapToyPlan().withOverrides({
            maxLifetimePayouts: 10,
        });
        const winPolicy = computedDayPolicy(
            () => 0,
            1,
            undefined,
            PolicySizing.ContractCapped,
        );

        const out = simulateFromState({
            fundedDayPolicy: winPolicy,
            fundedHorizonDays: 4,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 4,
            start: {
                phase: TradingPhase.Funded,
                seed: fullFundedSeed(),
                state: fundedSeedState(),
            },
            tradesPerDay: 1,
            trials: 3,
            winrate: 0.5,
        });

        expect(out.fromStateWindowDays).toBe(4);
        expect(Number.isFinite(out.fromStateExpectedCash)).toBe(true);
        expect(Number.isFinite(out.fromStateExpectedRealizedCash)).toBe(true);
        expect(out.estimates.fromStateExpectedCash.value).toBeCloseTo(
            out.fromStateExpectedCash,
            9,
        );
        expect(out.estimates.fromStateExpectedRealizedCash.value).toBeCloseTo(
            out.fromStateExpectedRealizedCash,
            9,
        );
        expect(Object.hasOwn(out, 'expectedMonthlyNet')).toBe(false);
        expect(Object.hasOwn(out, 'expectedMonthlyRealizedNet')).toBe(false);
        expect(Object.hasOwn(out, 'costBreakdown')).toBe(false);
        expect(Object.hasOwn(out.estimates, 'expectedMonthlyNet')).toBe(false);
        expect(Object.hasOwn(out.estimates, 'expectedMonthlyRealizedNet')).toBe(
            false,
        );
    });
});

describe('simulateFromState: costPerFundedAccount reflects only real future spend (review finding)', () => {
    it('a funded start has no fabricated eval or activation fee, only funded reset fees', () => {
        const plan = evalToyPlan();

        const out = simulateFromState({
            fundedHorizonDays: 2,
            fundedRiskPerTrade: 0,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 5,
            start: {
                phase: TradingPhase.Funded,
                seed: fullFundedSeed(),
                state: fundedSeedState(),
            },
            tradesPerDay: 1,
            trials: 1,
            winrate: 0.5,
        });

        expect(out.costPerFundedAccount).toBeCloseTo(0, 6);
    });

    it('an eval start with sunk subscription days is not charged the sunk initial eval fee twice', () => {
        const plan = evalToyPlan();
        const winDayPolicy = computedDayPolicy(
            () => 100,
            1,
            undefined,
            PolicySizing.ContractCapped,
        );

        const out = simulateFromState({
            evalDayPolicy: winDayPolicy,
            fundedHorizonDays: 1,
            fundedRiskPerTrade: 0,
            maxAttempts: 1,
            maxEvalDays: 10,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 1,
            start: {
                phase: TradingPhase.Eval,
                state: evalSeedState({
                    balance: 1100,
                    elapsedDays: 1,
                    threshold: 1000,
                    tradingDays: 1,
                }),
            },
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.costPerFundedAccount).toBeCloseTo(50, 6);
    });
});

function baseTrialResult(overrides: Partial<TrialResult> = {}): TrialResult {
    return {
        attemptsUsed: 1,
        closedForInactivity: false,
        daysElapsed: 0,
        daysToPass: null,
        equityCurve: null,
        evalDays: 0,
        evalTradesAtPass: 0,
        failedAttemptDays: [],
        finalBalance: 0,
        firstPayoutDay: null,
        fundedResetFeesPaid: 0,
        fundedResetsUsed: 0,
        grossLosses: 0,
        grossPayout: 0,
        grossWins: 0,
        had5LossStreak: false,
        had10LossStreak: false,
        horizonCredit: 0,
        isAliveAtHorizon: false,
        isTransferredLive: false,
        liveSlotDays: 0,
        liveTransferCash: 0,
        liveTransferOneOff: {
            capitalReturned: 0,
            liquidationPayout: 0,
            transitionCredit: 0,
        },
        maxDrawdown: 0,
        maxLosingStreak: 0,
        net: 0,
        outcome: 'bust-funded',
        payoutCount: 0,
        resetFeesPaid: 0,
        riskTaken: 0,
        totalCost: 0,
        tradesTaken: 0,
        ...overrides,
    };
}

describe('fromStateCashSamples: the imputed continuation window excludes eval-phase days (review finding)', () => {
    it('measures remaining days against the funded window, not the whole from-state trial length', () => {
        const windowDays = 30;
        const freshExpectedMonthlyNet = 630;
        const freshExpectedMonthlyRealizedNet = 315;
        const trial = baseTrialResult({
            daysElapsed: 25,
            evalDays: 20,
            isAliveAtHorizon: false,
            net: -80,
        });

        const { cash, realizedCash } = fromStateCashSamples(
            [trial],
            windowDays,
            freshExpectedMonthlyNet,
            freshExpectedMonthlyRealizedNet,
        );

        const remainingFundedDays =
            windowDays - (trial.daysElapsed - trial.evalDays);
        expect(remainingFundedDays).toBe(25);
        expect(cash[0]).toBeCloseTo(
            trial.net +
                (remainingFundedDays * freshExpectedMonthlyNet) /
                    TRADING_DAYS_PER_MONTH,
            6,
        );
        expect(realizedCash[0]).toBeCloseTo(
            trial.net +
                (remainingFundedDays * freshExpectedMonthlyRealizedNet) /
                    TRADING_DAYS_PER_MONTH,
            6,
        );
    });

    it('an alive-at-horizon trial contributes net plus horizon credit regardless of eval days spent', () => {
        const trial = baseTrialResult({
            evalDays: 20,
            horizonCredit: 40,
            isAliveAtHorizon: true,
            net: 500,
        });
        const { cash, realizedCash } = fromStateCashSamples(
            [trial],
            30,
            999,
            999,
        );
        expect(cash[0]).toBeCloseTo(540, 6);
        expect(realizedCash[0]).toBeCloseTo(500, 6);
    });

    it('a trial sent live contributes its net only, with no imputed continuation', () => {
        const trial = baseTrialResult({
            daysElapsed: 25,
            evalDays: 0,
            isAliveAtHorizon: false,
            isTransferredLive: true,
            liveTransferCash: 120,
            net: 320,
        });
        const { cash, realizedCash } = fromStateCashSamples(
            [trial],
            30,
            999,
            999,
        );
        expect(cash[0]).toBeCloseTo(320, 6);
        expect(realizedCash[0]).toBeCloseTo(320, 6);
    });
});

function topstepNoFeeStandardPlan(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep NoFeeStandard 50K plan not found');
    return plan;
}

function winningDayPolicy() {
    return computedDayPolicy(
        () => 150,
        1,
        undefined,
        PolicySizing.ContractCapped,
    );
}

describe('simulateFromState: TopStep FullRequestOnly waits for its 50% balance-share cap (Q5 default, PT-14 step 4c)', () => {
    const topstep = topstepNoFeeStandardPlan();

    function topstepFundedSeedState(): AccountState {
        return {
            balance: topstep.accountSize,
            bestDayProfit: 0,
            consecutiveIdleDays: 0,
            elapsedDays: 0,
            intradayHighProfit: 0,
            peakDayCloseProfit: 0,
            peakIntradayProfit: 0,
            qualifyingDays: 0,
            startingBalance: topstep.accountSize,
            threshold: topstep.fundedDrawdown.initialThreshold(
                topstep.accountSize,
            ),
            thresholdLocked: false,
            todayPnL: 0,
            tradingDays: 0,
        };
    }

    function runTopStep(horizonDays: number, policy?: PayoutRequestPolicy) {
        return simulateFromState({
            fundedDayPolicy: winningDayPolicy(),
            fundedHorizonDays: horizonDays,
            maxEvalDays: 1,
            minRetainedCushion: 0,
            payoutRequestPolicy: policy,
            payoutRequestSize: policy === undefined ? undefined : 500,
            plan: topstep,
            riskPerTrade: 150,
            rrRatio: 1,
            seed: 1,
            start: {
                phase: TradingPhase.Funded,
                seed: fullFundedSeed({
                    lastPayoutBalance: topstep.accountSize,
                }),
                state: topstepFundedSeedState(),
            },
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });
    }

    it('UpToRequest pays the 50%-of-profit share (not the full $500) on day 5, the 5th winning day', () => {
        const out = runTopStep(5);
        expect(out.fundedPayoutValues).toHaveLength(1);
        expect(out.fundedPayoutValues[0]).toBeCloseTo(
            topstep.payoutFromProfit(375, 0),
            6,
        );
    });

    it('FullRequestOnly pays nothing by day 5, since the 50% share (375) cannot cover the full 500 request', () => {
        const out = runTopStep(5, PayoutRequestPolicy.FullRequestOnly);
        expect(out.fundedPayoutValues.every((value) => value === 0)).toBe(true);
        expect(out.expectedPayoutCount).toBe(0);
    });

    it('FullRequestOnly pays the full 500 once the 50% share reaches it, on day 7 (profit 1050)', () => {
        const out = runTopStep(7, PayoutRequestPolicy.FullRequestOnly);
        expect(out.fundedPayoutValues).toHaveLength(1);
        expect(out.fundedPayoutValues[0]).toBeCloseTo(
            topstep.payoutFromProfit(500, 0),
            6,
        );
    });
});
