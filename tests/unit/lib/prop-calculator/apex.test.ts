import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    type DailyLossLimitContext,
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    resolveDailyLossLimit,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    simulate,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

function freshStats(startingBalance: number) {
    const totals = new TradeTotals();
    return newPhaseStats(startingBalance, totals, new LossStreak(totals));
}

const firm = new ApexTraderFunding();

function atProfit(profit: number): DailyLossLimitContext {
    return { isThresholdLocked: false, peakDayCloseProfit: 0, profit };
}

function findPlan(accountSize: 50_000, variant: ApexVariant) {
    const plan = firm.findPlan({ accountSize, firm: FirmId.Apex, variant });
    if (!plan) {
        throw new Error(`Apex plan not found: ${accountSize} ${variant}`);
    }
    return plan;
}

describe('Apex payout ladder', () => {
    const plan50kEod = findPlan(50_000, ApexVariant.Eod);

    it('caps total payout at the lifetime cap and closes the account after payout 6', () => {
        const LIFETIME_CAP = 13_000;

        const base = {
            maxEvalDays: 20,
            plan: plan50kEod,
            riskPerTrade: 300,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        } as const;

        const justEnough = simulate({ ...base, fundedHorizonDays: 40 });
        const wayMore = simulate({ ...base, fundedHorizonDays: 400 });

        expect(justEnough.passProbability).toBe(1);
        expect(justEnough.fundedBustProbability).toBe(0);
        expect(justEnough.expectedGrossPayout).toBeCloseTo(LIFETIME_CAP, 6);

        expect(wayMore.expectedGrossPayout).toBeCloseTo(LIFETIME_CAP, 6);
        expect(wayMore.finalBalanceP50).toBeCloseTo(
            justEnough.finalBalanceP50,
            6,
        );
    });
});

describe('Apex qualifying-day threshold', () => {
    const plan50kEodQualifying = findPlan(50_000, ApexVariant.Eod);

    it('does not advance qualifyingDays on a day below the minimum daily profit', () => {
        const state = plan50kEodQualifying.initialState();
        const stats = freshStats(state.startingBalance);
        const rng = mulberry32(1);

        runDay({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(200, 1, { kind: DayStopRuleKind.None }),
            phase: TradingPhase.Eval,
            plan: plan50kEodQualifying,
            positionSizing: null,
            rng: rng,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state: state,
            stats: stats,
            winrate: fraction(1),
        });
        expect(state.tradingDays).toBe(1);
        expect(state.qualifyingDays).toBe(0);

        runDay({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(300, 1, { kind: DayStopRuleKind.None }),
            phase: TradingPhase.Eval,
            plan: plan50kEodQualifying,
            positionSizing: null,
            rng: rng,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state: state,
            stats: stats,
            winrate: fraction(1),
        });
        expect(state.tradingDays).toBe(2);
        expect(state.qualifyingDays).toBe(1);
    });

    it('never grants a payout when daily profit never clears the qualifying bar', () => {
        const out = simulate({
            fundedHorizonDays: 100,
            maxEvalDays: 200,
            plan: plan50kEodQualifying,
            riskPerTrade: 150,
            rrRatio: 1,
            seed: 7,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        expect(out.passProbability).toBe(1);
        expect(out.expectedGrossPayout).toBe(0);
        expect(out.fundedBustProbability).toBe(0);
    });
});

describe('Apex Intraday daily-loss-limit: lockout behavior differs by phase', () => {
    const plan50kIntraday = findPlan(50_000, ApexVariant.Intraday);

    it('locks out the funded day but not the eval day, for an identical loss', () => {
        const lossState = plan50kIntraday.initialState();
        lossState.balance -= 1500;
        lossState.todayPnL = -1500;

        expect(
            plan50kIntraday.isDayLockedOut(lossState, TradingPhase.Eval),
        ).toBe(false);
        expect(
            plan50kIntraday.isDayLockedOut(lossState, TradingPhase.Funded),
        ).toBe(true);
    });

    it('never kills the account on a daily-loss-limit hit alone', () => {
        const lossState = plan50kIntraday.initialState();
        lossState.balance -= 1500;
        lossState.todayPnL = -1500;

        expect(plan50kIntraday.isBust(lossState, TradingPhase.Eval)).toBe(
            false,
        );
        expect(plan50kIntraday.isBust(lossState, TradingPhase.Funded)).toBe(
            false,
        );
    });

    it('stops the funded day without busting, and leaves the eval day running (via runDay)', () => {
        const evalState = plan50kIntraday.initialState();
        const evalStats = freshStats(evalState.startingBalance);
        const evalResult = runDay({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(1500, 1, { kind: DayStopRuleKind.None }),
            phase: TradingPhase.Eval,
            plan: plan50kIntraday,
            positionSizing: null,
            rng: mulberry32(2),
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state: evalState,
            stats: evalStats,
            winrate: fraction(0),
        });
        expect(evalResult.busted).toBe(false);

        const fundedState = plan50kIntraday.initialState();
        const fundedStats = freshStats(fundedState.startingBalance);
        const fundedResult = runDay({
            commission: dollars(0),
            dayPolicy: flatDayPolicy(1500, 1, { kind: DayStopRuleKind.None }),
            phase: TradingPhase.Funded,
            plan: plan50kIntraday,
            positionSizing: null,
            rng: mulberry32(3),
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state: fundedState,
            stats: fundedStats,
            winrate: fraction(0),
        });
        expect(fundedResult.busted).toBe(false);
        expect(fundedState.todayPnL).toBe(-1500);
        expect(fundedState.tradingDays).toBe(0);
    });
});

describe('Apex EOD daily-loss-limit: flat in eval, tiered once funded', () => {
    const plan = findPlan(50_000, ApexVariant.Eod);

    it('has a flat eval DLL and a tiered funded DLL', () => {
        expect(plan.evalDailyLossLimit).toEqual({
            amount: 1000,
            kind: DailyLossLimitKind.Flat,
        });
        expect(plan.fundedDailyLossLimit.kind).toBe(DailyLossLimitKind.Tiered);
        if (plan.fundedDailyLossLimit.kind === DailyLossLimitKind.Tiered) {
            expect(plan.fundedDailyLossLimit.tiers[0]?.dailyLossLimit).toBe(
                1000,
            );
        }
    });

    it('escalates the funded DLL with cycle profit while the eval DLL stays flat', () => {
        for (const profit of [0, 1500, 3000, 6000, 20_000]) {
            expect(
                resolveDailyLossLimit(
                    plan.evalDailyLossLimit,
                    atProfit(profit),
                ),
            ).toBe(1000);
        }
        expect(
            resolveDailyLossLimit(plan.fundedDailyLossLimit, atProfit(0)),
        ).toBe(1000);
        expect(
            resolveDailyLossLimit(plan.fundedDailyLossLimit, atProfit(1500)),
        ).toBe(1000);
        expect(
            resolveDailyLossLimit(plan.fundedDailyLossLimit, atProfit(3000)),
        ).toBe(2000);
        expect(
            resolveDailyLossLimit(plan.fundedDailyLossLimit, atProfit(6000)),
        ).toBe(3000);
    });

    it('locks out a $1,500 day at funding start but allows it once the tier has escalated', () => {
        const atStart = plan.initialState();
        atStart.todayPnL = -1500;
        expect(plan.isDayLockedOut(atStart, TradingPhase.Funded)).toBe(true);
        expect(plan.isBust(atStart, TradingPhase.Funded)).toBe(false);

        const escalated = plan.initialState();
        escalated.balance = escalated.startingBalance + 3000;
        escalated.todayPnL = -1500;
        expect(plan.isDayLockedOut(escalated, TradingPhase.Funded)).toBe(false);
    });
});

describe('Apex eval reset fee', () => {
    it('charges the full eval price (not a discounted flat fee) for every plan and variant', () => {
        for (const plan of firm.plans) {
            expect(plan.fees.reset).toBe(plan.fees.oneTimeEval);
        }
    });

    it('charges the variant-specific eval price on reset, not the other variant’s price', () => {
        const eod = findPlan(50_000, ApexVariant.Eod);
        const intraday = findPlan(50_000, ApexVariant.Intraday);
        expect(eod.fees.reset).toBe(550);
        expect(intraday.fees.reset).toBe(249);
        expect(intraday.fees.reset).not.toBe(eod.fees.reset);
    });

    it('accrues one full eval-price reset fee per failed attempt in a multi-attempt trial', () => {
        const intraday = findPlan(50_000, ApexVariant.Intraday);
        const out = simulate({
            fundedHorizonDays: 10,
            maxAttempts: 3,
            maxEvalDays: 5,
            plan: intraday,
            riskPerTrade: 2100,
            rrRatio: 1,
            seed: 9,
            tradesPerDay: 1,
            trials: 1,
            winrate: 0,
        });

        expect(out.bustProbability).toBe(1);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * intraday.fees.reset);
        expect(out.costBreakdown.resetFeesTotal).toBe(2 * 249);
    });
});

describe('Apex evaluation time limit', () => {
    it("caps the eval at ~21 trading days as a weekday approximation of Apex's 30-calendar-day (not trading-day) account expiry, per Apex's live help center", () => {
        const eod = findPlan(50_000, ApexVariant.Eod);
        const intraday = findPlan(50_000, ApexVariant.Intraday);
        expect(eod.evalDayCap(9999)).toBe(21);
        expect(intraday.evalDayCap(9999)).toBe(21);
    });
});
