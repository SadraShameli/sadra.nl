import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    flatDayPolicy,
    fraction,
    FundedResetEligibility,
    percent,
    type Plan,
    RungSizing,
    simulate,
} from '~/lib/prop-calculator';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';
import {
    runAccountTimeline,
    runEvalToFundedCycle,
} from '~/lib/prop-calculator/portfolioTimeline';
import { simulateTrial } from '~/lib/prop-calculator/simulator/trial';

import { scriptedRng } from '../scriptedRng';

const W = 0.1;
const L = 0.9;
const RESET_FEE = 499;
const EVAL_FEE = 100;

function alphaZero(): Plan {
    const plan = new AlphaFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Zero,
    });
    if (!plan) throw new Error('Alpha Futures Zero 50K plan not found');
    return plan;
}

function resetToy(overrides: Parameters<Plan['withOverrides']>[0] = {}): Plan {
    return alphaZero().withOverrides({
        accountSize: dollars(10_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(1000) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fees: {
            activation: dollars(0),
            monthlySubscription: dollars(0),
            oneTimeEval: dollars(EVAL_FEE),
            reset: dollars(0),
        },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(1000),
            lock: { atProfit: dollars(1000), lockedThreshold: () => 10_000 },
        }),
        fundedReset: {
            eligibility: FundedResetEligibility.NoPayoutEverRequested,
            fee: dollars(RESET_FEE),
            label: 'Qualified Reset',
            maxPerAccount: 2,
            windowCalendarDays: 7,
        },
        isInstantFunded: true,
        minDaysAfterPassForPayout: 0,
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        payoutTiersFromPayout: undefined,
        takesFundedReset: true,
        ...overrides,
    });
}

const POLICY = flatDayPolicy(1000, 1, { kind: DayStopRuleKind.None });

function runSim(
    plan: Plan,
    winrate: number,
    extra: Partial<Parameters<typeof simulate>[0]> = {},
) {
    return simulate({
        fundedHorizonDays: 10,
        maxEvalDays: 1,
        plan,
        riskPerTrade: 1000,
        rrRatio: 2,
        seed: 3,
        tradesPerDay: 1,
        trials: 5,
        winrate,
        ...extra,
    });
}

function runTrial(
    plan: Plan,
    draws: readonly number[],
    options: {
        horizon?: number;
        idleDayProbability?: number;
        shouldCaptureEquity?: boolean;
    } = {},
) {
    return simulateTrial({
        commission: dollars(0),
        discounts: undefined,
        evalDayPolicy: POLICY,
        fundedDayPolicy: POLICY,
        fundedHorizonDays: options.horizon ?? 10,
        idleDayProbability: options.idleDayProbability,
        maxAttempts: 1,
        maxEvalDays: 1,
        minRetainedCushion: plan.resolveRetainedCushion(undefined),
        payoutRequestSize: undefined,
        plan,
        positionSizing: null,
        rng: scriptedRng(draws, L),
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        shouldCaptureEquity: options.shouldCaptureEquity ?? false,
        winrate: fraction(0.5),
    });
}

describe('R1: an opted-in funded reset restores a breached account until the per-account count runs out', () => {
    it('resets twice on three straight losing days, then closes the account', () => {
        const trial = runTrial(resetToy(), [L, L, L]);

        expect(trial.fundedResetsUsed).toBe(2);
        expect(trial.fundedResetFeesPaid).toBe(2 * RESET_FEE);
        expect(trial.totalCost).toBe(EVAL_FEE + 2 * RESET_FEE);
        expect(trial.net).toBe(-(EVAL_FEE + 2 * RESET_FEE));
        expect(trial.daysElapsed).toBe(3);
        expect(trial.outcome).toBe('bust-funded');
    });

    it('control: without the opt-in the first breach closes the account', () => {
        const trial = runTrial(resetToy({ takesFundedReset: false }), [
            L,
            L,
            L,
        ]);

        expect(trial.fundedResetsUsed).toBe(0);
        expect(trial.fundedResetFeesPaid).toBe(0);
        expect(trial.daysElapsed).toBe(1);
        expect(trial.totalCost).toBe(EVAL_FEE);
    });

    it('also resets a breach of a daily loss limit that ends the account', () => {
        const trial = runTrial(
            resetToy({
                fundedDailyLossLimit: {
                    amount: dollars(500),
                    kind: DailyLossLimitKind.Flat,
                },
                fundedDailyLossLimitBreach:
                    DailyLossLimitBreachEffect.Terminate,
            }),
            [L, L, L],
        );

        expect(trial.fundedResetsUsed).toBe(2);
        expect(trial.daysElapsed).toBe(3);
        expect(trial.outcome).toBe('bust-funded');
    });
});

describe('R2: no reset once any payout was requested', () => {
    it('pays 1,000 on day 1, then the day-2 breach at the locked floor closes the account', () => {
        const trial = runTrial(resetToy(), [W, L]);

        expect(trial.fundedResetsUsed).toBe(0);
        expect(trial.payoutCount).toBe(1);
        expect(trial.grossPayout).toBe(1000);
        expect(trial.totalCost).toBe(EVAL_FEE);
        expect(trial.daysElapsed).toBe(2);
        expect(trial.outcome).toBe('bust-funded');
    });
});

describe('R3: the reset restores the balance, the drawdown and the payout day count', () => {
    const plan = resetToy({
        minDaysAfterPassForPayout: 2,
        minQualifyingDayProfit: dollars(1),
    });

    it('pays only on day 5, two qualifying days after the day-3 reset', () => {
        const trial = runTrial(plan, [W, L, L, W, W], {
            horizon: 5,
            shouldCaptureEquity: true,
        });

        expect(trial.fundedResetsUsed).toBe(1);
        expect(trial.firstPayoutDay).toBe(5);
        expect(trial.payoutCount).toBe(1);
        expect(trial.grossPayout).toBe(2000);
        expect(trial.totalCost).toBe(EVAL_FEE + RESET_FEE);
        expect(trial.net).toBe(2000 - EVAL_FEE - RESET_FEE);
        expect(trial.outcome).toBe('pass-clean');
        expect(trial.equityCurve).toStrictEqual([
            10_000, 12_000, 11_000, 10_000, 12_000, 14_000,
        ]);
    });
});

describe('an inactivity closure is not a breach and is never reset', () => {
    it('closes the account on the first idle day even with the opt-in', () => {
        const trial = runTrial(resetToy({ maxConsecutiveIdleDays: 1 }), [0], {
            idleDayProbability: 1,
        });

        expect(trial.closedForInactivity).toBe(true);
        expect(trial.fundedResetsUsed).toBe(0);
        expect(trial.daysElapsed).toBe(1);
        expect(trial.totalCost).toBe(EVAL_FEE);
    });
});

describe('R5: simulate() prices the reset into net, spend and cost per funded account (D1)', () => {
    it('charges both resets on every trial when every trade loses', () => {
        const out = runSim(resetToy(), 0);

        expect(out.expectedTotalCost).toBe(EVAL_FEE + 2 * RESET_FEE);
        expect(out.expectedNet).toBe(-(EVAL_FEE + 2 * RESET_FEE));
        expect(out.costPerFundedAccount).toBe(EVAL_FEE + 2 * RESET_FEE);
        expect(out.costBreakdown.fundedResetFeesTotal).toBe(2 * RESET_FEE);
        expect(out.costBreakdown.fundedResetFeesPerFundedAccount).toBe(
            2 * RESET_FEE,
        );
        expect(out.expectedFundedResets).toBe(2);
        expect(out.fundedBustProbability).toBe(1);
    });

    it('scales the per-trial totals with copy accounts but not the per-account cost', () => {
        const out = runSim(resetToy(), 0, { copyAccounts: 2 });

        expect(out.expectedTotalCost).toBe(2 * (EVAL_FEE + 2 * RESET_FEE));
        expect(out.costBreakdown.fundedResetFeesTotal).toBe(4 * RESET_FEE);
        expect(out.costPerFundedAccount).toBe(EVAL_FEE + 2 * RESET_FEE);
        expect(out.expectedFundedResets).toBe(2);
    });

    it('applies the reset discount to the reset fee (T9) and never the bundle discount', () => {
        const halfOff = runSim(resetToy(), 0, {
            discounts: {
                activationPercent: percent(0),
                evalPercent: percent(0),
                resetPercent: percent(50),
            },
        });
        expect(halfOff.costBreakdown.fundedResetFeesTotal).toBe(RESET_FEE);
        expect(halfOff.expectedTotalCost).toBe(EVAL_FEE + RESET_FEE);

        const withBundle = runSim(resetToy(), 0, {
            discounts: {
                activationPercent: percent(0),
                bundlePercent: percent(40),
                evalPercent: percent(0),
                resetPercent: percent(50),
            },
        });
        expect(withBundle.costBreakdown.fundedResetFeesTotal).toBe(RESET_FEE);
        expect(withBundle.expectedTotalCost).toBeCloseTo(
            EVAL_FEE * 0.6 + RESET_FEE,
            9,
        );
    });
});

describe('R6: the opt-in changes nothing when the account never breaches', () => {
    it('matches the opted-out run exactly at a 100% winrate', () => {
        expect(runSim(resetToy(), 1)).toStrictEqual(
            runSim(resetToy({ takesFundedReset: false }), 1),
        );
    });
});

describe('R7: the cash-flow timeline books each reset fee on its own day', () => {
    it('returns the charges from the eval-to-funded cycle and keeps totalCost as the evaluation cost', () => {
        const plan = resetToy();
        const card = runEvalToFundedCycle({
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: POLICY,
            fundedDayPolicy: POLICY,
            maxEvalDays: 1,
            maxFundedDays: 10,
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: scriptedRng([L, L, L], L),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            winrate: fraction(0.5),
        });

        expect(card.fundedResetCharges).toStrictEqual([
            { dayOffset: 1, fee: RESET_FEE },
            { dayOffset: 2, fee: RESET_FEE },
        ]);
        expect(card.totalCost).toBe(EVAL_FEE);
        expect(card.totalDays).toBe(3);
    });

    it('adds each charge to cumulative spend on the day it is paid', () => {
        const timeline = runAccountTimeline({
            dayBudget: 3,
            maxEvalDays: 1,
            plan: resetToy(),
            riskPerTrade: 1000,
            rng: scriptedRng([L, L, L], L),
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: 0.5,
        });

        expect([...timeline.cumulativeSpend]).toStrictEqual([
            0,
            EVAL_FEE + RESET_FEE,
            EVAL_FEE + 2 * RESET_FEE,
            EVAL_FEE + 2 * RESET_FEE,
        ]);
    });
});
