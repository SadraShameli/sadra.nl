import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ConsistencyRule,
    ConsistencyScope,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type FundedCycleSnapshot,
    MffuVariant,
    PayoutDayGateBasis,
    type Plan,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    type FundedStateValueConfig,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

import { exactFundedPolicyValue } from '../fundedStateValueToy';

const ACCOUNT_SIZE = 1000;
const DRAWDOWN = 100;
const GATED_PAYOUT_PROFIT = 50;
const WINNING_DAY_PROFIT = 50;
const DAY_START_CUSHIONS = [100, 125, 150, 175];
const TOLERANCE = 1e-9;

const FRESH_CYCLE: FundedCycleSnapshot = {
    cycleBestDayProfit: 0,
    dayGateProgress: 0,
    fundedResetsUsed: 0,
    lastPayoutBalance: ACCOUNT_SIZE,
    payoutsIssued: 0,
};

function consistencyToyPlan(maxBestDayShare: number): Plan {
    return gatedPayoutToyPlan(GATED_PAYOUT_PROFIT).withOverrides({
        fundedConsistency: {
            kind: 'set',
            rule: new ConsistencyRule(
                ConsistencyScope.Funded,
                fraction(maxBestDayShare),
            ),
        },
    });
}

function dayOneTradeAfterWin(
    plan: Plan,
    dayStartCushion: number,
    winDollars: number,
): AccountState {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.threshold = ACCOUNT_SIZE;
    state.thresholdLocked = true;
    state.balance = ACCOUNT_SIZE + dayStartCushion + winDollars;
    state.todayPnL = winDollars;
    return state;
}

function gatedPayoutToyPlan(minPayoutProfit: number): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan.withOverrides({
        accountSize: dollars(ACCOUNT_SIZE),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(DRAWDOWN) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(DRAWDOWN),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => ACCOUNT_SIZE,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(minPayoutProfit),
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

function toyConfig(
    plan: Plan,
    shape: Partial<FundedStateValueConfig> = {},
): FundedStateValueConfig {
    return {
        actionStepMultiple: 0.25,
        convergenceTolerance: 1e-11,
        cushionStepMultiple: 0.5,
        cycleBestDayBucketCount: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 0.25,
        meanHorizonDays: 2,
        plan,
        rrRatio: 1,
        tradesPerDay: 2,
        winrate: 0.5,
        ...shape,
    };
}

function winningDayToyPlan(): Plan {
    return gatedPayoutToyPlan(0).withOverrides({
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(DRAWDOWN),
            lock: {
                atProfit: dollars(50),
                lockedThreshold: () => ACCOUNT_SIZE,
            },
        }),
        minDaysAfterPassForPayout: 1,
        minQualifyingDayProfit: dollars(WINNING_DAY_PROFIT),
        minRetainedCushionOverride: dollars(0),
        payoutDayGateBasis: PayoutDayGateBasis.QualifyingDaysSincePassOrPayout,
    });
}

describe('the funded DP never credits a payout-bearing outcome by interpolating across cushion nodes (N-89)', () => {
    describe('a $1,000 toy with a $100 trailing drawdown that locks at $150 of profit, a $50 cushion step and two $25 trades a day, so the first trade of a day lands between nodes', () => {
        it('values the win-every-trade toy at the hand-solved 12.5: a $50 payout when the third day closes at $150 of profit and locks the drawdown, reached with probability (1 - 1/2)^2 at a two-day mean horizon', () => {
            const config = toyConfig(gatedPayoutToyPlan(GATED_PAYOUT_PROFIT), {
                winrate: 1,
            });
            const result = computeFundedStateValue(config);

            expect(result.initialValue).toBeCloseTo(12.5, 9);
            expect(exactFundedPolicyValue(config, result)).toBeCloseTo(
                12.5,
                9,
            );
        });

        it('equals the exact value of its own policy enumerated on real account state at winrate one half', () => {
            const config = toyConfig(gatedPayoutToyPlan(GATED_PAYOUT_PROFIT));
            const result = computeFundedStateValue(config);

            const exact = exactFundedPolicyValue(config, result);

            expect(exact).toBeGreaterThan(0.1);
            expect(result.initialValue).toBeCloseTo(exact, 9);
        });
    });

    describe('a funded consistency toy: the third day closes at $150 with a $50 best day, one third of the cycle profit', () => {
        it.each([
            [0.34, 12.5],
            [0.3, 18.75],
        ])(
            'at a %f best-day share the win-every-trade toy is worth %f, equal to the exact value of its own policy enumerated on real account state',
            (maxBestDayShare, expectedValue) => {
                const config = toyConfig(consistencyToyPlan(maxBestDayShare), {
                    cycleBestDayBucketCount: 24,
                    meanHorizonDays: 2,
                    winrate: 1,
                });
                const result = computeFundedStateValue(config);

                expect(result.initialValue).toBeCloseTo(expectedValue, 9);
                expect(exactFundedPolicyValue(config, result)).toBeCloseTo(
                    expectedValue,
                    9,
                );
            },
        );
    });

    describe('a winning-day toy: a $50 day opens the payout, the cushion grid holds every landing', () => {
        it('equals the exact value of its own policy enumerated on real account state', () => {
            const config = toyConfig(winningDayToyPlan(), {
                cushionStepMultiple: 0.25,
            });
            const result = computeFundedStateValue(config);

            const exact = exactFundedPolicyValue(config, result);

            expect(exact).toBeGreaterThan(1);
            expect(Math.abs(result.initialValue - exact)).toBeLessThan(
                TOLERANCE,
            );
        });
    });

    describe('the replay builds its policy from the exact day-start cushion and the exact day P&L', () => {
        const plan = winningDayToyPlan();
        const coarse = computeFundedStateValue(toyConfig(plan));
        const fine = computeFundedStateValue(
            toyConfig(plan, { convergenceTolerance: 1e-9, cushionStepMultiple: 0.125 }),
        );

        it.each(DAY_START_CUSHIONS)(
            'treats 25 dollars of day P&L as short of the 50 dollar winning day from a day-start cushion of %i dollars, the way a grid that holds that cushion does',
            (dayStartCushion) => {
                const state = dayOneTradeAfterWin(plan, dayStartCushion, 25);

                const coarseRisk = coarse.dayPolicy.computeRisk?.(
                    state,
                    1,
                    FRESH_CYCLE,
                );
                const fineRisk = fine.dayPolicy.computeRisk?.(
                    state,
                    1,
                    FRESH_CYCLE,
                );

                expect(fineRisk).toBe(0);
                expect(coarseRisk).toBe(fineRisk);
            },
        );
    });
});
