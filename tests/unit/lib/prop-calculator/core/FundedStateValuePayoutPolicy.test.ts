import { describe, expect, expectTypeOf, it } from 'vitest';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    type AccountState,
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
} from '~/lib/prop-calculator/core';
import {
    type EvalGridConfig,
    type FundedGridConfig,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import { type EvalStateValueConfig } from '~/lib/prop-calculator/core/EvalStateValue';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
    warmFirmsRegistryCache,
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
                    fundedCycleAfter(lastPayoutBalance),
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
        actionStepMultiple: 1,
        cushionStepMultiple: 1,
        cycleBaselineFineRangeMultiple: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        meanHorizonDays: 20,
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

function fundedCycleAfter(lastPayoutBalance: number): FundedCycleSnapshot {
    return {
        cycleBestDayProfit: 0,
        dayGateProgress: 0,
        fundedResetsUsed: 0,
        lastPayoutBalance,
        payoutsIssued: 1,
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

function topStepCoarseConfig(plan: Plan): FundedStateValueConfig {
    return {
        actionStepMultiple: 1,
        cushionStepMultiple: 1,
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
    return plan.withOverrides({});
}

function uncappedToyPlan(): Plan {
    return payoutRequestCapToyPlan().withOverrides({
        payoutRequestCap: undefined,
    });
}

describe('FundedStateValue without a payout request size keeps its pins (PT-47a, PD-31)', () => {
    it('payout-request-cap toy: initialValue, sweep count and the post-payout risk. Re-pinned for WP58c (N-86 stage 2): sweepCount moved from 28 to 52 because the coarse cushion tail is on by default now, widening the locked cushion grid this toy solves over; initialValue and the risk pin are unaffected since this toy never reaches past the old top. Re-pinned for WP60 (N-89): sweepCount moved from 52 to 53 with initialValue and the risk pin unchanged to 1e-10, because the day tree reads the payout continuation at its exact landing', () => {
        const result = computeFundedStateValue(
            payoutRequestCapConfig(payoutRequestCapToyPlan()),
        );
        expect(result.initialValue).toBeCloseTo(250, 10);
        expect(result.sweepCount).toBe(53);
        expect(
            result.dayPolicy.computeRisk?.(
                lockedStateAt(1150),
                0,
                fundedCycleAfter(1150),
            ),
        ).toBe(100);
    });

    it('coarse TopStep: initialValue, sweep count and sampled risks. Re-pinned for N-86 (WP54): continuationKey interpolates the day-close cushion at the lock transition instead of floor-rounding it down. Re-pinned for WP58c (N-86 stage 2): the coarse cushion tail is on by default, so TopStep (the audit N-86 driver) is no longer truncated at the old top and its value rises. Re-pinned for PT-T1b: solved at cushion and action step 1 drawdown, a 20 day horizon and a tail of 8 drawdowns above the 6 drawdown fine top, instead of cushion step 0.25 and action step 0.5, a 100 day horizon and the default 30 drawdown tail, which took 350,610 states and 117 to 129 s; the tail still lifts the value, from 928.18 with the tail off to 1,063.63, and both risk pins are now the $2,000 action step. Re-pinned for WP60 (N-89): the within-day tree values a day close at the exact cushion of the landing, where it used to clamp a landing above the fine top to the day-close value of the top cell and so never credited the payout of the cushion above it (TopStep at 2 gate days and a 12 day horizon solved 1,625.71, 1,848.27 and 1,906.86 at tops of 6, 12 and 20 drawdowns before, against 1,820.92, 1,909.27 and 1,921.82 now, so the gap closes as the top rises): the tail-off value moved from 928.18 to 1,169.34, the tail-8 value from 1,063.63 to 1,261.32 and the sweeps from 123 to 105', () => {
        const plan = topStepPlan();
        const tailOff = computeFundedStateValue({
            ...topStepCoarseConfig(plan),
            maxTailCushionMultiple: 6,
            meanHorizonDays: 20,
        });
        const result = computeFundedStateValue({
            ...topStepCoarseConfig(plan),
            maxTailCushionMultiple: 8,
            meanHorizonDays: 20,
        });
        expect(tailOff.initialValue).toBeCloseTo(1169.338118183659, 6);
        expect(result.initialValue).toBeGreaterThan(tailOff.initialValue);
        expect(result.initialValue).toBeCloseTo(1261.322613670608, 6);
        expect(result.sweepCount).toBe(105);
        expect(result.dayPolicy.computeRisk?.(fundedStart(plan), 0)).toBe(2000);
        expect(
            result.dayPolicy.computeRisk?.(lockedStateAt(52_000, 50_000), 0),
        ).toBe(2000);
    });

    it('FTMO Futures Growth 50K at fine range multiple 1: initialValue, sweep count and sampled risks. Re-pinned for N-86 (WP54): the day-close cushion interpolation moved the pin by a few cents. Pinned back to the 6 drawdown fine top for WP58d (this pin studies the payout request policy, not the grid, so the cushion tail is pinned off). Re-pinned for PT-T1b: solved at cushion and action step 1 drawdown and a 20 day horizon instead of 0.25 and 60 days, which took 14,414.89 over 387 sweeps and 8 to 18 s; the two risk pins are now the $1,000 action step and the same 0. Re-pinned for WP60 (N-89): the within-day tree values a day close at the exact cushion of the landing, where it used to clamp a landing above the fine top to the day-close value of the top cell and so never credited the payout of the cushion above it (this FTMO Growth config solved 2,069.52, 2,458.46 and 2,533.40 at fine tops of 6, 12 and 20 drawdowns before, against 2,395.14, 2,517.59 and 2,539.95 now, so the gap closes as the top rises): the value moved from 2,069.52 to 2,395.14 and the sweeps from 149 to 133', async () => {
        const plan = await ftmoGrowthPlan();
        const result = computeFundedStateValue({
            ...ftmoGrowthConfig(plan.withOverrides({})),
            maxTailCushionMultiple: 6,
        });
        expect(result.unconvergedLevelCount).toBe(0);
        expect(result.initialValue).toBeCloseTo(2395.1429998488943, 6);
        expect(result.sweepCount).toBe(133);
        expect(result.dayPolicy.computeRisk?.(fundedStart(plan), 0)).toBe(1000);
        expect(result.dayPolicy.computeRisk?.(fundedStart(plan), 1)).toBe(0);
    });

    it('FTMO Futures Growth 50K with a 2 drawdown action cap: the policy opens at the intermediate $1,000 action under the $2,000 cap, and the value rises from 2,069.52 to 2,070.96 over 158 sweeps, so the risk pin separates an intermediate action from both zero and the cap (PT-T1b review: the one-action grid above only separates 0 from full). Re-pinned for WP60 (N-89): the value moved from 2,069.52 and 2,070.96 to 2,395.14 and 2,400.58 and the sweeps from 158 to 134, for the day-close reason of the pin above', async () => {
        const plan = await ftmoGrowthPlan();
        const result = computeFundedStateValue({
            ...ftmoGrowthConfig(plan.withOverrides({})),
            maxActionMultiple: 2,
            maxTailCushionMultiple: 6,
        });
        expect(result.unconvergedLevelCount).toBe(0);
        expect(result.initialValue).toBeCloseTo(2400.5756647724074, 6);
        expect(result.sweepCount).toBe(134);
        expect(result.dayPolicy.computeRisk?.(fundedStart(plan), 0)).toBe(1000);
        expect(result.dayPolicy.computeRisk?.(fundedStart(plan), 1)).toBe(0);
    });
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
    });

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
    });
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
    });

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

describe('FundedStateValue retained cushion on the coarse TopStep config (PT-47a)', () => {
    it('resolves a requested 2,000 cushion to max(2000, the plan floor) and values it differently from the default. Pinned back to the 6 drawdown fine top for WP58d (the retained cushion, not the grid, is under test here, so the cushion tail is pinned off). Re-pinned for PT-T1b: solved at cushion and action step 1 drawdown instead of 0.25 and 0.5, where the 2,000 cushion gave 5,072.58 against the 5,081.86 default (WP62 moved them from 5,072.59 and 5,081.89) and took 10 to 14 s; here 1,798.33 against 1,801.46. Re-pinned for WP60 (N-89): 2,728.38 against 2,731.42, for the day-close reason of the coarse TopStep pin above (the converged fine grids moved too: cushion step 0.25 and action step 0.5 gave 5,081.86 before and 6,054.52 now)', () => {
        const plan = topStepPlan();
        expect(plan.resolveRetainedCushion(2000)).toBe(
            Math.max(2000, plan.defaultRetainedCushion()),
        );
        const result = computeFundedStateValue({
            ...topStepCoarseConfig(plan),
            maxTailCushionMultiple: 6,
            minRetainedCushion: 2000,
        });
        expect(result.initialValue).toBeCloseTo(2728.384308586417, 6);
        expect(result.initialValue).not.toBeCloseTo(2731.4204640040384, 2);
    });

    it('equals the default pin at a requested cushion of 0, which resolves to the plan floor. Pinned back to the 6 drawdown fine top for WP58d (the retained cushion, not the grid, is under test here). Re-pinned for PT-T1b: solved at cushion and action step 1 drawdown instead of 0.25 and 0.5, where the default was 5,081.86 after WP62 moved it from 5,081.89; here 1,801.46. Re-pinned for WP60 (N-89): 2,731.42, for the day-close reason of the coarse TopStep pin above', () => {
        const plan = topStepPlan();
        expect(plan.resolveRetainedCushion(0)).toBe(
            plan.resolveRetainedCushion(undefined),
        );
        const result = computeFundedStateValue({
            ...topStepCoarseConfig(plan),
            maxTailCushionMultiple: 6,
            minRetainedCushion: 0,
        });
        expect(result.initialValue).toBeCloseTo(2731.4204640040384, 6);
    });
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
    });
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
