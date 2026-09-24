import { describe, expect, it } from 'vitest';

import {
    closeTradingDay,
    ContractLimitKind,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    MffuVariant,
    newFundedCycleTracker,
    PayoutDayGateBasis,
    PayoutFloorEffect,
    type Plan,
    sessionDaysForCalendarDays,
    TradingPhase,
    tryFundedPayout,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const mffu = new MyFundedFutures();

function pro() {
    const plan = mffu.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFFU Pro 50K plan not found');
    return plan;
}

describe('MFFU Pro 50K (live-verified 2026-09-14 against myfundedfutures.com/plans/pro raw page data)', () => {
    it('caps eval minis at 3 (funded-only 5) but scales micros at the standard 10:1 ratio (30, not 3), matching pro.md\'s directly-confirmed "3 mini / 30 micro" eval figure rather than the embedded JSON\'s bare "3" alone', () => {
        expect(pro().contractLimits?.evalMinis).toBe(3);
        expect(pro().contractLimits?.evalMicros).toBe(30);
    });

    it('keeps funded contracts flat at 5, unchanged from before', () => {
        const funded = pro().contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded contract limit for MFFU Pro',
            );
        }
        expect(funded.maxContracts).toBe(5);
        const fundedMicros = pro().contractLimits?.fundedMicros;
        if (fundedMicros?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded micro contract limit for MFFU Pro',
            );
        }
        expect(fundedMicros.maxContracts).toBe(5);
    });

    it(
        'requires 14 days after passing before the first payout, not 10 -- ' +
            "matching the live page's own initialWithdrawalDays:14 field and its " +
            "rendered 'Payout Timing: 14 days from first trade + buffer cleared' row",
        () => {
            expect(pro().minDaysAfterPassForPayout).toBe(14);
        },
    );
});

function fundedStateAt(balance: number) {
    const plan = pro();
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    state.balance = balance;
    plan.fundedDrawdown.onDayClose(state);
    return { plan, state, tracker };
}

describe('MFFU Pro 50K funded drawdown locks on the first payout (R1-51, pro.md: "After first payout, MLL moves to $50,100 and remains static")', () => {
    it('has a funded lock with no profit trigger that moves the MLL to start + $100 on the first payout', () => {
        const plan = pro();
        expect(plan.fundedDrawdown.lock?.atProfit).toBeNull();
        expect(plan.fundedDrawdown.lock?.lockedThreshold(50_000)).toBe(50_100);
        expect(plan.payoutFloorEffect).toBe(
            PayoutFloorEffect.MoveToLockedFloor,
        );
    });

    it('keeps the evaluation drawdown lock at +$2,100 unchanged', () => {
        expect(pro().drawdown.lock?.atProfit).toBe(2100);
    });

    it('keeps trailing the funded MLL at end of day before any payout', () => {
        const { state } = fundedStateAt(54_500);
        expect(state.threshold).toBe(52_500);
        expect(state.thresholdLocked).toBe(false);
    });

    it('pays the first payout above the $2,100 buffer and then moves the MLL down to $50,100', () => {
        const { plan, state, tracker } = fundedStateAt(50_000);
        state.balance = 54_500;
        state.threshold = 52_500;
        tracker.sessionDaysSinceAnchor = 10;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: undefined,
            plan,
            state,
            tracker,
        });

        expect(payout?.debited).toBe(2400);
        expect(payout?.traderReceives).toBe(1920);
        expect(state.balance).toBe(52_100);
        expect(state.threshold).toBe(50_100);
        expect(state.thresholdLocked).toBe(true);
    });

    it('never deadlocks: an always-winning trader passes, survives and gets paid', () => {
        const out = simulate({
            dayStop: { kind: DayStopRuleKind.None },
            fundedHorizonDays: 120,
            maxEvalDays: 150,
            plan: pro(),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        });
        expect(out.evalPassProbability).toBe(1);
        expect(out.fundedBustProbability).toBe(0);
        expect(out.expectedGrossPayout).toBeGreaterThan(0);
    });
});

interface ScriptedPayout {
    readonly debited: number;
    readonly session: number;
    readonly traderReceives: number;
}

interface SessionScript {
    readonly balanceAt?: (session: number) => number | undefined;
    readonly payoutRequestSize?: number;
    readonly plan?: Plan;
    readonly sessions: number;
    readonly startBalance: number;
    readonly tradedOn: (session: number) => boolean;
}

function earlyWithdrawalPro(): Plan {
    return pro().withOverrides({ takesOneTimeEarlyWithdrawal: true });
}

function everyFourthSessionFrom(first: number) {
    return (session: number) => session >= first && (session - first) % 4 === 0;
}

function runSessions(script: SessionScript) {
    const plan = script.plan ?? pro();
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    const tracker = newFundedCycleTracker(state);
    state.balance = script.startBalance;
    const payouts: ScriptedPayout[] = [];
    for (let session = 0; session < script.sessions; session++) {
        const balance = script.balanceAt?.(session);
        if (balance !== undefined) state.balance = balance;
        closeTradingDay(
            plan,
            TradingPhase.Funded,
            state,
            script.tradedOn(session),
        );
        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: plan.resolveRetainedCushion(undefined),
            payoutRequestSize: script.payoutRequestSize,
            plan,
            state,
            tracker,
        });
        if (payout !== null) {
            payouts.push({
                debited: payout.debited,
                session,
                traderReceives: payout.traderReceives,
            });
        }
    }
    return { payouts, plan, state, tracker };
}

describe('MFFU Pro 50K payout day gate: 14 calendar days from the first sim-funded trade (N-7, help article 11802674 "14 calendar days from day of first trade", 13745661 "Request a payout every 14 calendar days from your first trade")', () => {
    it('models the gate as calendar days since the first funded trade or the last payout, 14 of them', () => {
        expect(pro().payoutDayGateBasis).toBe(
            PayoutDayGateBasis.CalendarDaysSinceFirstTradeOrPayout,
        );
        expect(pro().minDaysAfterPassForPayout).toBe(14);
        expect(sessionDaysForCalendarDays(14)).toBe(10);
    });

    it('keeps every other MFF plan on qualifying days since the pass or the last payout', () => {
        for (const plan of mffu.plans) {
            if (plan === pro()) continue;
            expect(plan.payoutDayGateBasis).toBe(
                PayoutDayGateBasis.QualifyingDaysSincePassOrPayout,
            );
        }
    });

    it('opens the first payout 10 sessions after the first funded trade, counting idle sessions, not after 14 qualifying days', () => {
        const { payouts } = runSessions({
            sessions: 16,
            startBalance: 54_500,
            tradedOn: everyFourthSessionFrom(0),
        });

        expect(payouts.map((payout) => payout.session)).toStrictEqual([10]);
        expect(payouts[0]?.debited).toBe(2400);
    });

    it('does not start the 14 calendar days before the first funded trade', () => {
        const { payouts } = runSessions({
            sessions: 18,
            startBalance: 54_500,
            tradedOn: everyFourthSessionFrom(3),
        });

        expect(payouts.map((payout) => payout.session)).toStrictEqual([13]);
    });

    it('restarts the 14 calendar days at each payout', () => {
        const { payouts } = runSessions({
            balanceAt: (session) => (session === 12 ? 53_600 : undefined),
            sessions: 30,
            startBalance: 54_500,
            tradedOn: () => true,
        });

        expect(payouts.map((payout) => payout.session)).toStrictEqual([10, 20]);
        expect(payouts[1]?.debited).toBe(1500);
    });
});

describe('MFFU Pro 50K one-time early withdrawal (N-64, T30 opt-in; help article 11802674 "One-time withdrawal: Allowed before reaching full buffer zone. Up to 60% of profits can be withdrawn, with a minimum of $1,000. Remaining 40% remains for continued trading.")', () => {
    it('carries the rule as plan data, off unless the trader opts in', () => {
        const plan = pro();
        expect(plan.oneTimeEarlyWithdrawal).toStrictEqual({
            maxProfitShare: 0.6,
            minRequest: 1000,
        });
        expect(plan.takesOneTimeEarlyWithdrawal).toBe(false);
        expect(earlyWithdrawalPro().takesOneTimeEarlyWithdrawal).toBe(true);
    });

    it('pays nothing inside the buffer when the trader has not opted in', () => {
        const { payouts } = runSessions({
            sessions: 14,
            startBalance: 51_800,
            tradedOn: () => true,
        });

        expect(payouts).toStrictEqual([]);
    });

    it('withdraws 60% of the profit once the day gate opens, then moves the MLL to start + $100 and locks it', () => {
        const { payouts, state, tracker } = runSessions({
            plan: earlyWithdrawalPro(),
            sessions: 14,
            startBalance: 51_800,
            tradedOn: () => true,
        });

        expect(payouts).toStrictEqual([
            { debited: 1080, session: 10, traderReceives: 864 },
        ]);
        expect(state.balance).toBe(50_720);
        expect(state.threshold).toBe(50_100);
        expect(state.thresholdLocked).toBe(true);
        expect(tracker.payoutsIssued).toBe(1);
    });

    it('waits for the day gate like a regular payout', () => {
        const { payouts } = runSessions({
            plan: earlyWithdrawalPro(),
            sessions: 10,
            startBalance: 51_800,
            tradedOn: () => true,
        });

        expect(payouts).toStrictEqual([]);
    });

    it('refuses an early withdrawal below the $1,000 minimum (60% of $1,600 is $960)', () => {
        const { payouts } = runSessions({
            plan: earlyWithdrawalPro(),
            sessions: 14,
            startBalance: 51_600,
            tradedOn: () => true,
        });

        expect(payouts).toStrictEqual([]);
    });

    it('honours a smaller request size within the 60%', () => {
        const { payouts } = runSessions({
            payoutRequestSize: 1000,
            plan: earlyWithdrawalPro(),
            sessions: 14,
            startBalance: 51_800,
            tradedOn: () => true,
        });

        expect(payouts.map((payout) => payout.debited)).toStrictEqual([1000]);
    });

    it('treats the next payout after the early withdrawal as a regular payout, which $980 of cycle profit does not fund', () => {
        const { payouts } = runSessions({
            balanceAt: (session) => (session === 21 ? 51_700 : undefined),
            plan: earlyWithdrawalPro(),
            sessions: 30,
            startBalance: 51_800,
            tradedOn: () => true,
        });

        expect(payouts.map((payout) => payout.session)).toStrictEqual([10]);
    });

    it('allows it only once per account: with cycle profit still under a per-cycle requirement, 60% of account profit above $1,000 is not paid a second time', () => {
        const plan = earlyWithdrawalPro().withOverrides({
            minPayoutProfitPerCycle: dollars(5000),
        });
        const { payouts, state } = runSessions({
            balanceAt: (session) => (session === 21 ? 53_000 : undefined),
            plan,
            sessions: 30,
            startBalance: 51_800,
            tradedOn: () => true,
        });

        expect(payouts.map((payout) => payout.session)).toStrictEqual([10]);
        expect(state.balance).toBe(53_000);
    });

    it('leaves a regular payout above the buffer unchanged when opted in', () => {
        const { payouts } = runSessions({
            plan: earlyWithdrawalPro(),
            sessions: 12,
            startBalance: 54_500,
            tradedOn: () => true,
        });

        expect(payouts).toStrictEqual([
            { debited: 2400, session: 10, traderReceives: 1920 },
        ]);
    });

    it('rejects opting in on a plan without the rule, and a malformed rule', () => {
        expect(() =>
            pro().withOverrides({
                oneTimeEarlyWithdrawal: undefined,
                takesOneTimeEarlyWithdrawal: true,
            }),
        ).toThrow(/takesOneTimeEarlyWithdrawal/);
        expect(() =>
            pro().withOverrides({
                oneTimeEarlyWithdrawal: {
                    maxProfitShare: fraction(0),
                    minRequest: dollars(1000),
                },
            }),
        ).toThrow(/oneTimeEarlyWithdrawal/);
        expect(() =>
            pro().withOverrides({
                oneTimeEarlyWithdrawal: {
                    maxProfitShare: fraction(0.6),
                    minRequest: dollars(-1),
                },
            }),
        ).toThrow(/oneTimeEarlyWithdrawal/);
    });

    it('pays earlier in a full simulation when opted in (deterministic winner growing $80 a session)', () => {
        const inputs = {
            dayStop: { kind: DayStopRuleKind.None },
            fundedHorizonDays: 60,
            maxEvalDays: 150,
            riskPerTrade: 80,
            rrRatio: 1,
            seed: 1,
            tradesPerDay: 1,
            trials: 1,
            winrate: 1,
        } as const;
        const optedOut = simulate({ ...inputs, plan: pro() });
        const optedIn = simulate({ ...inputs, plan: earlyWithdrawalPro() });

        expect(optedIn.expectedFirstPayoutDay).toBeLessThan(
            optedOut.expectedFirstPayoutDay,
        );
    });
});
