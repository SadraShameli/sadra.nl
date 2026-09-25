import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    FirmId,
    newFundedCycleTracker,
    type Plan,
} from '~/lib/prop-calculator/core';
import { AlphaFutures } from '~/lib/prop-calculator/firms/alphafutures/AlphaFutures';

const firm = new AlphaFutures();

function alphaPlan(variant: AlphaFuturesVariant): Plan {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant,
    });
    if (!plan) throw new Error(`Alpha Futures ${variant} 50K plan not found`);
    return plan;
}

const ALL_VARIANTS = [
    AlphaFuturesVariant.Zero,
    AlphaFuturesVariant.Standard,
    AlphaFuturesVariant.Advanced,
];

function lockedFundedState(plan: Plan, profit: number) {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    state.threshold = state.startingBalance;
    state.thresholdLocked = true;
    state.balance = state.startingBalance + profit;
    return state;
}

describe('Alpha Futures payout split follows the General Service Agreement: 70% on payouts 1-2, 80% on 3-4, 90% from 5', () => {
    it.each(ALL_VARIANTS)(
        '%s resolves the split by payout index',
        (variant) => {
            const plan = alphaPlan(variant);
            expect(
                [0, 1, 2, 3, 4, 5].map(
                    (index) => plan.payoutSplit.tiersFor(index)[0]?.traderShare,
                ),
            ).toStrictEqual([0.7, 0.7, 0.8, 0.8, 0.9, 0.9]);
        },
    );

    it('pays 700, 700, 800, 800, 900, 900 for six $1,000 Standard requests', () => {
        const plan = alphaPlan(AlphaFuturesVariant.Standard);
        const state = lockedFundedState(plan, 2000);
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.balance;

        const received: number[] = [];
        for (let payout = 0; payout < 6; payout++) {
            state.balance += 2000;
            state.qualifyingDays += 5;
            tracker.recordSessionClose(state);
            const result = tracker.tryPayout({
                minRetainedCushion: plan.resolveRetainedCushion(undefined),
                payoutRequestSize: 1000,
                plan,
                state,
            });
            received.push(result?.traderReceives ?? NaN);
        }

        expect(received.map((amount) => Math.round(amount))).toStrictEqual([
            700, 700, 800, 800, 900, 900,
        ]);
    });

    it('credits a closeout after two payouts at the third payout split of 80%', () => {
        const plan = alphaPlan(AlphaFuturesVariant.Standard);
        const state = lockedFundedState(plan, 6000);
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 2;
        const options = { minRetainedCushion: 0, plan, state };

        const withdrawable = tracker.withdrawableNow(options);
        expect(withdrawable).toBeGreaterThan(0);
        expect(tracker.closeoutCredit(options)).toBeCloseTo(
            0.8 * withdrawable,
            6,
        );
    });
});

function secondPayout(plan: Plan, profit: number) {
    const state = lockedFundedState(plan, profit);
    state.qualifyingDays = 10;
    const tracker = newFundedCycleTracker(state);
    tracker.payoutsIssued = 1;
    tracker.qualifyingDaysAtLastPayout = 5;
    tracker.lastPayoutBalance = state.startingBalance;
    tracker.recordSessionClose(state);
    return tracker.tryPayout({
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
    });
}

describe('Alpha Futures standing minimum withdrawal request ($200 Zero, $500 Standard, $1,000 Advanced, Payout Policy)', () => {
    it.each([
        { minRequest: 200, variant: AlphaFuturesVariant.Zero },
        { minRequest: 500, variant: AlphaFuturesVariant.Standard },
        { minRequest: 1000, variant: AlphaFuturesVariant.Advanced },
    ])(
        '$variant sets minPayoutRequest $minRequest and no separate first-payout profit gate',
        ({ minRequest, variant }) => {
            const plan = alphaPlan(variant);
            expect(plan.minPayoutRequest).toBe(minRequest);
            expect(plan.minPayoutProfit).toBe(0);
        },
    );

    it.each([
        { below: 390, exact: 400, variant: AlphaFuturesVariant.Zero },
        { below: 990, exact: 1000, variant: AlphaFuturesVariant.Standard },
        { below: 1990, exact: 2000, variant: AlphaFuturesVariant.Advanced },
    ])(
        '$variant refuses a second payout under the minimum and pays one at the minimum',
        ({ below, exact, variant }) => {
            const plan = alphaPlan(variant);
            expect(secondPayout(plan, below)).toBeNull();
            expect(secondPayout(plan, exact)?.debited).toBe(exact / 2);
        },
    );

    it('Zero refuses a $195 first payout (50% of $390 profit is under the $200 minimum)', () => {
        const plan = alphaPlan(AlphaFuturesVariant.Zero);
        const state = lockedFundedState(plan, 390);
        state.qualifyingDays = 5;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        expect(
            tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
            }),
        ).toBeNull();
    });
});

describe('Alpha Futures request cap is 50% of the profit in the account, not of the current cycle (Payout Policy)', () => {
    it('lets a Standard second payout draw on profit left in the account by the first', () => {
        const plan = alphaPlan(AlphaFuturesVariant.Standard);
        const state = lockedFundedState(plan, 4000);
        state.qualifyingDays = 10;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.qualifyingDaysAtLastPayout = 5;
        tracker.lastPayoutBalance = state.balance - 1000;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });

        expect(payout?.debited).toBe(2000);
    });

    it('advanced, with no Qualified consistency rule, pays after a net-losing cycle while the account still holds profit (Zero and Standard refuse it: AlphaConsistency.test.ts, N-45)', () => {
        const plan = alphaPlan(AlphaFuturesVariant.Advanced);
        const state = lockedFundedState(plan, 6000);
        state.qualifyingDays = 10;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.qualifyingDaysAtLastPayout = 5;
        tracker.lastPayoutBalance = state.balance + 1000;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan,
            state,
        });

        expect(payout?.debited).toBe(3000);
    });

    it('refuses a payout once the account holds no profit, whatever the cycle did', () => {
        const plan = alphaPlan(AlphaFuturesVariant.Standard);
        const state = lockedFundedState(plan, 0);
        state.qualifyingDays = 10;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.qualifyingDaysAtLastPayout = 5;
        tracker.lastPayoutBalance = state.balance - 1000;

        tracker.recordSessionClose(state);
        expect(
            tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
            }),
        ).toBeNull();
    });

    it('describes the cap as a flat 50% of account profit on every plan', () => {
        for (const variant of ALL_VARIANTS) {
            const plan = alphaPlan(variant);
            expect(plan.payoutBalanceShareCap).toBe(0.5);
            expect(plan.payoutProfitShare).toBeNull();
        }
    });
});

describe('Alpha Futures Advanced: Evaluation MLL $1,750 (Schedule 1, 3.5%), Qualified MLL $2,000 (Schedule 2, 4%)', () => {
    const plan = alphaPlan(AlphaFuturesVariant.Advanced);

    it('keeps the Evaluation drawdown at $1,750 locking at +$1,750', () => {
        expect(plan.drawdown.amount).toBe(1750);
        expect(plan.drawdown.lock?.atProfit).toBe(1750);
        expect(plan.initialState().threshold).toBe(48_250);
    });

    it('gives the Qualified stage a $2,000 drawdown that locks at the $50,000 starting balance', () => {
        expect(plan.fundedDrawdown.amount).toBe(2000);
        expect(plan.fundedDrawdown.lock?.atProfit).toBe(2000);
        expect(plan.fundedDrawdown.lock?.lockedThreshold(50_000)).toBe(50_000);
    });

    it('trails from $48,000 and locks only once the EOD balance reaches $52,000', () => {
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        expect(state.threshold).toBe(48_000);

        state.balance = 51_900;
        plan.fundedDrawdown.onDayClose(state);
        expect(state.threshold).toBe(49_900);
        expect(state.thresholdLocked).toBe(false);

        state.balance = 52_000;
        plan.fundedDrawdown.onDayClose(state);
        expect(state.threshold).toBe(50_000);
        expect(state.thresholdLocked).toBe(true);
    });

    it('retains one full $2,000 Qualified drawdown by default', () => {
        expect(plan.defaultRetainedCushion()).toBe(2000);
    });
});

describe('Alpha Futures Qualified 40% consistency is measured on net profit since the last request (Consistency Rule article 9492048, fetched live 2026-09-23)', () => {
    function requestAfterCycle(
        variant: AlphaFuturesVariant,
        cycleBestDayProfit: number,
    ) {
        const plan = alphaPlan(variant);
        const state = lockedFundedState(plan, 6000);
        state.qualifyingDays = 10;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.qualifyingDaysAtLastPayout = 5;
        tracker.lastPayoutBalance = state.startingBalance + 4000;
        tracker.cycleBestDayProfit = cycleBestDayProfit;
        tracker.recordSessionClose(state);
        return tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });
    }

    it.each([AlphaFuturesVariant.Zero, AlphaFuturesVariant.Standard])(
        '%s refuses a $900 best day that is 45% of the $2,000 cycle profit, though only 15% of the $6,000 account profit',
        (variant) => {
            expect(requestAfterCycle(variant, 900)).toBeNull();
        },
    );

    it.each([AlphaFuturesVariant.Zero, AlphaFuturesVariant.Standard])(
        '%s pays when the best day is $700, 35% of the $2,000 cycle profit',
        (variant) => {
            expect(requestAfterCycle(variant, 700)).not.toBeNull();
        },
    );

    it('Advanced Qualified has no consistency rule: the same $900 best day does not block it', () => {
        expect(
            requestAfterCycle(AlphaFuturesVariant.Advanced, 900),
        ).not.toBeNull();
    });
});
