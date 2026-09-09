import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DailyLossLimitKind,
    DrawdownKind,
    FirmId,
    LucidVariant,
    MffuVariant,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

const mffu = new MyFundedFutures();
const apex = new ApexTraderFunding();
const lucid = new LucidTrading();

function fundedState(profit: number, threshold: number) {
    const target = plan(MffuVariant.RapidEod);
    const state = target.initialState();
    state.balance = state.startingBalance + profit;
    state.threshold = threshold;
    state.thresholdLocked = true;
    state.fundingBaseline = state.startingBalance;
    state.qualifyingDays = 99;
    return state;
}

function plan(variant: MffuVariant.Builder | MffuVariant.RapidEod) {
    const found = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!found) throw new Error(`${variant} missing`);
    return found;
}

describe('non-ladder payouts', () => {
    it('pays out for a plan with no payout ladder', () => {
        const target = plan(MffuVariant.RapidEod);
        expect(target.payoutLadder).toBeNull();

        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(2900);
        expect(payout?.traderReceives).toBeCloseTo(2610, 6);
        expect(state.balance).toBe(state.threshold);
    });

    it('withholds a payout until the first-cycle profit gate is cleared', () => {
        const target = plan(MffuVariant.RapidEod);
        expect(target.minPayoutProfit).toBe(2100);

        const state = fundedState(2099, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        expect(
            tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: target,
                state,
                tracker,
            }),
        ).toBeNull();
    });

    it('caps the debit at the requested size without re-applying the profit gate', () => {
        const target = plan(MffuVariant.RapidEod);
        expect(target.minPayoutRequest).toBe(500);

        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: 500,
            plan: target,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(500);
        expect(state.balance).toBe(state.startingBalance + 2500);
    });

    it('refuses a request below the plan minimum', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        expect(
            tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: 499,
                plan: target,
                state,
                tracker,
            }),
        ).toBeNull();
    });
});

describe('minimum retained cushion', () => {
    it('never withdraws below the retained cushion', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 2000,
            payoutRequestSize: undefined,
            plan: target,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(900);
        expect(state.balance - state.threshold).toBeGreaterThanOrEqual(2000);
    });

    it('blocks the payout entirely when the cushion is already at the retained floor', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = fundedState(3000, 51_000);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        expect(
            tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 2000,
                payoutRequestSize: undefined,
                plan: target,
                state,
                tracker,
            }),
        ).toBeNull();
    });
});

describe('ladder payouts', () => {
    it('pays the ladder step and stops once the steps run out', () => {
        const builder = plan(MffuVariant.Builder);
        const ladder = builder.payoutLadder;
        if (!ladder) throw new Error('builder ladder missing');

        const state = builder.initialState();
        state.balance = state.startingBalance + 40_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        let issued = 0;
        for (let attempt = 0; attempt < 10; attempt++) {
            const payout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: builder,
                state,
                tracker,
            });
            if (payout === null) break;
            expect(payout.debited).toBe(2000);
            expect(payout.traderReceives).toBeCloseTo(1600, 6);
            issued += 1;
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;
        }
        expect(issued).toBe(ladder.steps.length);
    });

    it('pays an Apex ladder step at the full amount because its split is 100%', () => {
        const apexPlan = apex.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!apexPlan) throw new Error('apex plan missing');

        const state = apexPlan.initialState();
        state.balance = state.startingBalance + 10_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: apexPlan,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(1500);
        expect(payout?.traderReceives).toBe(1500);
    });
});

describe('payout profit-share cap', () => {
    it('limits a Flex payout to 50% of cycle profit when that binds', () => {
        const flex = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Flex,
        });
        if (!flex) throw new Error('flex missing');
        expect(flex.payoutProfitShare).toBe(0.5);

        const state = flex.initialState();
        state.balance = state.startingBalance + 3000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(1500);
        expect(payout?.traderReceives).toBeCloseTo(1200, 6);
    });

    it('falls back to the dollar cap once 50% of profit exceeds it', () => {
        const flex = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Flex,
        });
        if (!flex) throw new Error('flex missing');

        const state = flex.initialState();
        state.balance = state.startingBalance + 20_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(2000);
        expect(payout?.traderReceives).toBeCloseTo(1600, 6);
    });
});

describe('payout-triggered early lock (help.myfundedfutures.com Flex plan)', () => {
    it('forces the Flex MLL to lock at starting+$100 on an early payout, before the natural threshold', () => {
        const flex = mffu.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Flex,
        });
        if (!flex) throw new Error('flex missing');
        expect(flex.payoutTriggersLock).toBe(true);

        const state = flex.initialState();
        state.balance = state.startingBalance + 1000;
        state.threshold = state.balance - 2000;
        state.thresholdLocked = false;
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(state.startingBalance + 100);
    });

    it('Rapid EOD (no payoutTriggersLock) leaves the floor trailing normally through an early payout', () => {
        const rapidEod = plan(MffuVariant.RapidEod);
        expect(rapidEod.payoutTriggersLock).toBe(false);

        const state = rapidEod.initialState();
        state.balance = state.startingBalance + 2200;
        state.threshold = state.balance - 2000;
        state.thresholdLocked = false;
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        const thresholdBeforePayout = state.threshold;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: rapidEod,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(state.threshold).toBe(thresholdBeforePayout);
    });
});

describe('payout ladder capped-at-last-step (help.myfundedfutures.com / support.lucidtrading.com)', () => {
    it('LucidPro caps every payout from #2 onward at the last ladder step instead of exhausting', () => {
        const pro = lucid.findPlan({
            accountSize: 50_000,
            firm: FirmId.Lucid,
            variant: LucidVariant.Pro,
        });
        if (!pro) throw new Error('lucid pro missing');
        expect(pro.payoutLadder?.steps).toEqual([2000, 2500]);

        const state = pro.initialState();
        state.balance = state.startingBalance + 50_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const amounts: number[] = [];
        for (let attempt = 0; attempt < 5; attempt++) {
            const payout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: pro,
                state,
                tracker,
            });
            if (payout === null) break;
            amounts.push(payout.debited);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;
        }

        expect(amounts).toEqual([2000, 2500, 2500, 2500, 2500]);
    });
});

describe('Apex eval-phase drawdown never locks under Tradovate (apextraderfunding.com/help-center)', () => {
    it('eval drawdown keeps trailing indefinitely; funded drawdown still locks at +$100', () => {
        const eod = apex.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!eod) throw new Error('apex eod missing');

        const evalState = eod.initialState();
        evalState.balance = evalState.startingBalance + 10_000;
        eod.drawdownFor('eval').onDayClose(evalState);
        expect(evalState.thresholdLocked).toBe(false);
        expect(evalState.threshold).toBe(
            evalState.balance - eod.drawdown.amount,
        );

        const fundedState = eod.initialState();
        fundedState.balance = fundedState.startingBalance + 2100;
        eod.drawdownFor('funded').onDayClose(fundedState);
        expect(fundedState.thresholdLocked).toBe(true);
        expect(fundedState.threshold).toBe(fundedState.startingBalance + 100);
    });
});

describe('Topstep 50K parameters (help.topstep.com)', () => {
    const topstep = new TopStep();

    function plan(variant: TopStepVariant) {
        const found = topstep.findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant,
        });
        if (!found) throw new Error(`${variant} missing`);
        return found;
    }

    const TOPSTEP_VARIANTS = {
        'no-fee-consistency': TopStepVariant.NoFeeConsistency,
        'no-fee-standard': TopStepVariant.NoFeeStandard,
        'standard-consistency': TopStepVariant.StandardConsistency,
        'standard-standard': TopStepVariant.StandardStandard,
    } as const satisfies Record<string, TopStepVariant>;

    const ALL: TopStepVariant[] = Object.values(TOPSTEP_VARIANTS);

    it('offers the full pricing-path by payout-path matrix', () => {
        expect(topstep.plans).toHaveLength(4);
        for (const variant of ALL) {
            expect(plan(variant).accountSize).toBe(50_000);
        }
    });

    it('shares the Trading Combine parameters across all four plans', () => {
        for (const variant of ALL) {
            const target = plan(variant);
            expect(target.profitTarget).toBe(3000);
            expect(target.drawdown.amount).toBe(2000);
            expect(target.drawdown.kind).toBe(DrawdownKind.EodTrailing);
            expect(target.minTradingDays).toBe(2);
            expect(target.evalDailyLossLimit.kind).toBe(
                DailyLossLimitKind.None,
            );
            expect(target.contractLimits?.evalMinis).toBe(5);
            expect(target.contractLimits?.evalMicros).toBe(50);
            expect(target.contractLimits?.fundedMinis).toBeNull();
            expect(target.payoutTiers[0]?.traderShare).toBe(0.9);
            expect(target.minPayoutProfit).toBe(0);
            expect(target.minPayoutProfitPerCycle).toBe(0.01);
            expect(target.minPayoutRequest).toBe(125);
            expect(target.payoutBalanceShareCap).toBe(0.5);
            expect(target.payoutResetsLossLimit).toBe(true);
            expect(target.evalConsistencyRule()?.maxBestDayShare).toBe(0.5);
        }
    });

    it('locks the max loss limit at the starting balance once profit reaches it', () => {
        const target = plan(TopStepVariant.StandardStandard);
        const state = target.initialState();
        expect(state.threshold).toBe(48_000);

        state.balance = 50_500;
        target.drawdown.onDayClose(state);
        expect(state.threshold).toBe(48_500);

        state.balance = 50_000;
        target.drawdown.onDayClose(state);
        expect(state.threshold).toBe(48_500);

        state.balance = 52_000;
        target.drawdown.onDayClose(state);
        expect(state.threshold).toBe(50_000);
        expect(state.thresholdLocked).toBe(true);

        state.balance = 60_000;
        target.drawdown.onDayClose(state);
        expect(state.threshold).toBe(50_000);
    });

    it('varies only fees along the pricing axis', () => {
        for (const payout of ['standard', 'consistency'] as const) {
            const paid = plan(TOPSTEP_VARIANTS[`standard-${payout}`]);
            const free = plan(TOPSTEP_VARIANTS[`no-fee-${payout}`]);

            expect(paid.fees.activation).toBe(149);
            expect(paid.fees.monthlySubscription).toBe(49);
            expect(paid.fees.reset).toBe(49);

            expect(free.fees.activation).toBe(0);
            expect(free.fees.monthlySubscription).toBe(95);
            expect(free.fees.reset).toBe(95);

            expect(paid.minDaysAfterPassForPayout).toBe(
                free.minDaysAfterPassForPayout,
            );
            expect(paid.payoutRequestCap).toBe(free.payoutRequestCap);
        }
    });

    it('varies only payout rules along the payout axis', () => {
        for (const pricing of ['standard', 'no-fee'] as const) {
            const standard = plan(TOPSTEP_VARIANTS[`${pricing}-standard`]);
            const consistency = plan(
                TOPSTEP_VARIANTS[`${pricing}-consistency`],
            );

            expect(standard.minDaysAfterPassForPayout).toBe(5);
            expect(standard.minQualifyingDayProfit).toBe(150);
            expect(standard.payoutRequestCap).toBe(2000);
            expect(standard.fundedConsistencyRule()).toBeNull();

            expect(consistency.minDaysAfterPassForPayout).toBe(3);
            expect(consistency.minQualifyingDayProfit).toBeNull();
            expect(consistency.payoutRequestCap).toBe(3000);
            expect(consistency.fundedConsistencyRule()?.maxBestDayShare).toBe(
                0.4,
            );

            expect(standard.fees.activation).toBe(consistency.fees.activation);
        }
    });

    it('caps a single payout request at the path cap', () => {
        for (const [variant, cap] of [
            [TopStepVariant.StandardStandard, 2000],
            [TopStepVariant.StandardConsistency, 3000],
        ] as const) {
            const target = plan(variant);
            const state = target.initialState();
            state.balance = state.startingBalance + 40_000;
            state.threshold = state.startingBalance;
            state.thresholdLocked = true;
            state.qualifyingDays = 999;
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;

            const payout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: target,
                state,
                tracker,
            });

            expect(payout?.debited).toBe(cap);
            expect(payout?.traderReceives).toBeCloseTo(cap * 0.9, 6);
        }
    });

    it('caps a payout at 50% of balance when that is tighter than the dollar cap', () => {
        const target = plan(TopStepVariant.StandardStandard);
        const state = target.initialState();
        state.balance = state.startingBalance - 47_000;
        state.threshold = state.startingBalance - 49_900;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance - 50_000;
        tracker.qualifyingDaysAtLastPayout = 0;
        const balanceBeforePayout = state.balance;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
            tracker,
        });

        expect(payout?.debited).toBeCloseTo(0.5 * balanceBeforePayout, 6);
        expect(payout?.debited).toBeLessThan(target.payoutRequestCap ?? 0);
    });

    it('locks the loss floor at literal zero after the first payout, not the post-payout balance', () => {
        const target = plan(TopStepVariant.StandardStandard);
        const state = target.initialState();
        state.balance = state.startingBalance + 1800;
        state.threshold = state.startingBalance;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const firstPayout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: 500,
            plan: target,
            state,
            tracker,
        });

        expect(firstPayout?.debited).toBe(500);
        expect(state.balance).toBe(state.startingBalance + 1300);
        expect(state.threshold).toBe(0);
        expect(state.thresholdLocked).toBe(true);

        state.balance -= 1000;
        expect(target.drawdown.isBreached(state)).toBe(false);

        state.balance += 1500;
        tracker.qualifyingDaysAtLastPayout = 0;
        state.qualifyingDays += 999;

        const secondPayout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: 150,
            plan: target,
            state,
            tracker,
        });

        expect(secondPayout?.debited).toBe(150);
        expect(state.threshold).toBe(0);
    });
});
