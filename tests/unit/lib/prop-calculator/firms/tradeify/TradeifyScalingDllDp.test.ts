import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    computeEvalStateValue,
    contracts,
    createInitialState,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    PayoutFloorEffect,
    type Plan,
    TierBasis,
    TradeifyVariant,
} from '~/lib/prop-calculator/core';
import {
    computeFundedStateValue,
    isFundedDpEligible,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { Tradeify } from '~/lib/prop-calculator/firms/tradeify/Tradeify';
import { simulate } from '~/lib/prop-calculator/simulator';

const LOW_TIER_DLL = 50;
const HIGH_TIER_DLL = 1000;
const REACH_BREAKPOINT = 100;
const PARITY_TRIALS = 200_000;
const PARITY_WINRATE = 0.4;

function dpAgainstSimulate(plan: Plan) {
    const result = solve(plan, PARITY_WINRATE);
    const out = simulate({
        fundedDayPolicy: result.dayPolicy,
        fundedHorizonDays: 400,
        maxEvalDays: 1,
        plan,
        riskPerTrade: 100,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 2,
        trials: PARITY_TRIALS,
        winrate: PARITY_WINRATE,
    });
    return {
        empiricalValue:
            out.expectedGrossPayout +
            out.fundedBustProbability * result.bustTerminalValue,
        result,
    };
}

function growthPlan(): Plan {
    const plan = new Tradeify().findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Growth,
    });
    if (!plan) throw new Error('Tradeify Growth 50K plan not found');
    return plan;
}

function scalingDllToyPlan(tierBasis: TierBasis): Plan {
    return growthPlan().withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: {
            kind: DailyLossLimitKind.Tiered,
            tierBasis,
            tiers: [
                {
                    dailyLossLimit: dollars(LOW_TIER_DLL),
                    maxContracts: contracts(1),
                    minProfit: dollars(0),
                },
                {
                    dailyLossLimit: dollars(HIGH_TIER_DLL),
                    maxContracts: contracts(1),
                    minProfit: dollars(REACH_BREAKPOINT),
                },
            ],
        },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        isInstantFunded: true,
        maxConsecutiveIdleDays: undefined,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: null,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function solve(plan: Plan, winrate: number) {
    return computeFundedStateValue({
        actionStepMultiple: 0.5,
        cushionStepMultiple: 0.5,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        payoutRegimeCap: 0,
        plan,
        rrRatio: 2,
        tradesPerDay: 2,
        winrate,
    });
}

function unlockedState(options: {
    committedPeak: number;
    profit: number;
    runningHigh: number;
    todayPnL: number;
}): AccountState {
    const state = createInitialState(1000, 950);
    state.balance = 1000 + options.profit;
    state.todayPnL = options.todayPnL;
    state.peakDayCloseProfit = 50;
    state.peakIntradayProfit = options.committedPeak;
    state.intradayHighProfit = options.runningHigh;
    return state;
}

describe('funded DP ratchets the Tradeify scaling DLL on the intraday reach (N-15, help article 10468321)', () => {
    it('keeps the real Growth plan eligible for the funded DP', () => {
        expect(isFundedDpEligible(growthPlan())).toBe(true);
    });

    it('values the intraday-reach toy exactly like a real simulate() run driven by its own policy', () => {
        const { empiricalValue, result } = dpAgainstSimulate(
            scalingDllToyPlan(TierBasis.PeakIntradayProfit),
        );

        expect(empiricalValue).toBeCloseTo(result.initialValue, 0);
    }, 300_000);

    it('values the intraday reach strictly above the peak-session-close basis on the same toy', () => {
        const intraday = solve(
            scalingDllToyPlan(TierBasis.PeakIntradayProfit),
            PARITY_WINRATE,
        );
        const sessionClose = solve(
            scalingDllToyPlan(TierBasis.PeakSessionCloseProfit),
            PARITY_WINRATE,
        );

        expect(intraday.initialValue).toBeGreaterThan(
            sessionClose.initialValue + 0.5,
        );
    }, 60_000);

    it('sizes from the raised DLL in the session after an intraday reach that closed below the threshold', () => {
        const result = solve(
            scalingDllToyPlan(TierBasis.PeakIntradayProfit),
            1,
        );
        const firstTradeRisk = (committedPeak: number) =>
            result.dayPolicy.computeRisk?.(
                unlockedState({
                    committedPeak,
                    profit: 50,
                    runningHigh: committedPeak,
                    todayPnL: 0,
                }),
                0,
            ) ?? 0;

        expect(firstTradeRisk(REACH_BREAKPOINT)).toBe(100);
        expect(firstTradeRisk(50)).toBe(LOW_TIER_DLL);
    }, 60_000);

    it('keeps the low DLL for the rest of the session in which the reach happens', () => {
        const result = solve(
            scalingDllToyPlan(TierBasis.PeakIntradayProfit),
            1,
        );
        const secondTradeRisk = (committedPeak: number) =>
            result.dayPolicy.computeRisk?.(
                unlockedState({
                    committedPeak,
                    profit: 0,
                    runningHigh: REACH_BREAKPOINT,
                    todayPnL: -LOW_TIER_DLL,
                }),
                1,
            ) ?? 0;

        expect(secondTradeRisk(50)).toBe(0);
        expect(secondTradeRisk(REACH_BREAKPOINT)).toBe(50);
    }, 60_000);
});

describe('eval DP on an eval daily loss limit tiered on the intraday reach', () => {
    it('fails loud instead of valuing the reach as the session-open profit, because the eval DP tracks no intraday reach', () => {
        const funded = scalingDllToyPlan(TierBasis.PeakIntradayProfit);
        const plan = funded.withOverrides({
            evalDailyLossLimit: funded.fundedDailyLossLimit,
            isInstantFunded: false,
            maxEvalTradingDays: undefined,
            profitTarget: dollars(150),
        });

        expect(() =>
            computeEvalStateValue({
                actionStepDollars: 50,
                cushionStepDollars: 50,
                maxActionDollars: 100,
                maxEvalDays: 3,
                plan,
                profitStepDollars: 50,
                rrRatio: 2,
                tradesPerDay: 2,
                winrate: fraction(0.5),
            }),
        ).toThrow(/PeakIntradayProfit/);
    });
});
