import { describe, expect, expectTypeOf, it } from 'vitest';

import * as core from '~/lib/prop-calculator/core';
import {
    type AccountState,
    ApexVariant,
    closeTradingDay,
    ConsistencyBasis,
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    DailyLossLimitKind,
    describePayoutDayGate,
    dollars,
    DrawdownKind,
    FirmId,
    fraction,
    LucidVariant,
    MffuVariant,
    newFundedCycleTrackerAfterReset,
    PayoutDayGateBasis,
    PayoutEvaluationKind,
    PayoutFloorEffect,
    PayoutGate,
    type Plan,
    profitShareMultiplier,
    sessionDaysForCalendarDays,
    TierBasis,
    TopStepVariant,
    TradeifyVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { newFundedCycleTracker } from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { Tradeify } from '~/lib/prop-calculator/firms/tradeify/Tradeify';

const mffu = new MyFundedFutures();
const apex = new ApexTraderFunding();
const lucid = new LucidTrading();
const tradeify = new Tradeify();

function cyclePlan() {
    return plan(MffuVariant.RapidEod).withOverrides({
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.2),
        ),
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(1),
    });
}

function flexLikePlan() {
    return plan(MffuVariant.RapidEod).withOverrides({
        minPayoutProfit: dollars(500),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutLadder: {
            minRequestAmount: dollars(500),
            steps: [2000, 2000, 2000, 2000, 2000],
        },
        payoutProfitShare: profitShareMultiplier(0.5),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
        ],
    });
}

function fundedState(profit: number, threshold: number) {
    const target = plan(MffuVariant.RapidEod);
    const state = target.initialState();
    state.balance = state.startingBalance + profit;
    state.threshold = threshold;
    state.thresholdLocked = true;
    state.qualifyingDays = 99;
    return state;
}

function perpetualPlan() {
    return plan(MffuVariant.RapidEod).withOverrides({
        consistency: new ConsistencyRule(
            ConsistencyScope.Funded,
            fraction(0.2),
            ConsistencyBasis.Perpetual,
        ),
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(1),
    });
}

function plan(
    variant: MffuVariant.Builder | MffuVariant.Pro | MffuVariant.RapidEod,
) {
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

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
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

        tracker.recordSessionClose(state);
        expect(
            tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: target,
                state,
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

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 500,
            plan: target,
            state,
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

        tracker.recordSessionClose(state);
        expect(
            tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: 499,
                plan: target,
                state,
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

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 2000,
            payoutRequestSize: undefined,
            plan: target,
            state,
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

        tracker.recordSessionClose(state);
        expect(
            tracker.tryPayout({
                minRetainedCushion: 2000,
                payoutRequestSize: undefined,
                plan: target,
                state,
            }),
        ).toBeNull();
    });
});

describe('withdrawableNow', () => {
    it('returns the cushion above payoutBalanceFloor, including a minRetainedCushion above the floor', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);

        expect(
            tracker.withdrawableNow({
                minRetainedCushion: 2000,
                plan: target,
                state,
            }),
        ).toBe(900);
    });

    it('returns a non-positive value once the cushion is already at the retained floor, with no scheduling gate applied', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = fundedState(3000, 51_000);
        const tracker = newFundedCycleTracker(state);

        expect(
            tracker.withdrawableNow({
                minRetainedCushion: 2000,
                plan: target,
                state,
            }),
        ).toBe(0);
    });

    it('clamps to payoutRequestCap once the raw cushion exceeds it', () => {
        const target = new TopStep().findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (!target) throw new Error('topstep standard-standard missing');
        const state = target.initialState();
        state.balance = state.startingBalance + 40_000;
        state.threshold = state.startingBalance;
        state.thresholdLocked = true;
        const tracker = newFundedCycleTracker(state);

        expect(
            tracker.withdrawableNow({
                minRetainedCushion: 0,
                plan: target,
                state,
            }),
        ).toBe(2000);
    });

    it('clamps to payoutBalanceShareCap times accountProfit once that is tighter than the dollar cap', () => {
        const target = new TopStep().findPlan({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        if (!target) throw new Error('topstep standard-standard missing');
        const state = target.initialState();
        state.balance = state.startingBalance + 3000;
        state.threshold = state.startingBalance;
        state.thresholdLocked = true;
        const tracker = newFundedCycleTracker(state);

        expect(
            tracker.withdrawableNow({
                minRetainedCushion: 0,
                plan: target,
                state,
            }),
        ).toBe(1500);
    });

    it('uses the LockAtPlanFloor prospective threshold instead of the stale unlocked threshold', () => {
        const flex = flexLikePlan();
        const state = flex.initialState();
        state.balance = state.startingBalance + 1000;
        state.threshold = state.balance - 2000;
        state.thresholdLocked = false;
        const tracker = newFundedCycleTracker(state);

        expect(
            tracker.withdrawableNow({
                minRetainedCushion: 0,
                plan: flex,
                state,
            }),
        ).toBe(900);
    });

    it('Rapid EOD (no payout floor effect) uses the raw unlocked threshold, not a prospective one', () => {
        const rapidEod = plan(MffuVariant.RapidEod);
        const state = rapidEod.initialState();
        state.balance = state.startingBalance + 2200;
        state.threshold = state.balance - 2000;
        state.thresholdLocked = false;
        const tracker = newFundedCycleTracker(state);

        expect(
            tracker.withdrawableNow({
                minRetainedCushion: 0,
                plan: rapidEod,
                state,
            }),
        ).toBe(2000);
    });
});

describe('closeoutCredit', () => {
    it('equals payoutFromProfit of withdrawableNow, net of split and payout method fee', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 2000,
                plan: target,
                state,
            }),
        ).toBeCloseTo(810, 6);
    });

    it('ignores minDaysAfterPassForPayout, the funded consistency rule, minPayoutProfit and minPayoutRequest', () => {
        const target = plan(MffuVariant.RapidEod).withOverrides({
            consistency: new ConsistencyRule(
                ConsistencyScope.Funded,
                fraction(0.01),
            ),
            minDaysAfterPassForPayout: 999_999,
            minPayoutProfit: dollars(1_000_000),
            minPayoutRequest: dollars(1_000_000),
        });
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.cycleBestDayProfit = 2900;

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 2000,
                plan: target,
                state,
            }),
        ).toBeCloseTo(810, 6);
    });

    it('returns 0 once payoutsIssued reaches maxLifetimePayouts', () => {
        const target = plan(MffuVariant.Pro).withOverrides({
            maxLifetimePayouts: 1,
        });
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 2000,
                plan: target,
                state,
            }),
        ).toBe(0);
    });

    it('returns 0 once cumulativePayout reaches maxLifetimePayoutDollars', () => {
        const target = plan(MffuVariant.Pro);
        expect(target.maxLifetimePayoutDollars).toBe(100_000);
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.cumulativePayout = 100_000;

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 2000,
                plan: target,
                state,
            }),
        ).toBe(0);
    });

    it('returns 0 once the payout ladder is exhausted', () => {
        const builder = plan(MffuVariant.Builder);
        const ladder = builder.payoutLadder;
        if (!ladder) throw new Error('builder ladder missing');
        const state = fundedState(50_000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = ladder.steps.length;

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 0,
                plan: builder,
                state,
            }),
        ).toBe(0);
    });

    it('never mutates state or tracker', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        const stateBefore = { ...state };
        const trackerBefore = {
            cumulativePayout: tracker.cumulativePayout,
            cycleBestDayProfit: tracker.cycleBestDayProfit,
            lastPayoutBalance: tracker.lastPayoutBalance,
            payoutsIssued: tracker.payoutsIssued,
            qualifyingDaysAtLastPayout: tracker.qualifyingDaysAtLastPayout,
        };

        tracker.closeoutCredit({
            minRetainedCushion: 2000,
            plan: target,
            state,
        });

        expect(state).toStrictEqual(stateBefore);
        expect({
            cumulativePayout: tracker.cumulativePayout,
            cycleBestDayProfit: tracker.cycleBestDayProfit,
            lastPayoutBalance: tracker.lastPayoutBalance,
            payoutsIssued: tracker.payoutsIssued,
            qualifyingDaysAtLastPayout: tracker.qualifyingDaysAtLastPayout,
        }).toStrictEqual(trackerBefore);
    });
});

function lockedStateAboveFloor(target: Plan, room: number) {
    const state = target.initialState();
    state.threshold = state.startingBalance + 100;
    state.thresholdLocked = true;
    state.qualifyingDays = 999;
    state.balance = target.payoutBalanceFloor(state, 0) + room;
    return state;
}

function lucidPlan(variant: LucidVariant) {
    const found = lucid.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant,
    });
    if (!found) throw new Error(`lucid ${variant} missing`);
    return found;
}

describe('closeoutCredit per-request ceiling', () => {
    const HUGE_ROOM = 1_000_000;

    it.each([
        [0, 2000],
        [1, 2500],
        [5, 2500],
    ])(
        'Lucid Pro no-DLL credits one ladder step at payoutsIssued %i, not the whole balance',
        (payoutsIssued, step) => {
            const target = lucidPlan(LucidVariant.ProNoDll);
            const state = lockedStateAboveFloor(target, HUGE_ROOM);
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.payoutsIssued = payoutsIssued;

            expect(
                tracker.closeoutCredit({
                    minRetainedCushion: 0,
                    plan: target,
                    state,
                }),
            ).toBeCloseTo(target.payoutFromProfit(step, payoutsIssued), 6);
        },
    );

    it('Lucid Pro no-DLL credits 1800 then 2250 net of the 90% split', () => {
        const target = lucidPlan(LucidVariant.ProNoDll);
        const state = lockedStateAboveFloor(target, HUGE_ROOM);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 0,
                plan: target,
                state,
            }),
        ).toBeCloseTo(1800, 6);
        tracker.payoutsIssued = 1;
        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 0,
                plan: target,
                state,
            }),
        ).toBeCloseTo(2250, 6);
    });

    it.each([
        [0, 1800],
        [1, 1800],
        [2, 1800],
        [3, 2250],
        [4, 2250],
        [5, 2250],
        [6, 2250],
    ])(
        'Lucid Direct credits one ladder step at payoutsIssued %i',
        (payoutsIssued, expected) => {
            const target = lucidPlan(LucidVariant.Direct);
            const state = lockedStateAboveFloor(target, HUGE_ROOM);
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.payoutsIssued = payoutsIssued;

            expect(
                tracker.closeoutCredit({
                    minRetainedCushion: 0,
                    plan: target,
                    state,
                }),
            ).toBeCloseTo(expected, 6);
        },
    );

    it.each([0, 3])(
        'Lucid Daily EOD with a 500 dollar request size credits one 500 dollar request at payoutsIssued %i',
        (payoutsIssued) => {
            const target = lucidPlan(LucidVariant.DailyEod);
            expect(target.payoutLadder).toBeNull();
            const state = lockedStateAboveFloor(target, HUGE_ROOM);
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.payoutsIssued = payoutsIssued;

            expect(
                tracker.closeoutCredit({
                    minRetainedCushion: 0,
                    payoutRequestSize: 500,
                    plan: target,
                    state,
                }),
            ).toBeCloseTo(target.payoutFromProfit(500, payoutsIssued), 6);
        },
    );

    it('Lucid Flex caps the credit at its profit share of the cycle profit', () => {
        const target = lucidPlan(LucidVariant.Flex);
        const share = target.payoutProfitShare;
        if (share === null) throw new Error('lucid flex profit share missing');
        expect(share).toBe(0.5);
        const state = lockedStateAboveFloor(target, HUGE_ROOM);
        const tracker = newFundedCycleTracker(state);
        const cycleProfit = 1000;
        tracker.lastPayoutBalance = state.balance - cycleProfit;
        tracker.payoutsIssued = 1;
        const withdrawable = tracker.withdrawableNow({
            minRetainedCushion: 0,
            plan: target,
            state,
        });
        expect(withdrawable).toBeGreaterThan(share * cycleProfit);

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 0,
                plan: target,
                state,
            }),
        ).toBeCloseTo(
            target.payoutFromProfit(
                Math.min(withdrawable, share * cycleProfit),
                1,
            ),
            6,
        );
    });

    it('Apex EOD (deniesIfUnaffordable) credits 0 when the withdrawable room is below the ladder step', () => {
        const target = apex.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!target) throw new Error('apex eod missing');
        const ladder = target.payoutLadder;
        const step = ladder?.steps[0];
        if (step === undefined || ladder?.deniesIfUnaffordable !== true) {
            throw new Error('apex eod denying ladder missing');
        }
        const state = lockedStateAboveFloor(target, step - 100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        const withdrawable = tracker.withdrawableNow({
            minRetainedCushion: 0,
            plan: target,
            state,
        });
        expect(withdrawable).toBeGreaterThan(0);
        expect(withdrawable).toBeLessThan(step);

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 0,
                plan: target,
                state,
            }),
        ).toBe(0);
    });

    it('caps a no-ladder credit at the cycle-profit pool', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.balance - 500;

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 2000,
                plan: target,
                state,
            }),
        ).toBeCloseTo(target.payoutFromProfit(500, 0), 6);
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
            tracker.recordSessionClose(state);
            const payout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: builder,
                state,
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

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: apexPlan,
            state,
        });

        expect(payout?.debited).toBe(1500);
        expect(payout?.traderReceives).toBe(1500);
    });

    it('denies an Apex payout outright when cushion cannot cover the ladder step, instead of shrinking it', () => {
        const apexPlan = apex.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!apexPlan) throw new Error('apex plan missing');
        expect(apexPlan.payoutLadder?.deniesIfUnaffordable).toBe(true);

        const state = apexPlan.initialState();
        state.balance = state.startingBalance + 3000;
        state.threshold = state.startingBalance + 2100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: apexPlan,
            state,
        });

        expect(payout).toBeNull();
    });

    it('honors a smaller payoutRequestSize instead of always paying the full ladder step (deniesIfUnaffordable Apex)', () => {
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

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 600,
            plan: apexPlan,
            state,
        });

        expect(payout?.debited).toBe(600);
    });

    it('honors a smaller payoutRequestSize on a non-denying ladder plan too (MFFU Builder)', () => {
        const builder = plan(MffuVariant.Builder);

        const state = builder.initialState();
        state.balance = state.startingBalance + 40_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 600,
            plan: builder,
            state,
        });

        expect(payout?.debited).toBe(600);
    });
});

describe(
    'payout profit-share cap (synthetic, reconstructs the discontinued MFFU Flex ' +
        "plan's exact payout mechanics via withOverrides on Rapid EOD, since this " +
        'specific ladder + 50%-profit-share-cap combination is no longer exercised ' +
        'by any currently-sold MFFU plan)',
    () => {
        it('limits a payout to 50% of cycle profit when that binds', () => {
            const flex = flexLikePlan();
            expect(flex.payoutProfitShare).toBe(0.5);

            const state = flex.initialState();
            state.balance = state.startingBalance + 3000;
            state.threshold = state.startingBalance + 100;
            state.thresholdLocked = true;
            state.qualifyingDays = 99;
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;

            tracker.recordSessionClose(state);
            const payout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: flex,
                state,
            });

            expect(payout?.debited).toBe(1500);
            expect(payout?.traderReceives).toBeCloseTo(1200, 6);
        });

        it('falls back to the dollar cap once 50% of profit exceeds it', () => {
            const flex = flexLikePlan();

            const state = flex.initialState();
            state.balance = state.startingBalance + 20_000;
            state.threshold = state.startingBalance + 100;
            state.thresholdLocked = true;
            state.qualifyingDays = 99;
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;

            tracker.recordSessionClose(state);
            const payout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: flex,
                state,
            });

            expect(payout?.debited).toBe(2000);
            expect(payout?.traderReceives).toBeCloseTo(1600, 6);
        });
    },
);

describe(
    'payout-triggered early lock (synthetic, reconstructs the discontinued ' +
        "MFFU Flex plan's LockAtPlanFloor mechanics via withOverrides on Rapid EOD)",
    () => {
        it('forces the MLL to lock at starting+$100 on an early payout, before the natural threshold', () => {
            const flex = flexLikePlan();
            expect(flex.payoutFloorEffect).toBe(
                PayoutFloorEffect.LockAtPlanFloor,
            );

            const state = flex.initialState();
            state.balance = state.startingBalance + 1000;
            state.threshold = state.balance - 2000;
            state.thresholdLocked = false;
            state.qualifyingDays = 99;
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;

            tracker.recordSessionClose(state);
            const payout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: flex,
                state,
            });

            expect(payout).not.toBeNull();
            expect(state.thresholdLocked).toBe(true);
            expect(state.threshold).toBe(state.startingBalance + 100);
        });

        it('Rapid EOD (no payout floor effect) leaves the floor trailing normally through an early payout', () => {
            const rapidEod = plan(MffuVariant.RapidEod);
            expect(rapidEod.payoutFloorEffect).toBe(PayoutFloorEffect.None);

            const state = rapidEod.initialState();
            state.balance = state.startingBalance + 2200;
            state.threshold = state.balance - 2000;
            state.thresholdLocked = false;
            state.qualifyingDays = 99;
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;
            const thresholdBeforePayout = state.threshold;

            tracker.recordSessionClose(state);
            const payout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: rapidEod,
                state,
            });

            expect(payout).not.toBeNull();
            expect(state.threshold).toBe(thresholdBeforePayout);
        });
    },
);

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
            tracker.recordSessionClose(state);
            const payout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: pro,
                state,
            });
            if (payout === null) break;
            amounts.push(payout.debited);
            tracker.lastPayoutBalance = state.startingBalance;
            tracker.qualifyingDaysAtLastPayout = 0;
        }

        expect(amounts).toEqual([2000, 2500, 2500, 2500, 2500]);
    });
});

describe('Apex eval-phase drawdown locks at the Rithmic/Wealthcharts Target Profit Balance (apextraderfunding.com/help-center)', () => {
    it('eval drawdown locks once EOD balance reaches Target Profit + Max Drawdown; funded drawdown still locks separately at +$100', () => {
        const eod = apex.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!eod) throw new Error('apex eod missing');

        const evalState = eod.initialState();
        evalState.balance = evalState.startingBalance + 5000;
        eod.drawdownFor(TradingPhase.Eval).onDayClose(evalState);
        expect(evalState.thresholdLocked).toBe(true);
        expect(evalState.threshold).toBe(evalState.startingBalance + 3000);

        const fundedState = eod.initialState();
        fundedState.balance = fundedState.startingBalance + 2100;
        eod.drawdownFor(TradingPhase.Funded).onDayClose(fundedState);
        expect(fundedState.thresholdLocked).toBe(true);
        expect(fundedState.threshold).toBe(fundedState.startingBalance + 100);
    });
});

describe('funded consistency ladder (help.tradeify.co Lightning Funded)', () => {
    const lightning = tradeify.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Lightning,
    });
    if (!lightning) throw new Error('lightning missing');

    it('the consistency ceiling escalates by payout count and caps at the last step', () => {
        expect(lightning.fundedConsistencyRule(0)?.maxBestDayShare).toBe(0.2);
        expect(lightning.fundedConsistencyRule(1)?.maxBestDayShare).toBe(0.25);
        expect(lightning.fundedConsistencyRule(2)?.maxBestDayShare).toBe(0.3);
        expect(lightning.fundedConsistencyRule(9)?.maxBestDayShare).toBe(0.3);
    });

    it('a payout blocked by the stricter first-payout ceiling clears once the ceiling loosens', () => {
        const state = lightning.initialState();
        state.balance = state.startingBalance + 10_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.cycleBestDayProfit = 2200;

        tracker.recordSessionClose(state);
        const firstAttempt = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: lightning,
            state,
        });
        expect(firstAttempt).toBeNull();

        tracker.payoutsIssued = 1;
        tracker.recordSessionClose(state);
        const secondAttempt = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: lightning,
            state,
        });
        expect(secondAttempt?.debited).toBe(2000);
    });
});

function selectDaily() {
    const found = tradeify.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.SelectDaily,
    });
    if (!found) throw new Error('select daily missing');
    return found;
}

function selectDailyState(cycleProfit: number, priorProfit: number) {
    const plan = selectDaily();
    const state = plan.initialState();
    state.balance = state.startingBalance + priorProfit + cycleProfit;
    state.threshold = state.startingBalance + 100;
    state.thresholdLocked = true;
    state.qualifyingDays = 999;
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = state.startingBalance + priorProfit;
    tracker.qualifyingDaysAtLastPayout = 0;
    return { plan, state, tracker };
}

describe("Tradeify Select Daily: 2x-fresh-profit payout mechanism (hard cap confirmed at $1,000 via a scripted propfirmmatch.com panel extraction cross-checked against Tradeify's own Overview tab, 2026-09-14)", () => {
    it('withdraws 2x cycle profit when that binds tighter than the hard cap', () => {
        const plan = selectDaily();
        expect(plan.payoutProfitShare).toBe(2);

        const { state, tracker } = selectDailyState(300, 5000);
        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });

        expect(payout?.debited).toBe(600);
    });

    it('falls back to the hard dollar cap once 2x cycle profit exceeds it', () => {
        const { plan, state, tracker } = selectDailyState(700, 5000);

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });

        expect(payout?.debited).toBe(plan.payoutRequestCap);
        expect(payout?.debited).toBe(1250);
    });

    it('never allows a payout below the required starting-balance buffer', () => {
        const { plan, state, tracker } = selectDailyState(300, 0);
        expect(plan.payoutRequestCap).toBe(1250);

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });

        expect(payout).toBeNull();
    });
});

describe('Tradeify Select Flex: payout eligibility is 50% of TOTAL account profit, not cycle-since-last-payout profit', () => {
    it("caps a payout at 50% of total profit even when cycle profit alone would clear more, matching select-flex.md's own worked second-payout example ($54,000 balance, $4,000 total profit, 50% = $2,000)", () => {
        const flex = tradeify.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectFlex,
        });
        if (!flex) throw new Error('select flex missing');
        expect(flex.payoutProfitShare).toBeNull();
        expect(flex.payoutBalanceShareCap).toBe(0.5);

        const state = flex.initialState();
        state.balance = state.startingBalance + 4000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance + 1250;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
        });

        expect(payout?.debited).toBe(2000);
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

    it('offers the full pricing-path by payout-path matrix (base and DLL-add-on variants), plus the Pro Account plan', () => {
        expect(topstep.plans).toHaveLength(9);
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
            expect(target.contractLimits?.fundedMinis).toStrictEqual({
                kind: ContractLimitKind.Tiered,
                tierBasis: TierBasis.SessionOpenProfit,
                tiers: [
                    { maxContracts: 2, minBalance: 0 },
                    { maxContracts: 3, minBalance: 1500 },
                    { maxContracts: 5, minBalance: 2000 },
                ],
            });
            expect(target.payoutTiers[0]?.traderShare).toBe(0.9);
            expect(target.minPayoutProfit).toBe(0);
            expect(target.minPayoutProfitPerCycle).toBe(0.01);
            expect(target.minPayoutRequest).toBe(125);
            expect(target.payoutBalanceShareCap).toBe(0.5);
            expect(target.payoutFloorEffect).toBe(
                PayoutFloorEffect.ReleaseFloor,
            );
            expect(target.evalConsistencyRule()?.maxBestDayShare).toBe(0.55);
            expect(target.maxConsecutiveIdleDays).toBe(30);
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

            tracker.recordSessionClose(state);
            const payout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan: target,
                state,
            });

            expect(payout?.debited).toBe(cap);
            expect(payout?.traderReceives).toBeCloseTo(
                cap * 0.9 - target.payoutMethodFee,
                6,
            );
        }
    });

    it('caps a payout at 50% of funded equity when that is tighter than the dollar cap', () => {
        const target = plan(TopStepVariant.StandardStandard);
        const state = target.initialState();
        state.balance = state.startingBalance + 3000;
        state.threshold = state.startingBalance;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });

        expect(payout?.debited).toBeCloseTo(1500, 6);
        expect(payout?.debited).toBeLessThan(target.payoutRequestCap ?? 0);
    });

    it('stops binding the share cap once funded equity clears twice the dollar cap', () => {
        const target = plan(TopStepVariant.StandardStandard);
        const state = target.initialState();
        state.balance = state.startingBalance + 4000;
        state.threshold = state.startingBalance;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });

        expect(payout?.debited).toBeCloseTo(target.payoutRequestCap ?? 0, 6);
    });

    it('relocates the loss floor to the funded starting balance after the first payout, not the post-payout balance', () => {
        const target = plan(TopStepVariant.StandardStandard);
        const state = target.initialState();
        state.balance = state.startingBalance + 1800;
        state.threshold = state.startingBalance;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        const firstPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 500,
            plan: target,
            state,
        });

        expect(firstPayout?.debited).toBe(500);
        expect(state.balance).toBe(state.startingBalance + 1300);
        expect(state.threshold).toBe(state.startingBalance);
        expect(state.thresholdLocked).toBe(true);

        state.balance -= 1000;
        expect(target.drawdown.isBreached(state)).toBe(false);

        state.balance += 1500;
        tracker.qualifyingDaysAtLastPayout = 0;
        state.qualifyingDays += 999;

        tracker.recordSessionClose(state);
        const secondPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 150,
            plan: target,
            state,
        });

        expect(secondPayout?.debited).toBe(150);
        expect(state.threshold).toBe(state.startingBalance);
    });
});

describe('ConsistencyBasis.Perpetual (FundedNext FNL:003\'s "20% Perpetual Consistency Rule": best day ever recorded, never reset by a payout)', () => {
    it('does not reset cycleBestDayProfit after a successful payout, unlike the default Cycle basis', () => {
        const target = perpetualPlan();
        expect(target.fundedConsistencyRule()?.isPerpetual()).toBe(true);

        const state = target.initialState();
        state.balance = state.startingBalance + 5000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.cycleBestDayProfit = 1000;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });

        expect(payout).not.toBeNull();
        expect(tracker.cycleBestDayProfit).toBe(1000);
    });

    it('blocks a later, much smaller cycle once its own profit makes the still-carried-over best day exceed 20%', () => {
        const target = perpetualPlan();
        const state = target.initialState();
        state.balance = state.startingBalance + 5000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.cycleBestDayProfit = 1000;

        tracker.recordSessionClose(state);
        const firstPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });
        expect(firstPayout).not.toBeNull();

        state.balance += 1000;
        state.qualifyingDays += 999;

        tracker.recordSessionClose(state);
        const secondPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });

        expect(secondPayout).toBeNull();
    });

    it('contrast: the default Cycle basis resets cycleBestDayProfit after payout, so the identical follow-up cycle is NOT blocked', () => {
        const target = cyclePlan();
        expect(target.fundedConsistencyRule()?.isPerpetual()).toBe(false);

        const state = target.initialState();
        state.balance = state.startingBalance + 5000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.cycleBestDayProfit = 1000;

        tracker.recordSessionClose(state);
        const firstPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });
        expect(firstPayout).not.toBeNull();
        expect(tracker.cycleBestDayProfit).toBe(0);

        state.balance += 1000;
        state.qualifyingDays += 999;

        tracker.recordSessionClose(state);
        const secondPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });

        expect(secondPayout).not.toBeNull();
    });
});

describe('maxLifetimePayoutDollars', () => {
    it('caps cumulative trader-received payout, not the gross account debit', () => {
        const target = plan(MffuVariant.Pro).withOverrides({
            maxLifetimePayoutDollars: dollars(1000),
            minDaysAfterPassForPayout: 0,
            minPayoutProfit: dollars(0),
            minPayoutRequest: dollars(1),
            payoutTiers: [
                { thresholdProfit: dollars(0), traderShare: fraction(0.8) },
            ],
        });
        const state = fundedState(2000, 0);
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        const firstPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 1000,
            plan: target,
            state,
        });

        expect(firstPayout?.debited).toBe(1000);
        expect(firstPayout?.traderReceives).toBe(800);
        expect(tracker.cumulativePayout).toBe(800);
        expect(target.isAccountConcluded(1, tracker.cumulativePayout)).toBe(
            false,
        );

        state.balance += 1000;
        tracker.qualifyingDaysAtLastPayout = 0;
        state.qualifyingDays += 99;

        tracker.recordSessionClose(state);
        const secondPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 1000,
            plan: target,
            state,
        });

        expect(secondPayout?.debited).toBe(1000);
        expect(secondPayout?.traderReceives).toBe(800);
        expect(tracker.cumulativePayout).toBe(1600);
        expect(target.isAccountConcluded(2, tracker.cumulativePayout)).toBe(
            true,
        );

        state.balance += 1000;
        tracker.qualifyingDaysAtLastPayout = 0;
        state.qualifyingDays += 99;

        tracker.recordSessionClose(state);
        const thirdPayout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 1000,
            plan: target,
            state,
        });

        expect(thirdPayout).toBeNull();
    });

    it('does not restrict plans that never set the field', () => {
        const target = plan(MffuVariant.RapidEod);
        expect(target.maxLifetimePayoutDollars).toBeNull();
        expect(target.isAccountConcluded(1_000_000, 1_000_000_000)).toBe(false);
    });

    it('is confirmed set on the real Pro plan at $100,000', () => {
        expect(plan(MffuVariant.Pro).maxLifetimePayoutDollars).toBe(100_000);
    });
});

function calendarGatedPayoutSessions(
    target: ReturnType<typeof calendarGatedPlan>,
    isTradedOn: (session: number) => boolean,
): number[] {
    const state = target.initialState();
    target.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    const sessions: number[] = [];
    for (let session = 0; session < 24; session++) {
        state.balance = 52_600;
        closeTradingDay(
            target,
            TradingPhase.Funded,
            state,
            isTradedOn(session),
        );
        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: target.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan: target,
            state,
        });
        if (payout !== null) sessions.push(session);
    }
    return sessions;
}

function calendarGatedPlan() {
    return plan(MffuVariant.RapidEod).withOverrides({
        minDaysAfterPassForPayout: 7,
        minDaysAfterPassForPayoutPerCycle: 14,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(1),
        payoutDayGateBasis:
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout,
    });
}

describe('PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout (N-7)', () => {
    it('defaults every plan to qualifying days since the pass or the last payout', () => {
        expect(plan(MffuVariant.RapidEod).payoutDayGateBasis).toBe(
            PayoutDayGateBasis.QualifyingDaysSincePassOrPayout,
        );
    });

    it('converts calendar days to sessions at 5 sessions per 7 calendar days', () => {
        expect(sessionDaysForCalendarDays(7)).toBe(5);
        expect(sessionDaysForCalendarDays(14)).toBe(10);
        expect(sessionDaysForCalendarDays(0)).toBe(0);
    });

    it('uses the first-payout day count after the first trade and the per-cycle count after each payout', () => {
        expect(
            calendarGatedPayoutSessions(calendarGatedPlan(), () => true),
        ).toStrictEqual([5, 15]);
    });

    it('counts idle sessions once the first trade is in, but not before it', () => {
        expect(
            calendarGatedPayoutSessions(
                calendarGatedPlan(),
                (session) => session === 2,
            ),
        ).toStrictEqual([7, 17]);
    });

    it('rejects a calendar-day gate that is not a whole number of days', () => {
        expect(() =>
            calendarGatedPlan().withOverrides({
                minDaysAfterPassForPayout: 2.5,
            }),
        ).toThrow(/minDaysAfterPassForPayout/);
        expect(() =>
            calendarGatedPlan().withOverrides({
                minDaysAfterPassForPayoutPerCycle: -1,
            }),
        ).toThrow(/minDaysAfterPassForPayoutPerCycle/);
    });

    it('snapshots the day-gate progress the funded DP keys its policy on, so a replayed policy counts idle sessions under a calendar-day gate', () => {
        const target = calendarGatedPlan();
        const state = target.initialState();
        target.beginFundedPhase(state);
        const tracker = newFundedCycleTracker(state);
        for (let session = 0; session < 4; session++) {
            state.balance = 52_600;
            closeTradingDay(target, TradingPhase.Funded, state, session === 0);
            tracker.recordSessionClose(state);
            tracker.tryPayout({
                minRetainedCushion: target.resolveRetainedCushion(undefined),
                payoutRequestSize: undefined,
                plan: target,
                state,
            });
        }

        expect(tracker.payoutsIssued).toBe(0);
        expect(state.qualifyingDays - tracker.qualifyingDaysAtLastPayout).toBe(
            1,
        );
        expect(tracker.cycleSnapshot(target, state)).toStrictEqual({
            cycleBestDayProfit: tracker.cycleBestDayProfit,
            dayGateProgress: 4,
            fundedResetsUsed: 0,
            lastPayoutBalance: tracker.lastPayoutBalance,
            payoutsIssued: 0,
        });
    });

    it('snapshots the funded reset count the tracker was opened with, so the funded DP day policy picks the reset layer from the tracker alone (N-34)', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = target.initialState();
        target.beginFundedPhase(state);

        expect(
            newFundedCycleTracker(state).cycleSnapshot(target, state)
                .fundedResetsUsed,
        ).toBe(0);
        expect(
            newFundedCycleTrackerAfterReset(state, 2).cycleSnapshot(
                target,
                state,
            ).fundedResetsUsed,
        ).toBe(2);
    });

    it('opens a fresh-account tracker without a reset count and requires the count on the after-reset tracker, so a reset site cannot leave it out (N-34)', () => {
        expectTypeOf(newFundedCycleTracker).parameters.toEqualTypeOf<
            [AccountState]
        >();
        expectTypeOf(newFundedCycleTrackerAfterReset).parameters.toEqualTypeOf<
            [AccountState, number]
        >();
    });

    it('rejects an after-reset tracker whose reset count is not a positive whole number (N-34)', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = target.initialState();
        target.beginFundedPhase(state);

        for (const fundedResetsUsed of [0, -1, 1.5, NaN]) {
            expect(() =>
                newFundedCycleTrackerAfterReset(state, fundedResetsUsed),
            ).toThrow(RangeError);
        }
        expect(
            newFundedCycleTrackerAfterReset(state, 1).cycleSnapshot(
                target,
                state,
            ).fundedResetsUsed,
        ).toBe(1);
    });

    it('snapshots qualifying days since the pass or the last payout for a qualifying-day gate, exactly as before', () => {
        const target = plan(MffuVariant.RapidEod);
        const state = target.initialState();
        target.beginFundedPhase(state);
        const tracker = newFundedCycleTracker(state);
        state.qualifyingDays = 7;
        tracker.qualifyingDaysAtLastPayout = 3;

        expect(tracker.cycleSnapshot(target, state).dayGateProgress).toBe(4);
    });

    it('describes the payout day gate in its own unit, so MFF Pro reads as calendar days from the first trade that restart at each payout, not qualifying days', () => {
        expect(describePayoutDayGate(plan(MffuVariant.Pro))).toBe(
            '14 calendar days from first trade, restarting at each payout',
        );
        expect(describePayoutDayGate(calendarGatedPlan())).toBe(
            '7 calendar days from first trade, then 14 from each payout',
        );
        expect(
            describePayoutDayGate(
                plan(MffuVariant.RapidEod).withOverrides({
                    minDaysAfterPassForPayout: 5,
                }),
            ),
        ).toBe('5 qualifying days');
        expect(
            describePayoutDayGate(
                plan(MffuVariant.RapidEod).withOverrides({
                    minDaysAfterPassForPayout: 5,
                    minDaysAfterPassForPayoutPerCycle: 3,
                }),
            ),
        ).toBe('5 qualifying days, then 3 per payout cycle');
    });
});

describe('one session-clock pattern: every caller records the session close, then tries the payout (WP21a findings 1 and 4)', () => {
    it('offers no tryFundedPayout wrapper that advances the calendar clock inside a payout attempt', async () => {
        const payoutCycle =
            await import('~/lib/prop-calculator/core/FundedPayoutCycle');

        expect(Object.keys(core)).not.toContain('tryFundedPayout');
        expect(Object.keys(payoutCycle)).not.toContain('tryFundedPayout');
    });
});

describe('Lucid Daily EOD 50K payout pins: request-all is a reflecting barrier, a capped request leaves the excess (N-72, T32)', () => {
    const LOCKED_THRESHOLD = 50_100;
    const RETAINED_CUSHION = 2000;
    const BARRIER = LOCKED_THRESHOLD + RETAINED_CUSHION;

    function lockedDailyEod(balance: number) {
        const target = lucidPlan(LucidVariant.DailyEod);
        const state = target.initialState();
        state.balance = balance;
        state.threshold = LOCKED_THRESHOLD;
        state.thresholdLocked = true;
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.recordSessionClose(state);
        return { state, target, tracker };
    }

    it('debits 2,000 from 54,100 with no request size and leaves the balance on the 52,100 barrier', () => {
        const { state, target, tracker } = lockedDailyEod(54_100);

        const payout = tracker.tryPayout({
            minRetainedCushion: RETAINED_CUSHION,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });

        expect(payout?.debited).toBe(2000);
        expect(state.balance).toBe(BARRIER);
    });

    it('debits only the 500 request from 54,100 and leaves 53,600 in the account', () => {
        const { state, target, tracker } = lockedDailyEod(54_100);

        const payout = tracker.tryPayout({
            minRetainedCushion: RETAINED_CUSHION,
            payoutRequestSize: 500,
            plan: target,
            state,
        });

        expect(payout?.debited).toBe(500);
        expect(state.balance).toBe(53_600);
    });

    it('credits one 500 request net of split at 60,000 with a 500 request size, not the 7,900 withdrawable above the barrier', () => {
        const { state, target, tracker } = lockedDailyEod(60_000);
        expect(
            tracker.withdrawableNow({
                minRetainedCushion: RETAINED_CUSHION,
                plan: target,
                state,
            }),
        ).toBe(60_000 - BARRIER);

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: RETAINED_CUSHION,
                payoutRequestSize: 500,
                plan: target,
                state,
            }),
        ).toBeCloseTo(target.payoutFromProfit(500, 0), 9);
    });

    it('credits the whole 7,900 above the barrier net of split at 60,000 with no request size', () => {
        const { state, target, tracker } = lockedDailyEod(60_000);

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: RETAINED_CUSHION,
                plan: target,
                state,
            }),
        ).toBeCloseTo(target.payoutFromProfit(60_000 - BARRIER, 0), 9);
    });
});

describe('conclusionGate delegates entirely to plan.conclusionGate, dropping the old ladderStepLookup fallback (PT-46b review finding)', () => {
    it('cannot construct the capsAtLastStep-with-empty-steps ladder the fallback used to guard, since Plan itself rejects an empty payoutLadder.steps', () => {
        expect(() =>
            plan(MffuVariant.RapidEod).withOverrides({
                payoutLadder: {
                    capsAtLastStep: true,
                    minRequestAmount: dollars(1),
                    steps: [],
                },
            }),
        ).toThrow(/payoutLadder\.steps must not be empty/);
    });

    it('keeps paying at the last step of a capsAtLastStep ladder well past its step count, never reporting LadderExhausted', () => {
        const target = plan(MffuVariant.RapidEod).withOverrides({
            minPayoutProfit: dollars(0),
            minPayoutProfitPerCycle: dollars(0),
            minPayoutRequest: dollars(1),
            payoutLadder: {
                capsAtLastStep: true,
                minRequestAmount: dollars(1),
                steps: [100],
            },
        });
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.payoutsIssued = 50;

        const evaluation = tracker.evaluatePayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });

        expect(evaluation.kind).toBe(PayoutEvaluationKind.Eligible);
        if (evaluation.kind !== PayoutEvaluationKind.Eligible) return;
        expect(evaluation.debited).toBeGreaterThan(0);

        expect(
            tracker.closeoutCredit({
                minRetainedCushion: 0,
                plan: target,
                state,
            }),
        ).toBeGreaterThan(0);
    });

    it('still blocks with LadderExhausted for a non-capping ladder once every step is spent, matching the dropped fallback exactly', () => {
        const target = plan(MffuVariant.RapidEod).withOverrides({
            minPayoutProfit: dollars(0),
            minPayoutProfitPerCycle: dollars(0),
            minPayoutRequest: dollars(1),
            payoutLadder: {
                minRequestAmount: dollars(1),
                steps: [100],
            },
        });
        const state = fundedState(3000, 50_100);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.payoutsIssued = 1;

        const evaluation = tracker.evaluatePayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });

        expect(evaluation).toStrictEqual({
            gate: PayoutGate.LadderExhausted,
            kind: PayoutEvaluationKind.Blocked,
        });
    });
});
