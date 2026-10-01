import { availableParallelism } from 'node:os';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    type AccountState,
    AlphaFuturesVariant,
    createInitialState,
    DailyLossLimitKind,
    type Dollars,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    FtmoFuturesVariant,
    type FundedCycleSnapshot,
    FundedResetEligibility,
    MffuVariant,
    newFundedCycleTracker,
    PayoutFloorEffect,
    PayoutRequestPolicy,
    type Plan,
    type PlanOptIns,
    withPlanOptIns,
} from '~/lib/prop-calculator/core';
import {
    type EvalGridConfig,
    type FundedGridConfig,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import { type EvalStateValueConfig } from '~/lib/prop-calculator/core/EvalStateValue';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
    FundedWorkerSession,
    warmFirmsRegistryCache,
    withRegistryPlanOptIns,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { simulate } from '~/lib/prop-calculator/simulator';

const TOY_REQUEST_SIZE = dollars(150);
const RESET_FEE = 20;

function baselineRisks(
    result: ReturnType<typeof computeFundedStateValue>,
): (number | undefined)[] {
    const risks: (number | undefined)[] = [];
    for (const balance of [1100, 1150, 1200, 1250, 1300]) {
        for (const lastPayoutBalance of [1100, 1150, 1200, 1250]) {
            risks.push(
                result.dayPolicy.computeRisk?.(
                    lockedStateAt(balance),
                    0,
                    fundedCycleAfter(1, lastPayoutBalance),
                ),
            );
        }
    }
    return risks;
}

function baselineSensitiveConfig(plan: Plan): FundedStateValueConfig {
    return {
        actionStepMultiple: 0.25,
        cushionStepMultiple: 0.25,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        meanHorizonDays: 60,
        plan,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.5,
    };
}

function coarseAlphaConfig(plan: Plan): FundedStateValueConfig {
    return {
        actionStepMultiple: 0.5,
        cushionStepMultiple: 0.5,
        cycleBestDayBucketCount: 2,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxCushionMultiple: 2,
        meanHorizonDays: 20,
        payoutRegimeCap: 1,
        plan,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.5,
    };
}

function freshStartCreditToyPlan(): Plan {
    return onePayoutToyPlan().withOverrides({
        fundedReset: {
            eligibility: FundedResetEligibility.NoPayoutEverRequested,
            fee: dollars(RESET_FEE),
            label: 'Toy Reset',
            maxPerAccount: 2,
            windowCalendarDays: 7,
        },
        maxConsecutiveIdleDays: 1,
        minRetainedCushionOverride: dollars(50),
        payoutFloorEffect: PayoutFloorEffect.None,
        payoutLadder: {
            capsAtLastStep: true,
            minRequestAmount: dollars(0),
            steps: [100],
        },
        takesFundedReset: true,
    });
}

function ftmoGrowthConfig(plan: Plan): FundedStateValueConfig {
    return {
        actionStepMultiple: 0.25,
        cushionStepMultiple: 0.25,
        cycleBaselineFineRangeMultiple: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        meanHorizonDays: 60,
        payoutRegimeCap: 2,
        plan,
        rrRatio: 2,
        tradesPerDay: 2,
        winrate: 0.5,
    };
}

async function ftmoGrowthPlan(): Promise<Plan> {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find(
        (firm) => firm.id === FirmId.FtmoFutures,
    )?.findPlan({
        accountSize: 50_000,
        firm: FirmId.FtmoFutures,
        variant: FtmoFuturesVariant.Growth,
    });
    if (!plan) throw new Error('FTMO Futures Growth 50K plan not found');
    return plan;
}

function fundedCycleAfter(
    payoutsIssued: number,
    lastPayoutBalance: number,
): FundedCycleSnapshot {
    return {
        cycleBestDayProfit: 0,
        dayGateProgress: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance,
        payoutsIssued,
    };
}

function fundedStart(plan: Plan): AccountState {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return state;
}

function lockedStateAt(balance: number, startingBalance = 1000): AccountState {
    const state = createInitialState(startingBalance, startingBalance);
    state.balance = balance;
    state.threshold = startingBalance;
    state.thresholdLocked = true;
    return state;
}

function multiPayoutToyPlan(): Plan {
    return onePayoutToyPlan().withOverrides({
        maxLifetimePayouts: undefined,
    });
}

function noPayoutToyPlan(): Plan {
    return onePayoutToyPlan().withOverrides({
        minPayoutProfit: dollars(1_000_000),
    });
}

function oneDayHorizonConfig(plan: Plan): FundedStateValueConfig {
    return {
        actionStepMultiple: 1,
        cushionStepMultiple: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        meanHorizonDays: 1,
        plan,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 1,
    };
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
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
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

function payoutRequestCapConfig(plan: Plan): FundedStateValueConfig {
    return {
        actionStepMultiple: 1,
        cushionStepMultiple: 0.5,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        plan,
        rrRatio: 1,
        tradesPerDay: 1,
        winrate: 1,
    };
}

function payoutRequestCapToyPlan(): Plan {
    return onePayoutToyPlan().withOverrides({
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: 2,
        minPayoutProfit: dollars(300),
        minPayoutProfitPerCycle: dollars(0.01),
        payoutRequestCap: TOY_REQUEST_SIZE,
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

async function registryAlphaStandard(): Promise<Plan> {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find(
        (firm) => firm.id === FirmId.AlphaFutures,
    )?.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Standard,
    });
    if (!plan) throw new Error('Alpha Futures Standard 50K plan not found');
    return plan;
}

function topStepCoarseConfig(plan: Plan): FundedStateValueConfig {
    return {
        actionStepMultiple: 0.5,
        cushionStepMultiple: 0.25,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 3,
        meanHorizonDays: 100,
        payoutRegimeCap: 1,
        plan,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.5,
    };
}

function topStepPlan(): Plan {
    const plan = new TopStep().plans[0];
    if (!plan) throw new Error('No TopStep plan registered');
    return plan;
}

function uncappedToyPlan(): Plan {
    return payoutRequestCapToyPlan().withOverrides({
        payoutRequestCap: undefined,
    });
}

describe('FundedStateValue without a payout request size keeps its pins (PT-47a, PD-31)', () => {
    it('payout-request-cap toy: initialValue, sweep count and the post-payout risk. Re-pinned for WP58c (N-86 stage 2): sweepCount moved from 28 to 52 because the coarse cushion tail is on by default now, widening the locked cushion grid this toy solves over; initialValue and the risk pin are unaffected since this toy never reaches past the old top', () => {
        const result = computeFundedStateValue(
            payoutRequestCapConfig(payoutRequestCapToyPlan()),
        );
        expect(result.initialValue).toBeCloseTo(250, 10);
        expect(result.sweepCount).toBe(52);
        expect(
            result.dayPolicy.computeRisk?.(
                lockedStateAt(1150),
                0,
                fundedCycleAfter(1, 1150),
            ),
        ).toBe(100);
    });

    it('coarse TopStep: initialValue, sweep count and sampled risks. Re-pinned for N-86 (WP54): initialValue moved from 5081.6891952778915 to 5081.88878430116 and sweepCount from 332 to 358 (both risk pins unchanged) because TopStep locks its funded drawdown at a fixed dollar threshold, and continuationKey now interpolates the day-close cushion at that lock transition instead of floor-rounding it down. Re-pinned again for WP58c (N-86 stage 2): the coarse cushion tail is on by default now, reaching 30 drawdowns above the locked floor instead of 6, so TopStep (this plan is the audit N-86 driver) is no longer truncated at the old top: initialValue moved from 5081.88878430116 to 7113.52900787553 (+2031.64, the expected direction: the old top was undervaluing this plan) and sweepCount from 358 to 466 (both risk pins unchanged, the sampled cushions here are still well inside the fine range)', () => {
        const plan = topStepPlan();
        const result = computeFundedStateValue(topStepCoarseConfig(plan));
        expect(result.initialValue).toBeCloseTo(7113.52900787553, 6);
        expect(result.sweepCount).toBe(466);
        expect(result.dayPolicy.computeRisk?.(fundedStart(plan), 0)).toBe(1000);
        expect(
            result.dayPolicy.computeRisk?.(lockedStateAt(52_000, 50_000), 0),
        ).toBe(1000);
    }, 120_000);

    it('FTMO Futures Growth 50K at fine range multiple 1: initialValue, sweep count and sampled risks. Re-pinned for N-86 (WP54): initialValue moved from 14_414.82874384173 to 14_414.892599117371 and sweepCount from 366 to 387 (both risk pins unchanged), the same tiny day-close cushion interpolation move pinned in FundedStateValue.test.ts’s T11 "landed" case. Pinned back to the 6 drawdown fine top for WP58d (the WP58c re-pin to the default 30 drawdown coarse tail moved initialValue to 14_058.431864665115 and sweepCount to 613 and took this test from 8 s to 37 s, 4.6x; this pin studies the payout request policy, not the grid, so the cushion tail is pinned off and the WP54 values are restored)', async () => {
        const plan = await ftmoGrowthPlan();
        const result = computeFundedStateValue({
            ...ftmoGrowthConfig(plan),
            maxTailCushionMultiple: 6,
        });
        expect(result.unconvergedLevelCount).toBe(0);
        expect(result.initialValue).toBeCloseTo(14_414.892599117371, 6);
        expect(result.sweepCount).toBe(387);
        expect(result.dayPolicy.computeRisk?.(fundedStart(plan), 0)).toBe(500);
        expect(result.dayPolicy.computeRisk?.(fundedStart(plan), 1)).toBe(0);
    }, 600_000);
});

describe('FundedStateValue honours a payout request size on the post-payout baseline (PT-47a, N-72)', () => {
    it('pays 150 then 100 on the uncapped toy with a 150 request, exactly like the 150 request cap', () => {
        const result = computeFundedStateValue({
            ...payoutRequestCapConfig(uncappedToyPlan()),
            payoutRequestSize: TOY_REQUEST_SIZE,
        });
        expect(result.initialValue).toBeCloseTo(250, 10);
    });

    it.each([0, -150, NaN, Infinity])(
        'rejects a payout request size of %s instead of solving with it',
        (payoutRequestSize) => {
            expect(() =>
                computeFundedStateValue({
                    ...payoutRequestCapConfig(uncappedToyPlan()),
                    payoutRequestSize: dollars(payoutRequestSize),
                }),
            ).toThrow(/payoutRequestSize must be a finite number > 0/);
        },
    );

    it('values the uncapped toy differently without a request size', () => {
        const withoutSize = computeFundedStateValue(
            payoutRequestCapConfig(uncappedToyPlan()),
        );
        expect(withoutSize.initialValue).not.toBeCloseTo(250, 6);
    });

    it('agrees with a simulate() replay at winrate 1 with the same request size', () => {
        const plan = uncappedToyPlan();
        const result = computeFundedStateValue({
            ...payoutRequestCapConfig(plan),
            payoutRequestSize: TOY_REQUEST_SIZE,
        });
        const out = simulate({
            fundedDayPolicy: result.dayPolicy,
            fundedHorizonDays: 50,
            maxEvalDays: 1,
            payoutRequestSize: TOY_REQUEST_SIZE,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 100,
            winrate: 1,
        });
        expect(out.expectedGrossPayout).toBeCloseTo(250, 10);
        expect(out.expectedGrossPayout).toBeCloseTo(result.initialValue, 10);
    }, 15_000);

    it('reads the matching baseline level in computeRisk: a request size solves exactly like the same plan with an equal request cap, value and risk at every sampled post-payout balance and last payout balance', () => {
        const sized = computeFundedStateValue({
            ...baselineSensitiveConfig(uncappedToyPlan()),
            payoutRequestSize: TOY_REQUEST_SIZE,
        });
        const capped = computeFundedStateValue(
            baselineSensitiveConfig(payoutRequestCapToyPlan()),
        );
        expect(sized.initialValue).toBe(capped.initialValue);
        expect(sized.reachedStateCount).toBe(capped.reachedStateCount);
        expect(baselineRisks(sized)).toStrictEqual(baselineRisks(capped));
    }, 60_000);
});

describe('FundedStateValue caps the horizon credit at the payout request size (PT-47a, T32)', () => {
    it('credits one request of the given size at the horizon on the no-payout toy: V = -dayCost + winrate * 40 = 15, not the uncapped 45', () => {
        const config = {
            actionStepMultiple: 1,
            cushionStepMultiple: 1,
            dayCost: 5,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 1,
            meanHorizonDays: 1,
            plan: noPayoutToyPlan(),
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: 0.5,
        };
        expect(computeFundedStateValue(config).initialValue).toBeCloseTo(
            45,
            10,
        );
        expect(
            computeFundedStateValue({
                ...config,
                payoutRequestSize: dollars(40),
            }).initialValue,
        ).toBeCloseTo(15, 10);
    });

    it('lowers the multi-payout toy value with a request below the withdrawable, and a simulate() replay over the same one-day horizon with the same size and seed agrees, horizon credit included', () => {
        const plan = multiPayoutToyPlan();
        const requestSize = dollars(40);
        const withoutSize = computeFundedStateValue(oneDayHorizonConfig(plan));
        const sized = computeFundedStateValue({
            ...oneDayHorizonConfig(plan),
            payoutRequestSize: requestSize,
        });
        expect(sized.initialValue).toBeLessThan(withoutSize.initialValue);

        const out = simulate({
            fundedDayPolicy: sized.dayPolicy,
            fundedHorizonDays: 1,
            maxEvalDays: 1,
            payoutRequestSize: requestSize,
            plan,
            riskPerTrade: 100,
            rrRatio: 2,
            seed: 7,
            tradesPerDay: 1,
            trials: 100,
            winrate: 1,
        });
        expect(out.expectedHorizonCredit).toBeLessThanOrEqual(
            requestSize + 1e-9,
        );
        expect(out.expectedGrossPayout + out.expectedHorizonCredit).toBeCloseTo(
            sized.initialValue,
            10,
        );
    }, 15_000);

    it('credits a fresh start after a funded reset with newFundedCycleTracker(fresh).closeoutCredit at the same size, through the solved value', () => {
        const plan = freshStartCreditToyPlan();
        const requestSize = dollars(20);
        const fresh = fundedStart(plan);
        const freshCredit = newFundedCycleTracker(fresh).closeoutCredit({
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: requestSize,
            plan,
            state: fresh,
        });
        const uncappedFreshCredit = newFundedCycleTracker(fresh).closeoutCredit(
            {
                minRetainedCushion: plan.resolveRetainedCushion(undefined),
                plan,
                state: fresh,
            },
        );
        expect(freshCredit).toBe(requestSize);
        expect(uncappedFreshCredit).toBeGreaterThan(freshCredit);

        const result = computeFundedStateValue({
            ...oneDayHorizonConfig(plan),
            payoutRequestSize: requestSize,
            winrate: 0.5,
        });
        expect(result.dayPolicy.computeRisk?.(fresh, 0)).toBe(100);
        expect(result.initialValue).toBeCloseTo(
            0.5 * requestSize + 0.5 * (-RESET_FEE + freshCredit),
            10,
        );
    });
});

describe('FundedStateValue sends the payout request size to its workers (PT-47a)', () => {
    const RESET_TAKEN: PlanOptIns = {
        takesFundedReset: true,
        takesOneTimeEarlyWithdrawal: false,
    };

    it('solves an opted-in registry plan with a request size on a FundedWorkerSession to exactly the single-threaded value, which differs from the unsized value', async () => {
        const registry = await registryAlphaStandard();
        const requestSize = dollars(1000);
        const session = new FundedWorkerSession();
        try {
            const pooled = computeFundedStateValue(
                {
                    ...coarseAlphaConfig(
                        withRegistryPlanOptIns(registry, RESET_TAKEN),
                    ),
                    payoutRequestSize: requestSize,
                },
                session,
            );
            const alone = computeFundedStateValue({
                ...coarseAlphaConfig(withPlanOptIns(registry, RESET_TAKEN)),
                payoutRequestSize: requestSize,
            });
            const unsized = computeFundedStateValue(
                coarseAlphaConfig(withPlanOptIns(registry, RESET_TAKEN)),
            );

            expect(pooled.workerCount > 0).toBe(availableParallelism() > 1);
            expect(alone.workerCount).toBe(0);
            expect(pooled.initialValue).toBe(alone.initialValue);
            expect(pooled.initialValue).not.toBeCloseTo(
                unsized.initialValue,
                2,
            );
        } finally {
            session.release();
        }
    }, 600_000);
});

describe('FundedStateValue retained cushion on the coarse TopStep config (PT-47a)', () => {
    it('resolves a requested 2,000 cushion to max(2000, the plan floor) and values it differently from the default. Pinned back to the 6 drawdown fine top for WP58d (the WP58c re-pin to the default 30 drawdown coarse tail moved initialValue from 5072.586527996037 to 7107.689015613951 and took this test to 24 s; the retained cushion, not the grid, is under test here, so the cushion tail is pinned off and the WP54 values are restored; the tail-on TopStep default pin stays in the coarse TopStep test above)', () => {
        const plan = topStepPlan();
        expect(plan.resolveRetainedCushion(2000)).toBe(
            Math.max(2000, plan.defaultRetainedCushion()),
        );
        const result = computeFundedStateValue({
            ...topStepCoarseConfig(plan),
            maxTailCushionMultiple: 6,
            minRetainedCushion: 2000,
        });
        expect(result.initialValue).toBeCloseTo(5072.586527996037, 6);
        expect(result.initialValue).not.toBeCloseTo(5081.88878430116, 2);
    }, 120_000);

    it('equals the default pin at a requested cushion of 0, which resolves to the plan floor. Re-pinned for N-86 (WP54): moved with the coarse TopStep default pin above, from 5081.6891952778915 to 5081.88878430116. Pinned back to the 6 drawdown fine top for WP58d (the WP58c re-pin to the default 30 drawdown coarse tail moved it to 7113.52900787553 and took this test to 24 s; the retained cushion, not the grid, is under test here, so the cushion tail is pinned off and the WP54 value is restored)', () => {
        const plan = topStepPlan();
        expect(plan.resolveRetainedCushion(0)).toBe(
            plan.resolveRetainedCushion(undefined),
        );
        const result = computeFundedStateValue({
            ...topStepCoarseConfig(plan),
            maxTailCushionMultiple: 6,
            minRetainedCushion: 0,
        });
        expect(result.initialValue).toBeCloseTo(5081.88878430116, 6);
    }, 120_000);
});

describe('FundedStateValue without a payout request policy keeps its pins (PT-47b, PD-31)', () => {
    it('omitting payoutRequestPolicy equals passing the UpToRequest default explicitly', () => {
        const plan = payoutRequestCapToyPlan();
        const withoutPolicy = computeFundedStateValue(
            payoutRequestCapConfig(plan),
        );
        const withDefaultPolicy = computeFundedStateValue({
            ...payoutRequestCapConfig(plan),
            payoutRequestPolicy: PayoutRequestPolicy.UpToRequest,
        });
        expect(withDefaultPolicy.initialValue).toBe(withoutPolicy.initialValue);
        expect(withoutPolicy.initialValue).toBeCloseTo(250, 10);
    });
});

describe('FundedStateValue honours the payout request policy when the withdrawable cannot cover the whole request (PT-47b, PD-40)', () => {
    const plan = uncappedToyPlan();
    const requestSize = dollars(500);

    it('FullRequestOnly waits for the full amount where UpToRequest settles for less, changing the solved value', () => {
        const upToRequest = computeFundedStateValue({
            ...payoutRequestCapConfig(plan),
            payoutRequestSize: requestSize,
        });
        const fullRequestOnly = computeFundedStateValue({
            ...payoutRequestCapConfig(plan),
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: requestSize,
        });
        expect(fullRequestOnly.initialValue).not.toBeCloseTo(
            upToRequest.initialValue,
            2,
        );
    });

    it('a simulate() replay at winrate 1 under FullRequestOnly with the same size and seed agrees with the solved value, credit included', () => {
        const fullRequestOnly = computeFundedStateValue({
            ...payoutRequestCapConfig(plan),
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: requestSize,
        });
        const out = simulate({
            fundedDayPolicy: fullRequestOnly.dayPolicy,
            fundedHorizonDays: 50,
            maxEvalDays: 1,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: requestSize,
            plan,
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 100,
            winrate: 1,
        });
        expect(out.expectedGrossPayout + out.expectedHorizonCredit).toBeCloseTo(
            fullRequestOnly.initialValue,
            6,
        );
    }, 15_000);
});

describe('FundedStateValue sends the payout request policy to its workers (PT-47b)', () => {
    const RESET_TAKEN: PlanOptIns = {
        takesFundedReset: true,
        takesOneTimeEarlyWithdrawal: false,
    };

    it('solves an opted-in registry plan with a policy and a request size on a FundedWorkerSession to exactly the single-threaded value', async () => {
        const registry = await registryAlphaStandard();
        const requestSize = dollars(1000);
        const session = new FundedWorkerSession();
        try {
            const pooled = computeFundedStateValue(
                {
                    ...coarseAlphaConfig(
                        withRegistryPlanOptIns(registry, RESET_TAKEN),
                    ),
                    payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                    payoutRequestSize: requestSize,
                },
                session,
            );
            const alone = computeFundedStateValue({
                ...coarseAlphaConfig(withPlanOptIns(registry, RESET_TAKEN)),
                payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                payoutRequestSize: requestSize,
            });

            expect(pooled.workerCount > 0).toBe(availableParallelism() > 1);
            expect(alone.workerCount).toBe(0);
            expect(pooled.initialValue).toBe(alone.initialValue);
        } finally {
            session.release();
        }
    }, 600_000);
});

describe('AverageRewardSolver exports its grid configs for the DP advice source (PT-47a to PT-30)', () => {
    it('lets a caller set the funded payout request size, policy and retained cushion, and the eval grid step', () => {
        expectTypeOf<FundedGridConfig['payoutRequestSize']>().toEqualTypeOf<
            Dollars | undefined
        >();
        expectTypeOf<FundedGridConfig['payoutRequestPolicy']>().toEqualTypeOf<
            FundedStateValueConfig['payoutRequestPolicy']
        >();
        expectTypeOf<FundedGridConfig['minRetainedCushion']>().toEqualTypeOf<
            FundedStateValueConfig['minRetainedCushion']
        >();
        expectTypeOf<EvalGridConfig['cushionStepDollars']>().toEqualTypeOf<
            EvalStateValueConfig['cushionStepDollars']
        >();
    });
});
