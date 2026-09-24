import { describe, expect, it } from 'vitest';

import {
    dollars,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    type LivePlan,
} from '~/lib/prop-calculator/core';
import { buildApexLivePlan } from '~/lib/prop-calculator/firms/apex/ApexLive';

const NQ = INSTRUMENTS[InstrumentSymbol.NQ];
const MNQ = INSTRUMENTS[InstrumentSymbol.MNQ];
const SAFETY_NET_LOCK_PROFIT = 3100;
const LOCKED_THRESHOLD = 100;

function limitsAt(plan: LivePlan, state: LiveAccountState) {
    return {
        micros: plan.maxContractsFor(state, MNQ),
        minis: plan.maxContractsFor(state, NQ),
    };
}

function sessionState(
    plan: LivePlan,
    openProfit: number,
    todayPnL = 0,
): LiveAccountState {
    const state = plan.initialState();
    const isLocked = openProfit >= SAFETY_NET_LOCK_PROFIT;
    state.balance = openProfit + todayPnL;
    state.todayPnL = todayPnL;
    state.peakDayCloseProfit = openProfit;
    state.thresholdLocked = isLocked;
    state.threshold = isLocked ? LOCKED_THRESHOLD : openProfit - 3000;
    return state;
}

describe('Apex Live levels from the pasted Live Prop Trading Program FAQ (dateModified 2026-06-30)', () => {
    it('caps Level 1 at 10 mini / 100 micro contracts from the $0 start', () => {
        const plan = buildApexLivePlan();

        expect(limitsAt(plan, plan.initialState())).toEqual({
            micros: 100,
            minis: 10,
        });
    });

    it('has no daily loss limit at Level 1', () => {
        const plan = buildApexLivePlan();

        expect(plan.dailyLossLimitFor(sessionState(plan, 9000))).toBeNull();

        expect(plan.isDayLockedOut(sessionState(plan, 9000, -8500))).toBe(
            false,
        );
    });

    it('moves to Level 2 on a $12,000 prior close: 25 mini / 250 micro and a $5,000 daily loss limit', () => {
        const plan = buildApexLivePlan();

        expect(limitsAt(plan, sessionState(plan, 12_000))).toEqual({
            micros: 250,
            minis: 25,
        });
        expect(plan.isDayLockedOut(sessionState(plan, 12_000, -4999))).toBe(
            false,
        );
        expect(plan.isDayLockedOut(sessionState(plan, 12_000, -5000))).toBe(
            true,
        );
    });

    it('moves to Level 3 on a $26,000 prior close: 30 mini / 300 micro and a $10,000 daily loss limit', () => {
        const plan = buildApexLivePlan();

        expect(limitsAt(plan, sessionState(plan, 26_000))).toEqual({
            micros: 300,
            minis: 30,
        });
        expect(plan.isDayLockedOut(sessionState(plan, 26_000, -9999))).toBe(
            false,
        );
        expect(plan.isDayLockedOut(sessionState(plan, 26_000, -10_000))).toBe(
            true,
        );
    });

    it('treats a prior close of exactly $10,000 as Level 2, since the FAQ drops to Level 1 only below $10,000', () => {
        const plan = buildApexLivePlan();

        expect(limitsAt(plan, sessionState(plan, 10_000))).toEqual({
            micros: 250,
            minis: 25,
        });
    });

    it('keeps Level 3 limits at Level 4 ($50,000 and up), which the FAQ leaves to a custom review', () => {
        const plan = buildApexLivePlan();

        expect(limitsAt(plan, sessionState(plan, 60_000))).toEqual({
            micros: 300,
            minis: 30,
        });
        expect(plan.isDayLockedOut(sessionState(plan, 60_000, -10_000))).toBe(
            true,
        );
    });

    it('never changes level during a session: a Level 1 open that runs to $12,000 intraday keeps 10 / 100 and no daily loss limit', () => {
        const plan = buildApexLivePlan();
        const state = sessionState(plan, 9000, 3000);

        expect(limitsAt(plan, state)).toEqual({ micros: 100, minis: 10 });
        state.todayPnL = -8000;
        state.balance = 1000;
        expect(plan.isDayLockedOut(state)).toBe(false);
    });

    it('keeps Level 2 for the rest of a session that opened at $12,000 and falls below $10,000 intraday', () => {
        const plan = buildApexLivePlan();

        expect(limitsAt(plan, sessionState(plan, 12_000, -3000))).toEqual({
            micros: 250,
            minis: 25,
        });
    });

    it('drops the next session to Level 1 when a payout takes the close below $10,000', () => {
        const plan = buildApexLivePlan();
        const state = sessionState(plan, 10_500);
        expect(limitsAt(plan, state).minis).toBe(25);

        plan.withdraw(state, 1000);
        state.todayPnL = 0;

        expect(state.balance).toBe(9500);
        expect(limitsAt(plan, state)).toEqual({ micros: 100, minis: 10 });
    });
});

describe('Apex Live minimum payout request', () => {
    it('is the FAQ-confirmed $500', () => {
        expect(buildApexLivePlan().minPayoutRequest).toBe(500);
    });

    it('withdraws nothing from a $3,400 balance: the $300 above the $3,100 safety net is below the $500 minimum', () => {
        const plan = buildApexLivePlan();
        const state = sessionState(plan, 3400);

        expect(plan.withdrawableAmount(state, dollars(3000))).toBe(0);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(0);
    });

    it('allows exactly $500 from a $3,600 balance', () => {
        const plan = buildApexLivePlan();

        expect(
            plan.withdrawableAmount(sessionState(plan, 3600), dollars(3000)),
        ).toBe(500);
    });
});
