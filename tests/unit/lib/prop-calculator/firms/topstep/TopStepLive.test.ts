import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator/core';
import {
    buildTopStepLivePlan,
    computeTopStepLiveStartingBalance,
} from '~/lib/prop-calculator/firms/topstep/TopStepLive';

describe('computeTopStepLiveStartingBalance', () => {
    it('is exactly the $10,000 floor when 20% of the reserve is below the floor', () => {
        expect(
            computeTopStepLiveStartingBalance(
                dollars(20_000),
                dollars(100_000),
            ),
        ).toBe(10_000);
    });

    it('is a genuine 20%-of-reserve figure once that exceeds the floor', () => {
        expect(
            computeTopStepLiveStartingBalance(
                dollars(80_000),
                dollars(100_000),
            ),
        ).toBe(16_000);
    });

    it('caps the reserve used at the account-size tier when the reserve exceeds it', () => {
        expect(
            computeTopStepLiveStartingBalance(
                dollars(150_000),
                dollars(100_000),
            ),
        ).toBe(20_000);
    });

    it('is always exactly $10,000 at the 50K tier, regardless of reserve balance -- 20% of the $50K cap already equals the floor', () => {
        expect(
            computeTopStepLiveStartingBalance(dollars(20_000), dollars(50_000)),
        ).toBe(10_000);
        expect(
            computeTopStepLiveStartingBalance(dollars(50_000), dollars(50_000)),
        ).toBe(10_000);
        expect(
            computeTopStepLiveStartingBalance(
                dollars(500_000),
                dollars(50_000),
            ),
        ).toBe(10_000);
    });
});

describe('buildTopStepLivePlan', () => {
    it('constructs without throwing', () => {
        expect(() => buildTopStepLivePlan()).not.toThrow();
    });

    it('starts at $10,000, not $0 -- the 50K-tier-inert case of the reserve formula, with no trailing drawdown floor at all', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        expect(state.balance).toBe(10_000);
        expect(state.startingBalance).toBe(10_000);
        expect(state.threshold).toBe(0);
        expect(state.thresholdLocked).toBe(false);
    });

    it('is never busted -- TopStep Live has no trailing drawdown/max-loss-limit concept in this model', () => {
        const plan = buildTopStepLivePlan();

        expect(
            plan.isBust({ ...plan.initialState(), balance: -1_000_000 }),
        ).toBe(false);
    });

    it("locks the day out once today's loss reaches the base $2,000 Daily Loss Limit at zero profit", () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        expect(plan.isDayLockedOut({ ...state, todayPnL: -1999 })).toBe(false);
        expect(plan.isDayLockedOut({ ...state, todayPnL: -2000 })).toBe(true);
    });

    it('expands the Daily Loss Limit once net profit crosses the $15,000 tier threshold', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        const atTier1 = { ...state, balance: state.startingBalance + 15_000 };

        expect(plan.isDayLockedOut({ ...atTier1, todayPnL: -4999 })).toBe(
            false,
        );
        expect(plan.isDayLockedOut({ ...atTier1, todayPnL: -5000 })).toBe(true);
    });

    it('pays the confirmed 90/10 split', () => {
        const plan = buildTopStepLivePlan();

        expect(plan.payoutFromProfit(1000)).toBeCloseTo(900, 10);
    });

    it('has no contract cap wired -- the real position-size tiers are confirmed but deliberately not attached to a ContractLimitConfig', () => {
        const plan = buildTopStepLivePlan();

        expect(plan.contractLimit).toBeNull();
    });

    it('accepts a caller-supplied cumulative XFA reserve balance for the starting-balance derivation', () => {
        const plan = buildTopStepLivePlan(undefined, dollars(20_000));

        expect(plan.initialState().balance).toBe(10_000);
    });
});
