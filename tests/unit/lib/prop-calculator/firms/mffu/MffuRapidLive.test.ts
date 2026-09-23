import { describe, expect, it } from 'vitest';

import {
    createInitialLiveAccountState,
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
} from '~/lib/prop-calculator/core';
import { buildMffuRapidLivePlan } from '~/lib/prop-calculator/firms/mffu/MffuRapidLive';
import { type Rng } from '~/lib/prop-calculator/rng';
import { runLiveHorizon } from '~/lib/prop-calculator/simulator';

const alwaysWins: Rng = () => 0;

function stateAt(overrides: Partial<LiveAccountState>): LiveAccountState {
    return { ...createInitialLiveAccountState(0, -2000), ...overrides };
}

describe('buildMffuRapidLivePlan', () => {
    it('constructs without throwing', () => {
        expect(() => buildMffuRapidLivePlan()).not.toThrow();
    });

    it("starts at $0 with the 50K tier's confirmed $2,000 EOD trailing threshold", () => {
        const plan = buildMffuRapidLivePlan();
        const state = plan.initialState();

        expect(state.balance).toBe(0);
        expect(state.threshold).toBe(-2000);
        expect(state.thresholdLocked).toBe(false);
    });

    it("locks the threshold flush at $0 once profit reaches $2,000, unlike Apex/Tradeify's +$100 buffer", () => {
        const plan = buildMffuRapidLivePlan();
        const state = plan.initialState();
        state.balance = 2000;

        plan.liveDrawdown?.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(0);
    });

    it('pays the confirmed 90/10 split on withdrawn profit', () => {
        const plan = buildMffuRapidLivePlan();

        expect(plan.payoutFromProfit(1000)).toBeCloseTo(900, 10);
    });

    it("caps the 50K tier at the confirmed 3 minis / 30 micros ('Understanding Rapid Live', updated 2026-09-08)", () => {
        const plan = buildMffuRapidLivePlan();
        const state = plan.initialState();

        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
        ).toBe(3);
        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
        ).toBe(30);
    });
});

describe('MFFU Rapid Live minimum live withdrawal (N-41, help.myfundedfutures.com article 12109396, fetched live 2026-09-23)', () => {
    it('sets the firm-wide $250 minimum: "Live traders must ensure that the minimum amount that they can withdraw is $250"', () => {
        expect(buildMffuRapidLivePlan().minPayoutRequest).toBe(250);
    });

    it('withholds $249.99 of withdrawable profit and pays $250', () => {
        const plan = buildMffuRapidLivePlan();

        expect(
            plan.withdrawableAmount(
                stateAt({ balance: 249.99, threshold: -1750.01 }),
                dollars(0),
            ),
        ).toBe(0);
        expect(
            plan.withdrawableAmount(
                stateAt({ balance: 250, threshold: -1750 }),
                dollars(0),
            ),
        ).toBe(250);
    });
});

describe('MFFU Rapid Live withdrawals (no buffer, daily, $0 floor)', () => {
    it('does not gate withdrawals behind the drawdown lock and floors them at the $0 starting balance', () => {
        const plan = buildMffuRapidLivePlan();

        expect(plan.requiresLockForWithdrawal).toBe(false);
        expect(plan.payoutFloor).toBe(0);
    });

    it('withdraws the $1,500 of positive profit before the lock, not $0 behind a lock gate and not $2,000 down to the trailing threshold', () => {
        const plan = buildMffuRapidLivePlan();

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1500,
                    threshold: -500,
                    thresholdLocked: false,
                }),
                dollars(0),
            ),
        ).toBe(1500);
    });

    it('withdraws nothing from the initial state or from a negative pre-lock balance', () => {
        const plan = buildMffuRapidLivePlan();

        expect(plan.withdrawableAmount(plan.initialState(), dollars(0))).toBe(
            0,
        );
        expect(
            plan.withdrawableAmount(
                stateAt({ balance: -300, threshold: -1900 }),
                dollars(0),
            ),
        ).toBe(0);
    });

    it('withdraws $2,299.99 post-lock when draining to the floor, keeping one cent above the $0 Max Loss Limit, and only the $300 above the default $2,000 cushion otherwise', () => {
        const plan = buildMffuRapidLivePlan();
        const state = stateAt({
            balance: 2300,
            threshold: 0,
            thresholdLocked: true,
        });

        expect(plan.withdrawableAmount(state, dollars(0))).toBe(2299.99);
        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(300);
    });

    it('withdraws before the lock when draining to the floor, where the $0 payoutFloor sits well above the trailing threshold: the first $300 on day 3 once the excess reaches the $250 live minimum, $1,716.993 over 22 days with no bust', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 22,
            payoutRequestSize: undefined,
            plan: buildMffuRapidLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(3);
        expect(result.busted).toBe(false);
        expect(result.totalWithdrawn).toBeCloseTo(1716.993, 6);
    });

    it('does not bust after a post-lock drain-to-floor withdrawal: 20 winning trades on day 1 lock the Max Loss Limit at $0, the withdrawal leaves one cent above it, and day 2 keeps trading', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan: buildMffuRapidLivePlan(),
            positionSizing: null,
            retainedCushion: dollars(0),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 20,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
        expect(result.daysToFirstWithdrawal).toBe(1);
        expect(result.totalWithdrawn).toBeGreaterThan(0.9 * 3306);
    });
});
