import { describe, expect, it } from 'vitest';

import {
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    points,
    type PositionSizingConfig,
} from '~/lib/prop-calculator/core';
import { buildFundedNextLivePlan } from '~/lib/prop-calculator/firms/fundednext/FundedNextLive';
import { runLiveDay } from '~/lib/prop-calculator/simulator';

const NQ = INSTRUMENTS[InstrumentSymbol.NQ];
const MNQ = INSTRUMENTS[InstrumentSymbol.MNQ];

describe('buildFundedNextLivePlan', () => {
    it('constructs without throwing', () => {
        expect(() => buildFundedNextLivePlan()).not.toThrow();
    });

    it("starts at the 50K tier's confirmed $2,000 deposit, with the drawdown floor at $0 -- not $0 balance like Apex/Tradeify/TPT", () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();

        expect(state.balance).toBe(2000);
        expect(state.startingBalance).toBe(2000);
        expect(state.threshold).toBe(0);
        expect(state.thresholdLocked).toBe(false);
    });

    it('does not lock yet at $1,000 profit (balance $3,000) -- the lock trigger is profit equal to the starting balance, not the $1,000 offset', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 3000;

        plan.liveDrawdown?.onDayClose(state);

        expect(state.thresholdLocked).toBe(false);
    });

    it('locks the threshold $1,000 BELOW the starting balance once profit reaches the starting balance itself (balance $4,000) -- the opposite lock direction from every other confirmed live firm', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 4000;

        plan.liveDrawdown?.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(1000);
        expect(state.threshold).toBeLessThan(state.startingBalance);
        expect(state.threshold).toBe(state.startingBalance - 1000);
    });

    it('is busted only once balance falls to or below the $0 floor before the lock fires', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();

        expect(plan.isBust({ ...state, balance: 1 })).toBe(false);
        expect(plan.isBust({ ...state, balance: 0 })).toBe(true);
    });

    it('pays 100% of the first $5,000 cumulative profit, then 90% after', () => {
        const plan = buildFundedNextLivePlan();

        expect(plan.payoutFromProfit(3000)).toBeCloseTo(3000, 10);
        expect(plan.payoutFromProfit(5000)).toBeCloseTo(5000, 10);
        expect(plan.payoutFromProfit(7000)).toBeCloseTo(5000 + 2000 * 0.9, 10);
    });

    it('caps contracts at 3 minis / 30 micros before the MLL locks (article 16522296 section 4, 50K Contracts (Standard)) (N-81)', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 3999.99;
        plan.liveDrawdown?.onDayClose(state);
        plan.recordDayClose(state, true);

        expect(state.thresholdLocked).toBe(false);
        expect(plan.maxContractsFor(state, NQ)).toBe(3);
        expect(plan.maxContractsFor(state, MNQ)).toBe(30);
    });

    it('doubles the cap to 6 minis / 60 micros once the MLL locks at +$2,000 profit (article 16522296 section 4, Contracts (After MLL Locks)) (N-81)', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 4000;
        plan.liveDrawdown?.onDayClose(state);
        plan.recordDayClose(state, true);

        expect(state.thresholdLocked).toBe(true);
        expect(plan.maxContractsFor(state, NQ)).toBe(6);
        expect(plan.maxContractsFor(state, MNQ)).toBe(60);
    });

    it('keys the doubled cap on the lock itself, so an intraday balance above $4,000 does not raise it and a later withdrawal does not drop it (N-81)', () => {
        const plan = buildFundedNextLivePlan();
        const unlocked = plan.initialState();
        unlocked.balance = 4500;

        expect(plan.maxContractsFor(unlocked, NQ)).toBe(3);

        const locked = plan.initialState();
        locked.balance = 4000;
        plan.liveDrawdown?.onDayClose(locked);
        plan.withdraw(locked, 1500);

        expect(locked.balance).toBe(2500);
        expect(plan.maxContractsFor(locked, NQ)).toBe(6);
        expect(plan.maxContractsFor(locked, MNQ)).toBe(60);
    });

    it('sizes a live day at the locked cap: a huge cushion target places at most 3 NQ before the lock and 6 NQ after it (N-81)', () => {
        const plan = buildFundedNextLivePlan({
            postLock: fraction(1),
            preLock: fraction(1),
        });
        const sizing: PositionSizingConfig = {
            instrument: NQ,
            stopPoints: points(5),
        };
        const placedContracts = (state: LiveAccountState) => {
            const before = state.balance;
            runLiveDay({
                commission: dollars(0),
                idleDayProbability: 0,
                plan,
                positionSizing: sizing,
                rng: () => 0,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
            return (
                (state.balance - before) / (sizing.stopPoints * NQ.pointValue)
            );
        };

        const unlocked = plan.initialState();
        unlocked.balance = 3900;
        unlocked.threshold = 1900;
        expect(placedContracts(unlocked)).toBe(3);

        const locked = plan.initialState();
        locked.balance = 4000;
        plan.liveDrawdown?.onDayClose(locked);
        locked.balance = 20_000;
        expect(placedContracts(locked)).toBe(6);
    });

    it('never lets a withdrawal take the balance to the $2,000 initial deposit, which auto-liquidates the account (article 16522296 section 5 note) (N-81)', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 4000;
        plan.liveDrawdown?.onDayClose(state);

        const amount = plan.withdrawableAmount(state, dollars(0));
        expect(amount).toBe(1999.99);
        plan.withdraw(state, amount);

        expect(state.balance).toBeGreaterThan(state.startingBalance);
        expect(plan.payoutRequestAmount(state, dollars(0), undefined)).toBe(0);
    });

    it('keeps the $1,000 trading-loss floor of section 6 after the lock: trading below the $2,000 deposit is not a breach, touching $1,000 is (N-81)', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 4000;
        plan.liveDrawdown?.onDayClose(state);

        expect(state.threshold).toBe(1000);
        expect(plan.isBust({ ...state, balance: 1500 })).toBe(false);
        expect(plan.isBust({ ...state, balance: 1000 })).toBe(true);
    });

    it('leaves the default one-drawdown cushion withdrawal unchanged, since it already keeps the balance at $3,000 (N-81)', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();
        state.balance = 4500;
        plan.liveDrawdown?.onDayClose(state);

        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(1500);
    });
});
