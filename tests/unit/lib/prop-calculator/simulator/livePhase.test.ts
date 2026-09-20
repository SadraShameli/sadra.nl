import { describe, expect, it } from 'vitest';

import {
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    points,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { buildApexLivePlan } from '~/lib/prop-calculator/firms/apex/ApexLive';
import { buildFundedNextLivePlan } from '~/lib/prop-calculator/firms/fundednext/FundedNextLive';
import {
    buildLucidDailyLivePlan,
    buildLucidLivePlan,
    LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
} from '~/lib/prop-calculator/firms/lucid/LucidLive';
import { buildTopStepLivePlan } from '~/lib/prop-calculator/firms/topstep/TopStepLive';
import { buildTptLivePlan } from '~/lib/prop-calculator/firms/tpt/TptLive';
import { type Rng } from '~/lib/prop-calculator/rng';
import {
    runLiveDay,
    runLiveHorizon,
    simulateLiveAccount,
} from '~/lib/prop-calculator/simulator';

const alwaysLoses: Rng = () => 0.999;
const alwaysWins: Rng = () => 0;
const alwaysIdle: Rng = () => 0;

function runDays(
    state: LiveAccountState,
    days: number,
    rng: Rng,
    winrate: number,
    rrRatio = 2,
) {
    let lastResult = { busted: false, traded: false };
    for (let day = 0; day < days; day++) {
        lastResult = runLiveDay({
            commission: dollars(0),
            plan: buildApexLivePlan(),
            positionSizing: null,
            rng,
            rrRatio,
            state,
            tradesPerDay: 1,
            winrate: fraction(winrate),
        });
    }
    return lastResult;
}

describe('runLiveDay on Apex numbers ($0 start, $3,000 EOD trailing, 5% pre-lock cushion sizing)', () => {
    it('sizes the first trade at exactly 5% of the full $3,000 cushion: $150 risk', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.balance).toBe(-150);
        expect(state.threshold).toBe(-3000);
        expect(state.thresholdLocked).toBe(false);
    });

    it('caps a live trade to the plan max-mini-contract limit when the position-sizing config implies more contracts than allowed: $150 intended risk on a 0.5pt NQ stop ($10/contract) implies 15 contracts, capped down to $100 (10 contracts)', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: {
                instrument: INSTRUMENTS[InstrumentSymbol.NQ],
                stopPoints: points(0.5),
            },
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(state.balance).toBe(-100);
        expect(state.threshold).toBe(-3000);
    });

    it('never busts from a pure losing streak alone: risk shrinks with the cushion faster than the cushion can reach zero', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        const result = runDays(state, 5, alwaysLoses, 0);

        expect(result.busted).toBe(false);
        expect(state.balance).toBeCloseTo(-678.6571875, 8);
        expect(state.balance - state.threshold).toBeCloseTo(
            3000 * Math.pow(0.95, 5),
            8,
        );
    });

    it('locks the threshold at exactly startingBalance + $100 on the day cumulative profit first reaches $3,100, overriding whatever the EOD ratchet had already trailed it to', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        const result = runDays(state, 21, alwaysWins, 1, 1);

        expect(result.busted).toBe(false);
        expect(state.balance).toBeCloseTo(3150, 8);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(100);
    });

    it('applies the 10% post-lock rate -- double the 5% pre-lock rate -- to the cushion once locked', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();
        runDays(state, 21, alwaysWins, 1, 1);
        expect(state.thresholdLocked).toBe(true);
        const cushionAtLock = state.balance - state.threshold;

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(state.balance).toBeCloseTo(3150 + 0.1 * cushionAtLock, 8);
    });
});

describe('runLiveHorizon on Apex numbers', () => {
    it('a full ("withdraw everything") payout only ever drains the account down to the $3,100 payoutFloor safety net, not the $100 drawdown-lock threshold, so the account never busts from an ordinary full withdrawal', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 22,
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(21);
        expect(result.totalWithdrawn).toBeCloseTo(315, 8);
        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('a request size small enough for post-lock growth to outpace it never drains the cushion to the floor', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 60,
            payoutRequestSize: 50,
            plan,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(21);
        expect(result.busted).toBe(false);
        expect(result.totalWithdrawn).toBeGreaterThan(0);
    });

    it('a request size that outpaces post-lock growth still never busts the account, because withdrawals are capped at the $3,100 payoutFloor, well above the real $100 bust threshold', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 25,
            payoutRequestSize: 1000,
            plan,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(21);
        expect(result.totalWithdrawn).toBeCloseTo(1125, 8);
        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('never busts over a long horizon of pure losses, because percent-of-cushion sizing with a sub-100% rate cannot drive the cushion to zero on its own', () => {
        const plan = buildApexLivePlan();

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });
});

describe('runLiveHorizon on FundedNext numbers (negative lock offset + staged payout split)', () => {
    it('does not lock yet at day 10 (cumulative profit $1,000, half of the $2,000 starting-balance trigger)', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 10; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: null,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(state.balance).toBeCloseTo(3000, 8);
        expect(state.thresholdLocked).toBe(false);
    });

    it('locks the threshold $1,000 below the $2,000 starting balance on the day cumulative profit first reaches the $2,000 starting balance itself, unlike every positive-offset firm', () => {
        const plan = buildFundedNextLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 20; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: null,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(state.balance).toBeCloseTo(4000, 8);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(1000);
    });

    it('tracks cumulative lifetime withdrawals across many separate payout events, correctly crossing from the 100% tier into the 90% tier instead of resetting the tier math on every request', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 120,
            payoutRequestSize: 50,
            plan: buildFundedNextLivePlan(),
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(20);
        expect(result.totalWithdrawn).toBeCloseTo(5045, 6);
    });
});

describe('runLiveHorizon on Lucid Live numbers (payout request locks the $100 MLL early)', () => {
    it('makes its first withdrawal on day 2, long before live profit reaches the $2,000 starting drawdown, because Lucid locks the Max Loss Limit at $100 the moment a payout is requested and the withdrawable cushion is measured against that $100 lock target instead of the -$1,800 trailing floor', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 10,
            payoutRequestSize: 50,
            plan: buildLucidLivePlan(),
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(2);
        expect(result.totalWithdrawn).toBeCloseTo(0.9 * 105.5, 6);
    });

    it('day 1 produces nothing withdrawable at all: $100 of profit sits exactly at the $100 lock target the request would move the floor to, so the trader cannot pull a cent before day 2', () => {
        const plan = buildLucidLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(state.balance).toBe(100);
        expect(state.threshold).toBe(-1900);
        expect(state.thresholdLocked).toBe(false);
        expect(plan.withdrawableAmount(state)).toBe(0);
    });

    it('busts on day 5 once the early lock has pinned the floor at $100: a flat $50 request outruns 10% post-lock growth on the shrinking cushion and drains the balance exactly onto the locked Max Loss Limit -- the price Lucid charges for taking a payout before the $2,000 profit lock', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 10,
            payoutRequestSize: 50,
            plan: buildLucidLivePlan(),
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(true);
        expect(result.daysToBust).toBe(5);
    });

    it('still withdraws on day 2 rather than after $2,000 of profit when the trader withdraws everything, and busts on day 3 because a full withdrawal drains the balance exactly onto the freshly locked $100 floor -- the same drain-to-floor property every threshold-floored live plan here has, documented for Lucid rather than hidden', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 3,
            payoutRequestSize: undefined,
            plan: buildLucidLivePlan(),
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(2);
        expect(result.totalWithdrawn).toBeCloseTo(90, 6);
        expect(result.busted).toBe(true);
        expect(result.daysToBust).toBe(3);
    });

    it('still locks at $100 via the other trigger -- live profit reaching the $2,000 starting drawdown -- after 20 winning days with no payout request at all', () => {
        const plan = buildLucidLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 20; day++) {
            runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: null,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(state.balance).toBeCloseTo(2000, 8);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(100);
    });
});

describe("runLiveHorizon with a transitionPayout (LucidDaily's one-time capped sim-profit-above-buffer credit)", () => {
    it("pays the capped credit out before day 1 has even traded -- it is already-earned sim profit released at the moment of transition, not capital the trader still has to win -- so 90% of $15,000 is $13,500 withdrawn at daysToFirstWithdrawal 0, while day 1's own $100 of live profit sits exactly on the $100 lock target and stays unwithdrawable", () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 1,
            payoutRequestSize: undefined,
            plan: buildLucidDailyLivePlan(),
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(0);
        expect(result.totalWithdrawn).toBeCloseTo(13_500, 6);
    });

    it("layers day 2's ordinary $100 full withdrawal on top of the seeded credit as a $90 increment rather than re-paying the transition amount, ending at $13,590, and busts on day 3 exactly as the same plan without a credit does -- the cash never protects the live account", () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 3,
            payoutRequestSize: undefined,
            plan: buildLucidDailyLivePlan(),
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBe(0);
        expect(result.totalWithdrawn).toBeCloseTo(13_590, 6);
        expect(result.busted).toBe(true);
        expect(result.daysToBust).toBe(3);
    });

    it('clamps any sim profit above the buffer to the flat $15,000 cap, which does not scale with account size or count: "whether you have one 25k account or five 150k accounts, the maximum sim profit paid out on the move to live is $15,000"', () => {
        expect(buildLucidDailyLivePlan().transitionPayout).toBe(15_000);
        expect(
            buildLucidDailyLivePlan(
                LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
                dollars(30_000),
            ).transitionPayout,
        ).toBe(15_000);
    });

    it('passes a sub-cap amount through unclamped and splits it 90/10 like any other withdrawal, because $15,000 is a ceiling on the credit, not a guaranteed grant: $5,000 of profit above the buffer pays $4,500', () => {
        const plan = buildLucidDailyLivePlan(
            LUCID_LIVE_DEFAULT_CUSHION_PERCENT,
            dollars(5000),
        );

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 1,
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(plan.transitionPayout).toBe(5000);
        expect(result.totalWithdrawn).toBeCloseTo(4500, 6);
    });

    it('starts the credited account at the same $0 balance and -$2,000 floor as a LucidPro-originated live account, since the funded buffer funds the starting live drawdown and the credit is paid out instead of traded', () => {
        const state = buildLucidDailyLivePlan().initialState();

        expect(state.balance).toBe(0);
        expect(state.startingBalance).toBe(0);
        expect(state.threshold).toBe(-2000);
    });

    it('leaves every plan without a credit untouched: the shared Lucid builder and Apex both report no withdrawal at all through day 5, not a phantom day-0 payout', () => {
        expect(buildLucidLivePlan().transitionPayout).toBe(0);

        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan: buildApexLivePlan(),
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.daysToFirstWithdrawal).toBeNull();
        expect(result.totalWithdrawn).toBe(0);
    });
});

describe('runLiveHorizon on TopStep numbers (no trailing drawdown, DailyLossLimit-tiered risk)', () => {
    it('sizes off the full balance (cushion == balance, since threshold stays 0 with no liveDrawdown): 5% of the $10,000 start is $500 risk', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(state.balance).toBe(10_500);
        expect(state.threshold).toBe(0);
        expect(state.thresholdLocked).toBe(false);
    });

    it('actually pays out day one profit, unlike before this build fixed the withdrawal gate: a daily-loss-limit-shaped plan has no thresholdLocked event to wait for', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 5,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(1);
        expect(result.totalWithdrawn).toBeCloseTo(5 * 500 * 0.9, 8);
    });

    it('never busts even on a total loss streak -- TopStep Live has no trailing drawdown/max-loss-limit in this model', () => {
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 500,
            payoutRequestSize: undefined,
            plan: buildTopStepLivePlan(),
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToBust).toBeNull();
    });

    it('locks the trading day out for the rest of the day once losses reach the current Daily Loss Limit tier', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        const result = runLiveDay({
            commission: dollars(0),
            plan,
            positionSizing: null,
            rng: alwaysLoses,
            rrRatio: 2,
            state,
            tradesPerDay: 100,
            winrate: fraction(0),
        });

        expect(result.busted).toBe(false);
        expect(state.todayPnL).toBeLessThanOrEqual(-2000);
        expect(state.todayPnL).toBeGreaterThan(-2500);
    });
});

describe('runLiveDay on TPT PRO+ numbers (no buffer-zone withdrawal gate + weekly idle-day closure)', () => {
    it('is withdrawable pre-lock: balance-minus-threshold cushion is available even before thresholdLocked, matching "no buffer zone requirement for withdrawal"', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();
        state.balance = 500;

        expect(state.thresholdLocked).toBe(false);
        expect(plan.withdrawableAmount(state)).toBe(
            state.balance - state.threshold,
        );
    });

    it('does not close for inactivity with the default idleDayProbability of 0, even across many consecutive days, since no day is ever rolled idle', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        let result = {
            busted: false,
            closedForInactivity: false,
            traded: false,
        };
        for (let day = 0; day < 30; day++) {
            result = runLiveDay({
                commission: dollars(0),
                plan,
                positionSizing: null,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(result.closedForInactivity).toBe(false);
        expect(state.consecutiveIdleDays).toBe(0);
    });

    it("closes for inactivity once 7 consecutive idle days accrue, matching the same maxConsecutiveIdleDays: 7 rule as PRO's own funded-phase weekly-trading requirement", () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        let result = {
            busted: false,
            closedForInactivity: false,
            traded: false,
        };
        for (let day = 0; day < 7; day++) {
            result = runLiveDay({
                commission: dollars(0),
                idleDayProbability: 1,
                plan,
                positionSizing: null,
                rng: alwaysIdle,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }

        expect(state.consecutiveIdleDays).toBe(7);
        expect(result.busted).toBe(true);
        expect(result.closedForInactivity).toBe(true);
    });

    it('resets the idle-day counter to 0 on any traded day, so an interrupted idle streak never accumulates toward closure', () => {
        const plan = buildTptLivePlan();
        const state = plan.initialState();

        for (let day = 0; day < 6; day++) {
            runLiveDay({
                commission: dollars(0),
                idleDayProbability: 1,
                plan,
                positionSizing: null,
                rng: alwaysWins,
                rrRatio: 1,
                state,
                tradesPerDay: 1,
                winrate: fraction(1),
            });
        }
        expect(state.consecutiveIdleDays).toBe(6);

        const tradedDay = runLiveDay({
            commission: dollars(0),
            idleDayProbability: 0,
            plan,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(tradedDay.traded).toBe(true);
        expect(state.consecutiveIdleDays).toBe(0);
        expect(tradedDay.closedForInactivity).toBe(false);
    });
});

function baseLiveSimInputs() {
    return {
        horizonDays: 60,
        plan: buildApexLivePlan(),
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 2,
        trials: 200,
        winrate: 0.45,
    };
}

describe('simulateLiveAccount', () => {
    it('is deterministic for the same seed', () => {
        const a = simulateLiveAccount(baseLiveSimInputs());
        const b = simulateLiveAccount(baseLiveSimInputs());

        expect(a.liveBustProbability).toBe(b.liveBustProbability);
        expect(a.cumulativeWithdrawalsP50).toBe(b.cumulativeWithdrawalsP50);
    });

    it('exposes one cumulative-withdrawal value per trial as a plain output field, for a deferred v2 vault calc to consume without re-deriving the base simulation', () => {
        const inputs = baseLiveSimInputs();
        const out = simulateLiveAccount(inputs);

        expect(out.cumulativeWithdrawalsAtHorizon).toHaveLength(inputs.trials);
        for (const value of out.cumulativeWithdrawalsAtHorizon) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(value)).toBe(true);
        }
    });

    it('keeps every output finite and every probability within [0,1]', () => {
        const out = simulateLiveAccount(baseLiveSimInputs());

        expect(out.liveBustProbability).toBeGreaterThanOrEqual(0);
        expect(out.liveBustProbability).toBeLessThanOrEqual(1);
        expect(Number.isFinite(out.expectedAnnualWithdrawalRate)).toBe(true);
        expect(Number.isFinite(out.medianDaysToBust)).toBe(true);
        expect(Number.isFinite(out.medianDaysToFirstWithdrawal)).toBe(true);
    });

    it('hand-verifies the full aggregation pipeline end-to-end against the same worked Apex numbers as runLiveHorizon (trials: 1, winrate 1 makes the seed irrelevant since rng() < 1 is always true)', () => {
        const out = simulateLiveAccount({
            horizonDays: 22,
            plan: buildApexLivePlan(),
            rrRatio: 1,
            seed: 42,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });

        const expectedWithdrawn = 315;
        expect(out.cumulativeWithdrawalsAtHorizon).toHaveLength(1);
        expect(out.cumulativeWithdrawalsAtHorizon[0]).toBeCloseTo(
            expectedWithdrawn,
            8,
        );
        expect(out.cumulativeWithdrawalsP5).toBeCloseTo(expectedWithdrawn, 8);
        expect(out.cumulativeWithdrawalsP50).toBeCloseTo(expectedWithdrawn, 8);
        expect(out.cumulativeWithdrawalsP95).toBeCloseTo(expectedWithdrawn, 8);
        expect(out.liveBustProbability).toBe(0);
        expect(out.medianDaysToBust).toBe(0);
        expect(out.medianDaysToFirstWithdrawal).toBe(21);
        expect(out.expectedAnnualWithdrawalRate).toBeCloseTo(
            (expectedWithdrawn / 22) * TRADING_DAYS_PER_MONTH * 12,
            8,
        );
    });
});
