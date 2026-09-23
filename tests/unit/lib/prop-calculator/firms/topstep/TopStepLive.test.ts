import { describe, expect, it } from 'vitest';

import {
    createInitialLiveAccountState,
    dollars,
    DrawdownKind,
    type LiveAccountState,
} from '~/lib/prop-calculator/core';
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

    it('starts at $10,000, not $0 (the 50K-tier-inert case of the starting-balance formula), with the $1,000 auto-liquidation floor as a static, non-trailing threshold', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        expect(state.balance).toBe(10_000);
        expect(state.startingBalance).toBe(10_000);
        expect(state.threshold).toBe(1000);
        expect(state.thresholdLocked).toBe(false);
        expect(plan.liveDrawdown?.kind).toBe(DrawdownKind.Static);
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

        expect(plan.contractLimits).toBeNull();
    });

    it('accepts a caller-supplied cumulative XFA reserve balance for the starting-balance derivation', () => {
        const plan = buildTopStepLivePlan(undefined, dollars(20_000));

        expect(plan.initialState().balance).toBe(10_000);
    });
});

function lfaStateWith(profit: number, winningDays: number) {
    const plan = buildTopStepLivePlan();
    const state = plan.initialState();
    state.balance = state.startingBalance + profit;
    state.qualifyingDays = winningDays;
    return { plan, state };
}

describe('TopStep LFA payout policy (help.topstep.com article 8284233, fetched live 2026-09-23)', () => {
    it('withholds a payout until 5 winning days of $150+ have accrued: "5 winning days of $150+ Net P&L per Payout cycle"', () => {
        const { plan, state } = lfaStateWith(3000, 4);

        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(0);
        state.qualifyingDays = 5;
        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(3000);
    });

    it('caps a request at 50% of the account balance: $14,000 of profit on a $24,000 balance pays at most $12,000 ("Request up to 50% of your account balance with no dollar cap")', () => {
        const { plan, state } = lfaStateWith(14_000, 5);

        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(12_000);
    });

    it('restarts the winning-day count after a payout: "You\'ll need 5 new winning days before you\'re eligible to request your next Payout"', () => {
        const { plan, state } = lfaStateWith(3000, 5);
        plan.withdraw(state, 1000);
        state.qualifyingDays = 9;

        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(0);
        state.qualifyingDays = 10;
        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(2000);
    });

    it('unlocks daily payouts of the whole unlocked profit after 30 winning days: no 5-day gate and no 50% cap', () => {
        const { plan, state } = lfaStateWith(14_000, 29);
        plan.withdraw(state, 0.01);
        state.balance = state.startingBalance + 14_000;
        state.qualifyingDays = 30;

        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(14_000);
    });
});

describe('TopStep LFA $1,000 auto-liquidation floor (N-44, help.topstep.com article 10657969, dateModified 2026-09-17, fetched live 2026-09-23)', () => {
    it('closes the account once the balance falls below $1,000: "If your LFA balance drops below $1,000, the account may be immediately liquidated and closed"', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        expect(plan.isBust({ ...state, balance: 999.99 })).toBe(true);
        expect(plan.isBust({ ...state, balance: 1000.01 })).toBe(false);
    });

    it('sizes off the $9,000 distance to the floor, not the whole $10,000 balance', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        expect(state.balance - state.threshold).toBe(9000);
    });
});

describe('TopStep LFA payouts from the unlocked seed balance (N-44, article 8284233: "Request up to 50% of your account balance with no dollar cap")', () => {
    it('lets a drain-to-floor request take 50% of a $10,750 balance, $5,375, not only the $750 of profit', () => {
        const { plan, state } = lfaStateWith(750, 5);

        expect(plan.withdrawableAmount(state, dollars(0))).toBe(5375);
    });

    it('keeps the seed by default: the one-drawdown default cushion is the $9,000 between the $10,000 seed and the $1,000 floor, so only the $750 of profit is paid', () => {
        const { plan, state } = lfaStateWith(750, 5);

        expect(plan.defaultRetainedCushion()).toBe(9000);
        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(750);
    });

    it('after 30 winning days drains the unlocked balance to one cent above the $1,000 floor: "request as much of your unlocked balance as you want"', () => {
        const { plan, state } = lfaStateWith(2000, 30);

        expect(plan.withdrawableAmount(state, dollars(0))).toBe(10_999.99);
    });
});

function closeSessions(
    plan: ReturnType<typeof buildTopStepLivePlan>,
    state: LiveAccountState,
    dailyPnL: readonly number[],
): void {
    for (const pnl of dailyPnL) {
        state.todayPnL = pnl;
        state.balance += pnl;
        plan.recordDayClose(state, pnl !== 0);
        state.todayPnL = 0;
    }
}

const QUIET_WEEK = [0, 0, 0, 0, 0];

describe('TopStep LFA Reserve and Capital Expansion (N-44, article 10657969: "80% held in Reserve, released in 4 increments of 25% as you hit profit thresholds")', () => {
    it('holds $40,000 in Reserve at the default 50K tier and releases it in four $10,000 increments', () => {
        const plan = buildTopStepLivePlan();

        expect(plan.seedReserve).toStrictEqual({
            amount: 40_000,
            depositLagSessions: 2,
            increments: 4,
            profitTargetPerIncrement: 3000,
            reviewIntervalSessions: 5,
        });
    });

    it('releases $10,000 into the unlocked balance two sessions after the weekly review that sees $3,000 of net profit: "Reviewed every Monday morning", "Funds deposited within 1-2 business days"', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0]);
        expect(state.balance).toBe(13_000);

        closeSessions(plan, state, [0]);
        expect(state.balance).toBe(23_000);
        expect(state.startingBalance).toBe(20_000);
    });

    it('counts the released Reserve as seed, not profit: the Daily Loss Limit tier stays on the $2,000 base tier', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0, 0]);

        expect(plan.isDayLockedOut({ ...state, todayPnL: -1999 })).toBe(false);
        expect(plan.isDayLockedOut({ ...state, todayPnL: -2000 })).toBe(true);
    });

    it('does not release on $2,999 of net profit, and carries the profit into the next weekly review', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [2999, 0, 0, 0, 0, 0, 0]);
        expect(state.balance).toBe(12_999);

        closeSessions(plan, state, [1, 0, 0, 0, 0, 0, 0]);
        expect(state.balance).toBe(23_000);
    });

    it('releases one increment per review however large the win: "You cannot unlock multiple tiers with a single large win"', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [9000, ...QUIET_WEEK, 0, 0, 0, 0, 0, 0]);

        expect(state.startingBalance).toBe(20_000);
    });

    it('counts net trading P&L since the last expansion, so a payout does not reduce it', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [3000]);
        plan.withdraw(state, 1500);

        closeSessions(plan, state, [0, 0, 0, 0, 0, 0]);

        expect(state.balance).toBe(21_500);
    });

    it('releases at most the four increments, $40,000 in all', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        const winningWeek = [3000, 0, 0, 0, 0];
        for (let week = 0; week < 6; week++) {
            closeSessions(plan, state, winningWeek);
        }
        closeSessions(plan, state, QUIET_WEEK);

        expect(state.startingBalance).toBe(50_000);
        expect(state.balance).toBe(50_000 + 6 * 3000);
    });

    it('keeps a released increment out of payouts, in the default and the drain-to-floor policy alike', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0, 0]);
        state.qualifyingDays = 30;

        expect(state.balance).toBe(23_000);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(12_000);
        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(3000);
    });

    it('keeps the released Reserve out of payouts even after all four increments are unlocked, so a withdrawal never returns the transferred XFA balance as income', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        for (let week = 0; week < 4; week++) {
            closeSessions(plan, state, [3000, 0, 0, 0, 0]);
        }
        closeSessions(plan, state, [0, 0]);
        state.qualifyingDays = 30;

        expect(state.startingBalance).toBe(50_000);
        expect(state.balance).toBe(62_000);
        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(12_000);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(21_000);
    });

    it('reports its Reserve terms for the CLI to disclose', () => {
        expect(buildTopStepLivePlan().seedReserveTerms()).toStrictEqual({
            amount: 40_000,
            depositLagSessions: 2,
            increments: 4,
            profitTargetPerIncrement: 3000,
            reviewIntervalSessions: 5,
        });
    });

    it('sizes off the cushion net of the held-back Reserve: after one $10,000 release on $3,000 of profit, 5% risks $600 of the $12,000 above the floor and Reserve, not $1,100 of the whole $22,000', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0, 0]);

        expect(state.balance - state.threshold).toBe(22_000);
        expect(
            plan.cushionPercentFor(state) * (state.balance - state.threshold),
        ).toBeCloseTo(600, 9);
    });

    it('risks nothing once losses reach into the released Reserve, which stays out of both sizing and payouts', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0, 0, -12_000]);

        expect(state.balance - state.threshold).toBe(10_000);
        expect(plan.cushionPercentFor(state)).toBe(0);
    });

    it('holds no Reserve when the capped transfer is only the $10,000 starting balance', () => {
        expect(
            buildTopStepLivePlan(undefined, dollars(10_000)).seedReserve.amount,
        ).toBe(0);
    });

    it('fails loud when recordDayClose is handed a state that did not come from initialState()', () => {
        const plan = buildTopStepLivePlan();
        const plain = createInitialLiveAccountState(10_000, 1000);

        expect(() => plan.recordDayClose(plain, true)).toThrow(
            'TopStep Live Funded Account (LFA): recordDayClose needs the Reserve progress that initialState() creates',
        );
    });
});
