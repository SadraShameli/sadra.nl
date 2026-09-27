import { describe, expect, it } from 'vitest';

import {
    activationFee,
    DailyLossLimitKind,
    dollars,
    FirmId,
    fraction,
    FundedResetEligibility,
    initialEvalFee,
    MffuVariant,
    type Plan,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';
import { compoundedBankroll } from '~/lib/prop-calculator/economics';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type BankrollPolicy,
    type BankrollTimelineInputs,
    simulateBankrollTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';

const ATTEMPT_COST = 150;
const PAYOUT = 300;

function baseInputs(
    overrides: Partial<BankrollTimelineInputs> = {},
): BankrollTimelineInputs {
    return {
        bankroll: basePolicy(),
        dayBudget: 3,
        maxEvalDays: 60,
        payoutRequestSize: dollars(PAYOUT),
        plan: oneDayCyclePlan({}),
        riskPerTrade: 200,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 1,
        trials: 1,
        winrate: 1,
        ...overrides,
    };
}

function basePolicy(overrides: Partial<BankrollPolicy> = {}): BankrollPolicy {
    return {
        maxConcurrentAccounts: null,
        monthlyBudget: null,
        payoutLagDays: 0,
        reinvestFraction: fraction(1),
        roundBudget: null,
        startingBankroll: dollars(ATTEMPT_COST),
        ...overrides,
    };
}

function fundedResetToyPlan(): Plan {
    return oneDayCyclePlan({ winrate: 0 }).withOverrides({
        fundedDrawdown: new StaticDrawdown({ amount: dollars(500) }),
        fundedReset: {
            eligibility: FundedResetEligibility.NoPayoutEverRequested,
            fee: dollars(80),
            label: 'Toy Reset',
            maxPerAccount: 1,
            windowCalendarDays: 30,
        },
        takesFundedReset: true,
    });
}

function oneDayCyclePlan(options: {
    maxLifetimePayouts?: number;
    winrate?: number;
}): Plan {
    const base = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(10_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new StaticDrawdown({ amount: dollars(1000) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(50),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(100),
            reset: dollars(40),
        },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new StaticDrawdown({ amount: dollars(1000) }),
        isInstantFunded: true,
        maxFundedAccounts: 1000,
        maxLifetimePayouts: options.maxLifetimePayouts ?? 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(1),
        minPayoutRequest: dollars(0),
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function rapidEod50k(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function retryableEvalPlan(): Plan {
    const base = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!base) throw new Error('MFF Rapid EOD 50K plan not found');
    return base.withOverrides({
        accountSize: dollars(10_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new StaticDrawdown({ amount: dollars(1000) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(100),
            reset: dollars(40),
        },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new StaticDrawdown({ amount: dollars(1000) }),
        isInstantFunded: false,
        maxFundedAccounts: 1000,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(1),
        minPayoutRequest: dollars(0),
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        profitTarget: dollars(1_000_000),
    });
}

describe('simulateBankrollTimeline (PT-55)', () => {
    it('with pass probability 1, a fixed payout and lag 0, the cash path equals compoundedBankroll at every cycle boundary', () => {
        const out = simulateBankrollTimeline(baseInputs());
        const expected = [0, 1, 2, 3].map(
            (day) =>
                compoundedBankroll(dollars(ATTEMPT_COST), 2, 1, day).value,
        );
        expect(out.days).toEqual([0, 1, 2, 3]);
        expect(out.cashP50[1]).toBeCloseTo(expected[1] ?? NaN, 9);
        expect(out.cashP50[2]).toBeCloseTo(expected[2] ?? NaN, 9);
        expect(out.cashP50[3]).toBeCloseTo(expected[3] ?? NaN, 9);
    });

    it('a lag of 10 days credits the first payout 10 days later than a lag of 0', () => {
        const zeroLag = simulateBankrollTimeline(
            baseInputs({ dayBudget: 12 }),
        );
        const laggedInputs = baseInputs({
            bankroll: basePolicy({ payoutLagDays: 10 }),
            dayBudget: 12,
        });
        const lagged = simulateBankrollTimeline(laggedInputs);
        expect(zeroLag.cashP50[1]).toBeCloseTo(300, 9);
        expect(lagged.cashP50[1]).toBeCloseTo(0, 9);
        expect(lagged.cashP50[11]).toBeCloseTo(300, 9);
    });

    it('reinvest fraction 0 limits purchases to the starting bankroll: exactly one card is ever bought', () => {
        const bankroll = basePolicy({ reinvestFraction: fraction(0) });
        const out = simulateBankrollTimeline(
            baseInputs({ bankroll, dayBudget: 20 }),
        );
        expect(out.cardsBoughtP50).toBe(1);
        expect(out.withdrawnP50.at(-1)).toBeCloseTo(PAYOUT, 9);
        expect(out.cashP50.at(-1)).toBeCloseTo(0, 9);
    });

    it('capacity 1 never runs more than one open card, so payouts grow linearly (one 300 payout per day) instead of compounding', () => {
        const out = simulateBankrollTimeline(
            baseInputs({
                bankroll: basePolicy({ maxConcurrentAccounts: 1 }),
                dayBudget: 5,
            }),
        );
        expect(out.payoutP50).toEqual([0, 300, 600, 900, 1200, 1500]);
    });

    it('the monthly budget resets each calendar month: only one card is bought until day 21, a second follows only after the new month starts', () => {
        const startingBankroll = dollars(100_000);
        const bankroll = basePolicy({
            monthlyBudget: dollars(ATTEMPT_COST),
            startingBankroll,
        });
        const out = simulateBankrollTimeline(
            baseInputs({ bankroll, dayBudget: 22 }),
        );
        expect(out.cumulativeSpendP50[20]).toBeCloseTo(ATTEMPT_COST, 9);
        expect(out.cumulativeSpendP50[22]).toBeCloseTo(2 * ATTEMPT_COST, 9);
    });

    it('a round budget of exactly one attempt cost is never exceeded: only one card is bought for the whole horizon', () => {
        const startingBankroll = dollars(100_000);
        const bankroll = basePolicy({
            roundBudget: dollars(ATTEMPT_COST),
            startingBankroll,
        });
        const out = simulateBankrollTimeline(
            baseInputs({ bankroll, dayBudget: 60 }),
        );
        expect(out.cardsBoughtP50).toBe(1);
        expect(out.cumulativeSpendP50.at(-1)).toBeCloseTo(ATTEMPT_COST, 9);
    });

    it('a zero-edge toy (winrate 0, no payout ever) ends in path ruin', () => {
        const out = simulateBankrollTimeline(
            baseInputs({
                plan: oneDayCyclePlan({ winrate: 0 }),
                winrate: 0,
            }),
        );
        expect(out.pathRuin).toBe(1);
        expect(out.payoutP50.at(-1)).toBe(0);
    });

    it('is deterministic: the same seed gives the same output', () => {
        const inputs = baseInputs({ dayBudget: 10, trials: 5 });
        expect(simulateBankrollTimeline(inputs)).toEqual(
            simulateBankrollTimeline(inputs),
        );
    });

    it('pFinalNetNegative is true when a card is bought and never pays out, even with plenty of bankroll left unspent', () => {
        const bankroll = basePolicy({
            maxConcurrentAccounts: 1,
            roundBudget: dollars(ATTEMPT_COST),
            startingBankroll: dollars(5000),
        });
        const out = simulateBankrollTimeline(
            baseInputs({
                bankroll,
                dayBudget: 3,
                plan: oneDayCyclePlan({ winrate: 0 }),
                winrate: 0,
            }),
        );
        expect(out.cashP50.at(-1)).toBeGreaterThan(4000);
        expect(out.pFinalNetNegative).toBe(1);
    });

    it('a card bought on the very last day of the horizon is never counted, since it can never be charged or paid within the horizon', () => {
        const out = simulateBankrollTimeline(
            baseInputs({
                bankroll: basePolicy({ maxConcurrentAccounts: 1 }),
                dayBudget: 3,
            }),
        );
        expect(out.cardsBoughtP50).toBe(3);
    });

    it('a multi-day eval with a bankroll of exactly one attempt cost does not falsely register path ruin once every trial eventually pays out', () => {
        const plan = rapidEod50k();
        const attemptCost =
            initialEvalFee(plan.fees, undefined) +
            activationFee(plan.fees, undefined);
        const out = simulateBankrollTimeline({
            bankroll: basePolicy({ startingBankroll: dollars(attemptCost) }),
            dayBudget: 60,
            maxEvalDays: 30,
            payoutRequestSize: dollars(5000),
            plan,
            riskPerTrade: 300,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 3,
            trials: 5,
            winrate: 1,
        });
        expect(out.pathRuin).toBe(0);
        expect(out.payoutP50.at(-1)).toBeGreaterThan(0);
    });

    it('honours fundedRiskPerTrade instead of mirroring the eval risk in the funded phase', () => {
        const plan = rapidEod50k();
        const sharedInputs = {
            dayBudget: 40,
            maxEvalDays: 30,
            payoutRequestSize: dollars(5000),
            plan,
            riskPerTrade: 300,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 3,
            trials: 10,
            winrate: 1,
        };
        const baseline = simulateBankrollTimeline({
            bankroll: basePolicy({ startingBankroll: dollars(100_000) }),
            ...sharedInputs,
        });
        const sameAsEval = simulateBankrollTimeline({
            bankroll: basePolicy({ startingBankroll: dollars(100_000) }),
            fundedRiskPerTrade: 300,
            fundedRrRatio: 2,
            fundedTradesPerDay: 3,
            ...sharedInputs,
        });
        const overridden = simulateBankrollTimeline({
            bankroll: basePolicy({ startingBankroll: dollars(100_000) }),
            fundedRiskPerTrade: 3000,
            ...sharedInputs,
        });

        expect(sameAsEval).toStrictEqual(baseline);
        expect(overridden.payoutP50).not.toEqual(baseline.payoutP50);
    });

    it('an unaffordable retry stops a card before its outcome is drawn, instead of inflating the eval-cost smoothing window with attempts the round budget could never pay for', () => {
        const bankroll = basePolicy({
            maxConcurrentAccounts: 1,
            roundBudget: dollars(100),
            startingBankroll: dollars(100_000),
        });
        const out = simulateBankrollTimeline(
            baseInputs({
                bankroll,
                dayBudget: 20,
                maxEvalDays: 60,
                plan: retryableEvalPlan(),
                riskPerTrade: 600,
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0,
            }),
        );

        expect(out.cumulativeSpendP50.at(-1)).toBeCloseTo(90, 6);
        expect(out.cumulativeSpendP50.at(-1)).toBeLessThan(100);
    });

    it('a round budget of exactly one attempt cost is never exceeded even when a card retries multiple times', () => {
        const plan = rapidEod50k();
        const attemptCost =
            initialEvalFee(plan.fees, undefined) +
            activationFee(plan.fees, undefined);
        const out = simulateBankrollTimeline({
            bankroll: basePolicy({
                roundBudget: dollars(attemptCost),
                startingBankroll: dollars(100_000),
            }),
            dayBudget: 60,
            maxEvalDays: 30,
            payoutRequestSize: dollars(5000),
            plan,
            riskPerTrade: 300,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 3,
            trials: 10,
            winrate: 0.3,
        });
        expect(out.cumulativeSpendP50.at(-1)).toBeLessThanOrEqual(
            attemptCost + 1e-6,
        );
    });

    it('with capacity 2, a card retry only counts the round budget already reserved for a sibling card bought the same day, not just its own committed retries', () => {
        const bankroll = basePolicy({
            maxConcurrentAccounts: 2,
            roundBudget: dollars(210),
            startingBankroll: dollars(100_000),
        });
        const out = simulateBankrollTimeline(
            baseInputs({
                bankroll,
                dayBudget: 30,
                maxEvalDays: 60,
                plan: retryableEvalPlan(),
                riskPerTrade: 600,
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0,
            }),
        );
        expect(out.cardsBoughtP50).toBe(2);
        expect(out.cumulativeSpendP50.at(-1)).toBeCloseTo(610 / 3, 6);
    });

    it('a funded reset the bankroll cannot afford ends the card instead of being charged into negative cash (PT-55c)', () => {
        const bankroll = basePolicy({
            maxConcurrentAccounts: 1,
            startingBankroll: dollars(220),
        });
        const out = simulateBankrollTimeline(
            baseInputs({
                bankroll,
                dayBudget: 15,
                plan: fundedResetToyPlan(),
                riskPerTrade: 200,
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0,
            }),
        );

        for (const cash of out.cashP50) {
            expect(cash).toBeGreaterThanOrEqual(0);
        }
        expect(out.cashP50.at(-1)).toBeCloseTo(70, 6);
        expect(out.cumulativeSpendP50.at(-1)).toBeCloseTo(150, 6);
    });

    it('the same toy spends attemptCost plus the reset fee once the bankroll can afford it', () => {
        const bankroll = basePolicy({
            maxConcurrentAccounts: 1,
            startingBankroll: dollars(100_000),
        });
        const out = simulateBankrollTimeline(
            baseInputs({
                bankroll,
                dayBudget: 15,
                plan: fundedResetToyPlan(),
                riskPerTrade: 200,
                rrRatio: 2,
                tradesPerDay: 1,
                winrate: 0,
            }),
        );
        expect(out.cumulativeSpendP50.at(-1)).toBeGreaterThan(230);
    });
});
