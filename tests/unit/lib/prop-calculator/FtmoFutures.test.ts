import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ConsistencyScope,
    ContractLimitKind,
    DailyLossLimitBreachEffect,
    DayStopRuleKind,
    dollars,
    DrawdownKind,
    FirmId,
    fraction,
    FtmoFuturesVariant,
    maxContractsAt,
    PayoutFloorEffect,
    type Plan,
    RungSizing,
} from '~/lib/prop-calculator/core';
import {
    type FundedCycleTracker,
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import {
    ALL_FIRMS,
    findFirm,
    findLivePlanBuilder,
} from '~/lib/prop-calculator/firms';
import { FtmoFutures } from '~/lib/prop-calculator/firms/ftmo-futures/FtmoFutures';
import { runDay } from '~/lib/prop-calculator/simulator/day';
import {
    LossStreak,
    newPhaseStats,
    TradeTotals,
} from '~/lib/prop-calculator/simulator/PhaseStats';

const ACCOUNT_SIZE = 50_000;

function downOneThousand(plan: Plan): AccountState {
    const state = plan.initialState();
    state.balance -= 1000;
    state.todayPnL = -1000;
    return state;
}

function findFtmoPlan(variant: FtmoFuturesVariant): Plan {
    const found = new FtmoFutures().findPlan({
        accountSize: ACCOUNT_SIZE,
        firm: FirmId.FtmoFutures,
        variant,
    });
    if (!found) throw new Error(`FTMO Futures ${variant} 50K plan not found`);
    return found;
}

function lockedFundedAccount(
    plan: Plan,
    profit: number,
): { state: AccountState; tracker: FundedCycleTracker } {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    state.balance = state.startingBalance + profit;
    state.threshold = state.startingBalance;
    state.thresholdLocked = true;
    return { state, tracker };
}

function requestMaxPayout(
    plan: Plan,
    state: AccountState,
    tracker: FundedCycleTracker,
    payoutRequestSize?: number,
) {
    return tryFundedPayout({
        maxPayouts: Infinity,
        minRetainedCushion: 0,
        payoutRequestSize,
        plan,
        state,
        tracker,
    });
}

const growth = findFtmoPlan(FtmoFuturesVariant.Growth);
const pro = findFtmoPlan(FtmoFuturesVariant.Pro);

describe('FTMO Futures (Growth and Pro, 50K)', () => {
    it('is registered in ALL_FIRMS with exactly the two 50K products and no live-account builder (the Live Funded Account is invitation-only and no source states its size, drawdown amount or buffer amount)', () => {
        expect(findFirm(FirmId.FtmoFutures)).toBeInstanceOf(FtmoFutures);
        expect(ALL_FIRMS.some((firm) => firm.id === FirmId.FtmoFutures)).toBe(
            true,
        );
        expect(new FtmoFutures().plans).toHaveLength(2);
        expect(findLivePlanBuilder(FirmId.FtmoFutures)).toBeUndefined();
    });

    it('bills the Evaluation as a monthly subscription with no activation or one-time fee, and a separate reset fee ($119/$109 Growth, $139/$129 Pro)', () => {
        expect(growth.fees).toStrictEqual({
            activation: 0,
            monthlySubscription: 119,
            oneTimeEval: 0,
            reset: 109,
        });
        expect(pro.fees).toStrictEqual({
            activation: 0,
            monthlySubscription: 139,
            oneTimeEval: 0,
            reset: 129,
        });
        expect(growth.feesUntilPass(1)).toBe(119);
        expect(growth.feesUntilPass(22)).toBe(238);
    });

    it('shares the $3,000 Profit Target, $50K size, zero minimum trading days and 3-account funded cap across both products', () => {
        for (const plan of [growth, pro]) {
            expect(plan.accountSize).toBe(ACCOUNT_SIZE);
            expect(plan.profitTarget).toBe(3000);
            expect(plan.minTradingDays).toBe(0);
            expect(plan.maxFundedAccounts).toBe(3);
            expect(plan.maxEvalTradingDays).toBeNull();
            expect(plan.isInstantFunded).toBe(false);
        }
    });

    it('trails the Maximum Drawdown end-of-day ($2,000 Growth, $3,000 Pro) and locks it at the Initial Simulated Capital in both phases, since the rules page states the lock for the Evaluation and the Sim-Funded Account alike', () => {
        for (const [plan, amount] of [
            [growth, 2000],
            [pro, 3000],
        ] as const) {
            expect(plan.drawdown.kind).toBe(DrawdownKind.EodTrailing);
            expect(plan.drawdown.amount).toBe(amount);
            expect(plan.drawdown.lock?.atProfit).toBe(amount);
            expect(plan.drawdown.lock?.lockedThreshold(ACCOUNT_SIZE)).toBe(
                ACCOUNT_SIZE,
            );
            expect(plan.fundedDrawdown).toBe(plan.drawdown);
            expect(plan.initialState().threshold).toBe(ACCOUNT_SIZE - amount);
        }
    });

    it("reproduces the rules page's own Growth Evaluation example: $51,000 / $50,500 / $52,500 closes give limits of $49,000, $49,000 and then a permanent $50,000 lock", () => {
        const state = growth.initialState();
        state.balance = 51_000;
        growth.drawdown.onDayClose(state);
        expect(state.threshold).toBe(49_000);
        state.balance = 50_500;
        growth.drawdown.onDayClose(state);
        expect(state.threshold).toBe(49_000);
        state.balance = 52_500;
        growth.drawdown.onDayClose(state);
        expect(state.threshold).toBe(50_000);
        expect(state.thresholdLocked).toBe(true);
        state.balance = 60_000;
        growth.drawdown.onDayClose(state);
        expect(state.threshold).toBe(50_000);
    });

    it("reproduces the rules page's own Pro Sim-Funded example: $51,500 / $50,500 / $53,500 closes give limits of $48,500, $48,500 and then a permanent $50,000 lock", () => {
        const state = pro.initialState();
        pro.beginFundedPhase(state);
        expect(state.threshold).toBe(47_000);
        state.balance = 51_500;
        pro.fundedDrawdown.onDayClose(state);
        expect(state.threshold).toBe(48_500);
        state.balance = 50_500;
        pro.fundedDrawdown.onDayClose(state);
        expect(state.threshold).toBe(48_500);
        state.balance = 53_500;
        pro.fundedDrawdown.onDayClose(state);
        expect(state.threshold).toBe(50_000);
        expect(state.thresholdLocked).toBe(true);
    });

    it('locks the moment the limit reaches (not only exceeds) the Initial Simulated Capital, because an EOD close exactly one drawdown amount up already puts the limit on the Initial Simulated Capital', () => {
        const state = growth.initialState();
        state.balance = ACCOUNT_SIZE + 2000;
        growth.drawdown.onDayClose(state);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(ACCOUNT_SIZE);
    });

    it("applies the Daily Loss Limit per product and, crucially, its consequence: Growth's Sim-Funded limit is soft, so hitting it only ends the day (the account is not terminated), while Pro's is hard in both phases, so hitting it ends the account (the Evaluation is unsuccessful / immediately and permanently terminated)", () => {
        expect(
            growth.isDayLockedOut(downOneThousand(growth), TradingPhase.Eval),
        ).toBe(false);
        expect(
            growth.isDayLockedOut(downOneThousand(growth), TradingPhase.Funded),
        ).toBe(true);
        expect(
            pro.isDayLockedOut(downOneThousand(pro), TradingPhase.Eval),
        ).toBe(true);
        expect(
            pro.isDayLockedOut(downOneThousand(pro), TradingPhase.Funded),
        ).toBe(true);

        expect(growth.isBust(downOneThousand(growth), TradingPhase.Eval)).toBe(
            false,
        );
        expect(
            growth.isBust(downOneThousand(growth), TradingPhase.Funded),
        ).toBe(false);
        expect(pro.isBust(downOneThousand(pro), TradingPhase.Eval)).toBe(true);
        expect(pro.isBust(downOneThousand(pro), TradingPhase.Funded)).toBe(
            true,
        );

        for (const plan of [growth, pro]) {
            const oneShort = downOneThousand(plan);
            oneShort.todayPnL = -999;
            expect(plan.isDayLockedOut(oneShort, TradingPhase.Funded)).toBe(
                false,
            );
            expect(plan.isBust(oneShort, TradingPhase.Funded)).toBe(false);
        }
    });

    it("tags the breach effect per FTMO's own soft-vs-hard violation vocabulary, with Growth's unset Evaluation limit staying on the engine-wide Lockout default", () => {
        expect(growth.isDailyLossLimitTerminating(TradingPhase.Eval)).toBe(
            false,
        );
        expect(growth.isDailyLossLimitTerminating(TradingPhase.Funded)).toBe(
            false,
        );
        expect(pro.isDailyLossLimitTerminating(TradingPhase.Eval)).toBe(true);
        expect(pro.isDailyLossLimitTerminating(TradingPhase.Funded)).toBe(true);
        expect(growth.dailyLossLimitBreachFor(TradingPhase.Funded)).toBe(
            DailyLossLimitBreachEffect.Lockout,
        );
        expect(pro.dailyLossLimitBreachFor(TradingPhase.Eval)).toBe(
            DailyLossLimitBreachEffect.Terminate,
        );
    });

    it('applies the Consistency Rule to the Evaluation only, at 40% for Growth and 50% for Pro, with no rule on the Sim-Funded Account', () => {
        for (const [plan, share] of [
            [growth, 0.4],
            [pro, 0.5],
        ] as const) {
            const rule = plan.evalConsistencyRule();
            expect(rule?.scope).toBe(ConsistencyScope.Eval);
            expect(rule?.maxBestDayShare).toBe(share);
            expect(plan.fundedConsistencyRule()).toBeNull();
            expect(plan.fundedConsistencyRule(3)).toBeNull();
        }
    });

    it("reproduces the rules page's own consistency examples: a $2,000 + $1,000 Growth run (or $2,500 + $500 Pro run) hits the $3,000 target but does not pass, and 'will need to reach at least $5,000 to pass' with that same best day", () => {
        for (const [plan, bestDay] of [
            [growth, 2000],
            [pro, 2500],
        ] as const) {
            const state = plan.initialState();
            state.balance = ACCOUNT_SIZE + 3000;
            state.bestDayProfit = bestDay;
            state.tradingDays = 2;
            expect(plan.isPassed(state)).toBe(false);
            expect(plan.isBust(state, TradingPhase.Eval)).toBe(false);
            state.balance = ACCOUNT_SIZE + 4999;
            expect(plan.isPassed(state)).toBe(false);
            state.balance = ACCOUNT_SIZE + 5000;
            expect(plan.isPassed(state)).toBe(true);
        }
    });

    it("does not gate the pass on a trading-day count (minTradingDays is 0), so the fastest Growth pass is whatever the 40% Consistency Rule alone allows: the FAQ's 3 trading days", () => {
        const state = growth.initialState();
        state.balance = ACCOUNT_SIZE + 3000;
        state.bestDayProfit = 1200;
        state.tradingDays = 3;
        expect(growth.isPassed(state)).toBe(true);

        state.bestDayProfit = 1500;
        state.tradingDays = 2;
        expect(growth.isPassed(state)).toBe(false);
    });

    it('caps the Evaluation at 5 minis / 50 micros and scales the Sim-Funded account 2/20 -> 3/30 at $1,000 -> 5/50 at $2,000 of EOD profit, effective only from the next session', () => {
        for (const plan of [growth, pro]) {
            expect(plan.contractLimits?.evalMinis).toBe(5);
            expect(plan.contractLimits?.evalMicros).toBe(50);
            const minis = plan.contractLimits?.fundedMinis;
            const micros = plan.contractLimits?.fundedMicros;
            if (
                minis?.kind !== ContractLimitKind.Tiered ||
                micros?.kind !== ContractLimitKind.Tiered
            ) {
                throw new Error('expected tiered funded contract limits');
            }
            expect(minis.isEffectiveNextSession).toBe(true);
            expect(micros.isEffectiveNextSession).toBe(true);
            for (const [profit, expectedMinis, expectedMicros] of [
                [0, 2, 20],
                [999, 2, 20],
                [1000, 3, 30],
                [1999, 3, 30],
                [2000, 5, 50],
                [2999, 5, 50],
                [3000, 5, 50],
                [4500, 5, 50],
                [10_000, 5, 50],
            ] as const) {
                expect(maxContractsAt(minis, profit, profit)).toBe(
                    expectedMinis,
                );
                expect(maxContractsAt(micros, profit, profit)).toBe(
                    expectedMicros,
                );
            }
            expect(maxContractsAt(minis, 3000, 0)).toBe(2);
            expect(maxContractsAt(minis, 0, 3000)).toBe(5);
        }
    });

    it('pays 90% of the debited amount at every profit level (Payout Ratio 90/10), with no payout-method fee', () => {
        for (const plan of [growth, pro]) {
            expect(plan.payoutFromProfit(2000)).toBeCloseTo(1800, 6);
            expect(plan.payoutFromProfit(10_000)).toBeCloseTo(9000, 6);
            expect(plan.payoutMethodFee).toBe(0);
        }
    });

    it('gates each payout on Qualifying Days within the cycle (4 x $150+ Growth, 5 x $200+ Pro), counted afresh after every payout', () => {
        expect(growth.minDaysAfterPassForPayout).toBe(4);
        expect(growth.minQualifyingDayProfit).toBe(150);
        expect(pro.minDaysAfterPassForPayout).toBe(5);
        expect(pro.minQualifyingDayProfit).toBe(200);

        const { state, tracker } = lockedFundedAccount(growth, 4000);
        state.qualifyingDays = 3;
        expect(requestMaxPayout(growth, state, tracker)).toBeNull();
        state.qualifyingDays = 4;
        expect(requestMaxPayout(growth, state, tracker)).not.toBeNull();

        state.balance += 2000;
        state.qualifyingDays = 7;
        expect(requestMaxPayout(growth, state, tracker)).toBeNull();
        state.qualifyingDays = 8;
        expect(requestMaxPayout(growth, state, tracker)).not.toBeNull();
    });

    it("reproduces the rules page's Withdrawable Amount examples: $4,000 of profit lets Growth request $2,000 (50%) and Pro request all $4,000 (100%)", () => {
        const growthAccount = lockedFundedAccount(growth, 4000);
        growthAccount.state.qualifyingDays = 4;
        const growthPayout = requestMaxPayout(
            growth,
            growthAccount.state,
            growthAccount.tracker,
        );
        expect(growthPayout?.debited).toBe(2000);
        expect(growthPayout?.traderReceives).toBeCloseTo(1800, 6);
        expect(growthAccount.state.balance).toBe(ACCOUNT_SIZE + 2000);

        const proAccount = lockedFundedAccount(pro, 4000);
        proAccount.state.qualifyingDays = 5;
        const proPayout = requestMaxPayout(
            pro,
            proAccount.state,
            proAccount.tracker,
        );
        expect(proPayout?.debited).toBe(4000);
        expect(proPayout?.traderReceives).toBeCloseTo(3600, 6);
    });

    it("applies the Payout Cap on top of the Withdrawable Amount: Growth $2,500 (binding only from $5,000 of profit up, so $6,000 is used here rather than the page's own $4,000 Payout Cap example, which contradicts its 50% rule), Pro $5,000 at the page's own $8,000", () => {
        const growthAccount = lockedFundedAccount(growth, 6000);
        growthAccount.state.qualifyingDays = 4;
        expect(
            requestMaxPayout(growth, growthAccount.state, growthAccount.tracker)
                ?.debited,
        ).toBe(2500);

        const proAccount = lockedFundedAccount(pro, 8000);
        proAccount.state.qualifyingDays = 5;
        expect(
            requestMaxPayout(pro, proAccount.state, proAccount.tracker)
                ?.debited,
        ).toBe(5000);
    });

    it("reproduces the rules page's Min New Profit example on both products: $2,000 kept from the prior cycle plus $400 new profit allows a maximum request of $800", () => {
        for (const plan of [growth, pro]) {
            const { state, tracker } = lockedFundedAccount(plan, 2000);
            tracker.lastPayoutBalance = state.balance;
            state.balance += 400;
            state.qualifyingDays = plan.minDaysAfterPassForPayout;
            expect(requestMaxPayout(plan, state, tracker)?.debited).toBe(800);
        }
    });

    it('refuses a payout below the $20 minimum and never touches the drawdown floor on a payout (no release, no forced lock)', () => {
        for (const plan of [growth, pro]) {
            expect(plan.minPayoutRequest).toBe(20);
            expect(plan.payoutFloorEffect).toBe(PayoutFloorEffect.None);
            const { state, tracker } = lockedFundedAccount(plan, 4000);
            state.qualifyingDays = plan.minDaysAfterPassForPayout;
            expect(requestMaxPayout(plan, state, tracker, 19)).toBeNull();
            expect(requestMaxPayout(plan, state, tracker, 20)?.debited).toBe(
                20,
            );

            const unlocked = plan.initialState();
            plan.beginFundedPhase(unlocked);
            const unlockedTracker = newFundedCycleTracker(unlocked);
            unlocked.balance = ACCOUNT_SIZE + 1000;
            plan.fundedDrawdown.onDayClose(unlocked);
            expect(unlocked.thresholdLocked).toBe(false);
            expect(unlocked.threshold).toBe(
                ACCOUNT_SIZE + 1000 - plan.fundedDrawdown.amount,
            );
            unlocked.qualifyingDays = plan.minDaysAfterPassForPayout;
            expect(
                requestMaxPayout(plan, unlocked, unlockedTracker, 20)?.debited,
            ).toBe(20);
            expect(unlocked.threshold).toBe(
                ACCOUNT_SIZE + 1000 - plan.fundedDrawdown.amount,
            );
            expect(unlocked.thresholdLocked).toBe(false);
        }
    });

    it("models the engine's own deduction from FTMO's Pro full-withdrawal warning (FTMO states no arithmetic for it): once the limit locks at the Initial Simulated Capital, a 100% withdrawal leaves the balance on the limit and the account is bust, while a partial withdrawal is not", () => {
        const drained = lockedFundedAccount(pro, 3000);
        drained.state.qualifyingDays = 5;
        const payout = requestMaxPayout(pro, drained.state, drained.tracker);
        expect(payout?.debited).toBe(3000);
        expect(payout?.causesHardBreach).toBe(false);
        expect(drained.state.balance).toBe(ACCOUNT_SIZE);
        expect(pro.isBust(drained.state, TradingPhase.Funded)).toBe(true);

        const partial = lockedFundedAccount(pro, 3000);
        partial.state.qualifyingDays = 5;
        expect(
            requestMaxPayout(pro, partial.state, partial.tracker, 2500)
                ?.debited,
        ).toBe(2500);
        expect(pro.isBust(partial.state, TradingPhase.Funded)).toBe(false);
    });

    it('never lets a Pro payout dip below the Initial Simulated Capital before the lock, even though the unlocked floor sits a full drawdown lower (Withdrawable Amount is 100% of profit, not of balance)', () => {
        const state = pro.initialState();
        pro.beginFundedPhase(state);
        const tracker = newFundedCycleTracker(state);
        state.balance = ACCOUNT_SIZE + 2000;
        pro.fundedDrawdown.onDayClose(state);
        expect(state.thresholdLocked).toBe(false);
        expect(state.threshold).toBe(ACCOUNT_SIZE - 1000);
        state.qualifyingDays = 5;
        expect(requestMaxPayout(pro, state, tracker)?.debited).toBe(2000);
        expect(state.balance).toBe(ACCOUNT_SIZE);
        expect(pro.isBust(state, TradingPhase.Funded)).toBe(false);
    });

    it(
        'leaves $2,000 above the drawdown floor on every payout: FTMO states no ' +
            'buffer, so this is a payout-discipline default rather than a firm ' +
            'figure, and it is what stops a locked Pro account from withdrawing ' +
            '100% of profit onto its own $50,000 limit and busting',
        () => {
            for (const plan of [growth, pro]) {
                expect(plan.defaultRetainedCushion()).toBe(2000);
                expect(plan.resolveRetainedCushion(undefined)).toBe(2000);
                expect(plan.resolveRetainedCushion(500)).toBe(2000);
                expect(plan.resolveRetainedCushion(5000)).toBe(5000);
                expect(plan.payoutBuffer).toBeNull();
            }

            const { state, tracker } = lockedFundedAccount(pro, 3000);
            state.qualifyingDays = 5;
            const payout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: pro.defaultRetainedCushion(),
                payoutRequestSize: undefined,
                plan: pro,
                state,
                tracker,
            });
            expect(payout?.debited).toBe(1000);
            expect(state.balance).toBe(ACCOUNT_SIZE + 2000);
            expect(pro.isBust(state, TradingPhase.Funded)).toBe(false);
        },
    );

    it('closes a Sim-Funded Account after 30 consecutive idle days but models no Evaluation inactivity rule, since none is stated', () => {
        for (const plan of [growth, pro]) {
            expect(plan.maxConsecutiveIdleDaysFor(TradingPhase.Funded)).toBe(
                30,
            );
            expect(
                plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval),
            ).toBeNull();
        }
    });

    it('models no lifetime payout cap, because none is stated (not because none exists)', () => {
        for (const plan of [growth, pro]) {
            expect(plan.maxLifetimePayouts).toBeNull();
            expect(plan.maxLifetimePayoutDollars).toBeNull();
            expect(plan.payoutLadder).toBeNull();
            expect(plan.isAccountConcluded(100, 1_000_000)).toBe(false);
        }
    });
});

describe('idle days are simulable in FTMO Futures Evaluation (no closure rule, but not forced-to-trade)', () => {
    it(
        'a forced idle day advances no trade and never closes the account, since ' +
            'evalMaxConsecutiveIdleDays is null (no rule stated), but the day still ' +
            'happens — a subscription-billed Evaluation must be able to reflect a ' +
            'skipped day, not silently trade through it',
        () => {
            for (const plan of [growth, pro]) {
                expect(
                    plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval),
                ).toBeNull();
                const state = plan.initialState();
                const stats = (() => {
                    const totals = new TradeTotals();
                    return newPhaseStats(
                        state.startingBalance,
                        totals,
                        new LossStreak(totals),
                    );
                })();
                const result = runDay({
                    commission: dollars(0),
                    dayPolicy: {
                        ladder: [500],
                        maxLossesPerDay: null,
                        stopRule: { kind: DayStopRuleKind.None },
                    },
                    idleDayProbability: 1,
                    phase: TradingPhase.Eval,
                    plan,
                    positionSizing: null,
                    rng: () => 0,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    state,
                    stats,
                    winrate: fraction(0.4),
                });
                expect(result.traded).toBe(false);
                expect(result.busted).toBe(false);
                expect(result.closedForInactivity).toBe(false);
                expect(state.consecutiveIdleDays).toBe(1);
                expect(state.elapsedDays).toBe(1);
            }
        },
    );
});
