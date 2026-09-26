import { describe, expect, it } from 'vitest';

import {
    createInitialLiveAccountState,
    dollars,
    DrawdownKind,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    ReserveLivePlan,
} from '~/lib/prop-calculator/core';
import {
    buildTopStepLivePlan,
    computeTopStepLiveStartingBalance,
    TopStep,
} from '~/lib/prop-calculator/firms';
import { runLiveDay, runLiveHorizon } from '~/lib/prop-calculator/simulator';

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

    it('builds a ReserveLivePlan, which the core barrel exports', () => {
        expect(buildTopStepLivePlan()).toBeInstanceOf(ReserveLivePlan);
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

    it('expands the Daily Loss Limit once net profit has held the $15,000 tier threshold for 10 Active Trading Days', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [15_000]);
        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 1);

        expect(plan.isDayLockedOut({ ...state, todayPnL: -2499.99 })).toBe(
            false,
        );
        expect(plan.isDayLockedOut({ ...state, todayPnL: -2500 })).toBe(true);
    });

    it('pays the confirmed 90/10 split', () => {
        const plan = buildTopStepLivePlan();

        expect(plan.payoutFromProfit(1000)).toBeCloseTo(900, 10);
    });

    it('wires the position-size tiers as one lot table for minis and micros alike', () => {
        for (const profit of [0, 100_000, 200_000]) {
            const plan = buildTopStepLivePlan();
            const state = plan.initialState();
            closeSessions(plan, state, [profit]);
            closeActiveSessions(plan, state, 8 * ACTIVE_DAYS_PER_TIER);

            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
            ).toBe(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
            );
        }
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

    it('treats a balance of exactly $1,000.00 as a breach (decision T17: reaching the line closes the account)', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        expect(plan.isBust({ ...state, balance: 1000 })).toBe(true);
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

const ACTIVE_DAYS_PER_TIER = 10;

function closeActiveSessions(
    plan: ReturnType<typeof buildTopStepLivePlan>,
    state: LiveAccountState,
    count: number,
): void {
    closeFlatSessions(plan, state, count, true);
}

function closeFlatSessions(
    plan: ReturnType<typeof buildTopStepLivePlan>,
    state: LiveAccountState,
    count: number,
    isTraded: boolean,
): void {
    for (let session = 0; session < count; session++) {
        state.todayPnL = 0;
        plan.recordDayClose(state, isTraded);
    }
}

function closeIdleSessions(
    plan: ReturnType<typeof buildTopStepLivePlan>,
    state: LiveAccountState,
    count: number,
): void {
    closeFlatSessions(plan, state, count, false);
}

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

function unlockedLimitsAt(profit: number) {
    const plan = buildTopStepLivePlan();
    const state = plan.initialState();
    closeSessions(plan, state, [profit]);
    closeActiveSessions(plan, state, 8 * ACTIVE_DAYS_PER_TIER);
    return [
        plan.dailyLossLimitFor(state),
        plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
    ];
}

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

    it('releases the Reserve for withdrawal once all four increments are unlocked: "Once 100% of your balance has been unlocked, you may withdraw those funds as well"', () => {
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
        ).toBe(52_000);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(60_999.99);
    });

    it('still holds three released increments back while the fourth is pending', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        for (let week = 0; week < 4; week++) {
            closeSessions(plan, state, [3000, 0, 0, 0, 0]);
        }
        state.qualifyingDays = 30;

        expect(state.startingBalance).toBe(40_000);
        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(12_000);
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

    it('sizes off the whole cushion, released Reserve included, since released Reserve is "available to trade": 5% of the $22,000 above the floor after one release', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0, 0]);

        expect(state.balance - state.threshold).toBe(22_000);
        expect(plan.cushionPercentFor(state)).toBe(0.05);
    });

    it('keeps sizing at 5% once losses reach into the released Reserve, so the account keeps trading', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0, 0, -12_000]);

        expect(state.balance - state.threshold).toBe(10_000);
        expect(plan.cushionPercentFor(state)).toBe(0.05);
    });

    it('holds no Reserve when the capped transfer is only the $10,000 starting balance', () => {
        expect(
            buildTopStepLivePlan(undefined, dollars(10_000)).seedReserve.amount,
        ).toBe(0);
    });

    it('fails loud when recordDayClose is handed a state that did not come from initialState(), naming the session close', () => {
        const plan = buildTopStepLivePlan();
        const plain = createInitialLiveAccountState(10_000, 1000);

        expect(() => plan.recordDayClose(plain, true)).toThrow(
            'TopStep Live Funded Account (LFA): the session close needs the Reserve progress that initialState() creates',
        );
    });

    it('names the payout, not recordDayClose, when a payout is asked of a state that did not come from initialState()', () => {
        const plan = buildTopStepLivePlan();
        const plain = createInitialLiveAccountState(10_000, 1000);

        expect(() => plan.withdrawableAmount(plain, dollars(0))).toThrow(
            'TopStep Live Funded Account (LFA): a payout needs the Reserve progress that initialState() creates',
        );
    });
});

describe('TopStep LFA final payout at auto-liquidation (R-12, article 10657969: "The remaining balance would then be sent as a final Payout.", "Unlocked reserve is forfeited")', () => {
    it('pays the remaining $800 balance: "Account drops to $800 = auto liquidation ... The remaining $800 is sent as a final Payout"', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        state.balance = 800;

        expect(plan.payoutOnLiquidation(state)).toBe(800);
    });

    it('pays only the balance, not the unreleased Reserve, after one release', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0, 0]);
        state.balance = 950;

        expect(state.startingBalance).toBe(20_000);
        expect(plan.payoutOnLiquidation(state)).toBe(950);
    });

    it('never pays a negative remainder', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        state.balance = -25;

        expect(plan.payoutOnLiquidation(state)).toBe(0);
    });
});

function fullyReleasedAtFifteenThousandProfit() {
    const plan = buildTopStepLivePlan();
    const state = plan.initialState();
    for (let week = 0; week < 4; week++) {
        closeSessions(plan, state, [3000, 0, 0, 0, 0]);
    }
    closeSessions(plan, state, [0, 0, 3000]);
    closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 1);
    state.qualifyingDays = 30;
    return { plan, state };
}

function topStepLfaNote(): string {
    const marker = 'Live Funded Account (modeled in TopStepLive.ts';
    const note = new TopStep().notes.find((candidate) =>
        candidate.includes(marker),
    );
    if (note === undefined) {
        throw new Error(`no TopStep note contains "${marker}"`);
    }
    return note;
}

describe('TopStep LFA Daily Loss Limit tier follows net trading profit (N-57, help.topstep.com article 11748475, dateModified 2026-09-24, fetched live 2026-09-26: "Only profits made in the Live Funded Account count. Your Express Funded Account transfer balance and Payouts don\'t affect your Tier.")', () => {
    it('reaches the $2,500 tier on $15,000 of trading profit with all four Reserve increments out', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();

        expect(state.startingBalance).toBe(50_000);
        expect(state.balance).toBe(65_000);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });

    it('keeps the $2,500 tier after the $40,000 Reserve is returned, the same tier as a run with the same trading P&L and no capital return', () => {
        const reference = fullyReleasedAtFifteenThousandProfit();
        const returned = fullyReleasedAtFifteenThousandProfit();

        returned.plan.withdraw(returned.state, 40_000);

        expect(returned.state.balance).toBe(25_000);
        expect(returned.plan.dailyLossLimitFor(returned.state)).toBe(
            reference.plan.dailyLossLimitFor(reference.state),
        );
        expect(returned.plan.dailyLossLimitFor(returned.state)).toBe(2500);
        expect(
            returned.plan.isDayLockedOut({
                ...returned.state,
                todayPnL: -2499,
            }),
        ).toBe(false);
    });

    it('keeps the $2,500 tier after a $3,000 payout of profit, since payouts do not affect the tier', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();

        plan.withdraw(state, 3000);

        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });

    it('keeps the tier across the next session close after the Reserve is returned', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();
        plan.withdraw(state, 40_000);

        closeSessions(plan, state, [0]);

        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });

    it('still drops a tier on a trading loss: one dollar of trading loss below $15,000 of profit falls back to the $2,000 tier', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();

        closeSessions(plan, state, [-1]);

        expect(plan.dailyLossLimitFor(state)).toBe(2000);
    });

    it('keeps the position-size tier on net trading profit too: 30 lots at $100,000 of profit, still 30 after a $50,000 payout', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [100_000]);
        closeActiveSessions(plan, state, 4 * ACTIVE_DAYS_PER_TIER - 1);

        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
        ).toBe(30);
        plan.withdraw(state, 50_000);
        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
        ).toBe(30);
    });
});

describe('TopStep LFA position size (N-58, article 11748475: "Position Limits remain at the max for each account size (5 lots for $50Ks, 10 lots for $100Ks, 15 lots for $150Ks) until the account reaches Tier 4 with with $100K in profit")', () => {
    it('caps a fresh 50K LFA at 5 minis', () => {
        const plan = buildTopStepLivePlan();

        expect(
            plan.maxContractsFor(
                plan.initialState(),
                INSTRUMENTS[InstrumentSymbol.NQ],
            ),
        ).toBe(5);
    });

    it('caps micros at the same 5 lots, since article 8284223 says "The Micro to Mini ratio functionality is available for the Trading Combine and Express Funded Account. It is not currently available for the Live Funded Account."', () => {
        const plan = buildTopStepLivePlan();

        expect(
            plan.maxContractsFor(
                plan.initialState(),
                INSTRUMENTS[InstrumentSymbol.MNQ],
            ),
        ).toBe(5);
    });

    it('keeps 5 lots at $99,999.99 of profit and expands along the table once every tier is unlocked: 30 lots from $100,000, 50 from $200,000, 70 from $550,000, 100 from $1,000,000', () => {
        const nq = INSTRUMENTS[InstrumentSymbol.NQ];
        const lotsAt = (profit: number) => {
            const plan = buildTopStepLivePlan();
            const state = plan.initialState();
            closeSessions(plan, state, [profit]);
            closeActiveSessions(plan, state, 8 * ACTIVE_DAYS_PER_TIER);
            return plan.maxContractsFor(state, nq);
        };

        expect(lotsAt(99_999.99)).toBe(5);
        expect(lotsAt(100_000)).toBe(30);
        expect(lotsAt(200_000)).toBe(50);
        expect(lotsAt(550_000)).toBe(70);
        expect(lotsAt(1_000_000)).toBe(100);
    });

    it('reads the lot count and the Daily Loss Limit from one expansion table once every tier is unlocked', () => {
        expect(unlockedLimitsAt(0)).toStrictEqual([2000, 5]);
        expect(unlockedLimitsAt(15_000)).toStrictEqual([2500, 5]);
        expect(unlockedLimitsAt(20_000)).toStrictEqual([3000, 5]);
        expect(unlockedLimitsAt(50_000)).toStrictEqual([3500, 5]);
        expect(unlockedLimitsAt(100_000)).toStrictEqual([10_000, 30]);
        expect(unlockedLimitsAt(200_000)).toStrictEqual([20_000, 50]);
        expect(unlockedLimitsAt(550_000)).toStrictEqual([50_000, 70]);
        expect(unlockedLimitsAt(1_000_000)).toStrictEqual([100_000, 100]);
    });
});

describe('TopStep 50K LFA Daily Loss Limit tiers (N-67, help.topstep.com article 11748475, dateModified 2026-09-24T14:00:24Z, fetched live 2026-09-26: "For the first three tiers, +$500 is added to your starting Daily Loss Limit for each tier you achieve:", "$50K Account (Starts at $2,000 DLL):", "$15k Profit -> $2,500 DLL", "$20k Profit -> $3,000 DLL", "$50k Profit -> $3,500 DLL")', () => {
    it('adds $500 per tier on the $2,000 base, not the 150K account figures of $5,000, $5,500 and $6,000', () => {
        expect(unlockedLimitsAt(14_999.99)).toStrictEqual([2000, 5]);
        expect(unlockedLimitsAt(15_000)).toStrictEqual([2500, 5]);
        expect(unlockedLimitsAt(19_999.99)).toStrictEqual([2500, 5]);
        expect(unlockedLimitsAt(20_000)).toStrictEqual([3000, 5]);
        expect(unlockedLimitsAt(49_999.99)).toStrictEqual([3000, 5]);
        expect(unlockedLimitsAt(50_000)).toStrictEqual([3500, 5]);
        expect(unlockedLimitsAt(99_999.99)).toStrictEqual([3500, 5]);
    });

    it('matches the TopStep LFA note: the 50K tiers and the revised article date', () => {
        const lfaNote = topStepLfaNote();

        for (const stale of [
            '$5,000 from $15,000, $5,500 from $20,000, $6,000 from $50,000',
            'dateModified 2026-07-17',
        ]) {
            expect(lfaNote).not.toContain(stale);
        }
        for (const phrase of [
            '$2,500 from $15,000, $3,000 from $20,000, $3,500 from $50,000',
            'For the first three tiers, +$500 is added to your starting Daily Loss Limit for each tier you achieve',
            'dateModified 2026-09-24',
        ]) {
            expect(lfaNote).toContain(phrase);
        }
    });
});

describe('TopStep LFA Daily Loss Limit Safeguard (N-58, article 11748475: "Tradable balance at or below $10,000 -> DLL drops to $2,000, Max Position Size = 5", "Tradable balance at or below $5,000 -> DLL drops to $1,000, Max Position Size = 3", "These limits update on Fridays and return to standard levels once your balance rises back above the thresholds")', () => {
    const nq = INSTRUMENTS[InstrumentSymbol.NQ];
    const mnq = INSTRUMENTS[InstrumentSymbol.MNQ];

    it('drops to a $1,000 Daily Loss Limit and 3 lots after a session closes at $5,000', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [-5000]);

        expect(state.balance).toBe(5000);
        expect(plan.dailyLossLimitFor(state)).toBe(1000);
        expect(plan.isDayLockedOut({ ...state, todayPnL: -1000 })).toBe(true);
        expect(plan.maxContractsFor(state, nq)).toBe(3);
        expect(plan.maxContractsFor(state, mnq)).toBe(3);
    });

    it('does not tighten mid-session: an intraday balance under $5,000 keeps the standard $2,000 until the session closes ("your end-of-day balance goes below $10,000 ... before the start of the next trading session")', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        expect(
            plan.dailyLossLimitFor({
                ...state,
                balance: 4000,
                todayPnL: -6000,
            }),
        ).toBe(2000);
    });

    it('keeps the $1,000 limit through a midweek recovery and returns to the standard $2,000 and 5 lots only after the Friday close ("The DLL will return to $3,000 after the market closes on Friday if your balance is above $10,000")', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [-5000, 6000, 0, 0]);
        expect(state.balance).toBe(11_000);
        expect(plan.dailyLossLimitFor(state)).toBe(1000);
        expect(plan.maxContractsFor(state, nq)).toBe(3);

        closeSessions(plan, state, [0]);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);
        expect(plan.maxContractsFor(state, nq)).toBe(5);
    });

    it('relaxes on a Friday only to the level the balance still qualifies for: $7,000 at the Friday close moves from 3 to 5 lots', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [-5000, 2000, 0, 0, 0]);

        expect(state.balance).toBe(7000);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);
        expect(plan.maxContractsFor(state, nq)).toBe(5);
    });

    it('tightens again the next week once a session closes at $5,000 or below', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [-5000, 6000, 0, 0, 0, -6000]);

        expect(state.balance).toBe(5000);
        expect(plan.dailyLossLimitFor(state)).toBe(1000);
    });

    it('caps a higher profit tier at $2,000 once the tradable balance is at or below $10,000: $15,000 of trading profit after a payout down to $9,000', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();

        plan.withdraw(state, 56_000);

        expect(state.balance).toBe(9000);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);
        expect(plan.maxContractsFor(state, nq)).toBe(5);
    });

    it('tightens as soon as a payout leaves $5,000 or less, not a session later', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();

        plan.withdraw(state, 60_000);

        expect(state.balance).toBe(5000);
        expect(plan.dailyLossLimitFor(state)).toBe(1000);
        expect(plan.maxContractsFor(state, nq)).toBe(3);
    });

    it('applies at $10,000.00 after a default-cushion payout on the $2,500 tier, $500 under the tier limit', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();
        expect(plan.dailyLossLimitFor(state)).toBe(2500);

        plan.withdraw(
            state,
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        );

        expect(state.balance).toBe(10_000);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);
        expect(plan.maxContractsFor(state, nq)).toBe(5);
    });

    for (const subCent of [0.004, 0.009]) {
        it(`reads the balance in whole cents: a default-cushion payout from a balance with ${subCent} dollars below the cent still lands at 10,000.00 dollars and applies`, () => {
            const { plan, state } = fullyReleasedAtFifteenThousandProfit();
            state.balance += subCent;

            plan.withdraw(
                state,
                plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
            );

            expect(state.balance).toBeGreaterThan(10_000);
            expect(state.balance).toBeLessThan(10_000.01);
            expect(plan.dailyLossLimitFor(state)).toBe(2000);
        });
    }

    it('reads a session close in whole cents too: a close at $10,000.004 on the $2,500 tier applies', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();
        closeSessions(plan, state, [1000]);
        plan.withdraw(state, 55_000);
        expect(state.balance).toBe(11_000);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);

        closeSessions(plan, state, [-999.996]);

        expect(state.balance).toBeGreaterThan(10_000);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);
    });

    it('does not apply one whole cent above the line: $10,000.01 after a payout keeps the $2,500 tier', () => {
        const { plan, state } = fullyReleasedAtFifteenThousandProfit();
        state.balance += 0.01;

        plan.withdraw(state, 55_000);

        expect(state.balance).toBeCloseTo(10_000.01, 6);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });

    it('fails loud when asked for a limit on a state that did not come from initialState()', () => {
        const plan = buildTopStepLivePlan();

        expect(() =>
            plan.dailyLossLimitFor(createInitialLiveAccountState(10_000, 1000)),
        ).toThrow(
            'TopStep Live Funded Account (LFA): needs the LFA progress that initialState() creates',
        );
    });
});

describe('TopStep LFA Safeguard reads the tradable balance after a Reserve deposit landing at the same session close (article 11748475: "Tradable balance at or below $5,000 -> DLL drops to $1,000"; article 10657969: "additional funds are released from your Reserve into your unlocked balance")', () => {
    it('does not tighten when the session closes at $5,000 before the $10,000 increment lands, since the account holds a $15,000 tradable balance for the next session', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [3000, 0, 0, 0, 0, 0, -8000]);

        expect(state.startingBalance).toBe(20_000);
        expect(state.balance).toBe(15_000);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);
        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
        ).toBe(5);
    });
});

describe('TopStep LFA tier timing (N-59, help.topstep.com article 11748475, dateModified 2026-09-24, fetched live 2026-09-26: "Your Daily Loss Limit increases at end of day after 10 Active Trading Days in the new Tier.", "If your net profit falls below your Tier at end of day, your Daily Loss Limit scales down that same day.", "If you drop out of a Tier before 10 days, the counter resets when you re-enter it.", "You must move one Tier at a time. No skipping.", "Active Trading Day: Any day you place at least 1 trade")', () => {
    const nq = INSTRUMENTS[InstrumentSymbol.NQ];

    it('keys the Daily Loss Limit and the lot cap on the session open, not on live intraday profit: an unlocked $15,000 tier keeps $2,500 and 5 lots while the session runs up to $100,000', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [15_000]);
        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 1);
        const intraday = {
            ...state,
            balance: state.balance + 85_000,
            todayPnL: 85_000,
        };

        expect(plan.dailyLossLimitFor(state)).toBe(2500);
        expect(plan.dailyLossLimitFor(intraday)).toBe(2500);
        expect(plan.maxContractsFor(intraday, nq)).toBe(5);
    });

    it('keeps the $2,000 limit and 5 lots mid-session when live profit crosses $15,000 during the first session', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        state.balance += 15_000;
        state.todayPnL = 15_000;

        expect(plan.dailyLossLimitFor(state)).toBe(2000);
        expect(plan.maxContractsFor(state, nq)).toBe(5);
    });

    it('keeps the $2,000 limit through the 9th Active Trading Day at $15,000 of profit and raises it to $2,500 at the close of the 10th', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [15_000]);
        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 2);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);

        closeActiveSessions(plan, state, 1);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });

    it('counts only Active Trading Days: idle sessions inside the new tier do not move the counter', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [15_000]);
        closeActiveSessions(plan, state, 4);
        closeIdleSessions(plan, state, 20);
        closeActiveSessions(plan, state, 4);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);

        closeActiveSessions(plan, state, 1);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });

    it('restarts the count when a session closes back below the tier before the 10th day', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [15_000]);
        closeActiveSessions(plan, state, 5);
        closeSessions(plan, state, [-1, 1]);
        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 2);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);

        closeActiveSessions(plan, state, 1);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });

    it('moves one tier at a time: $20,000 of profit reaches $2,500 after 10 Active Trading Days and $3,000 only after 10 more', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();

        closeSessions(plan, state, [20_000]);
        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 1);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);

        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 1);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);

        closeActiveSessions(plan, state, 1);
        expect(plan.dailyLossLimitFor(state)).toBe(3000);
    });

    it('scales down at the close of a day that ends below the tier, not during the session', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [15_000]);
        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 1);

        expect(
            plan.dailyLossLimitFor({
                ...state,
                balance: state.balance - 1,
                todayPnL: -1,
            }),
        ).toBe(2500);

        closeSessions(plan, state, [-1]);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);
    });

    it('earns a lost tier again with 10 new Active Trading Days: an unlocked $15,000 tier that closes one session below it stays at $2,000 on re-entry until the 10th new day', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [15_000]);
        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 1);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);

        closeSessions(plan, state, [-1, 1]);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);

        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 2);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);

        closeActiveSessions(plan, state, 1);
        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });

    it('opens the lot caps on the same timing: $100,000 of profit steps the limit through $2,500, $3,000 and $3,500 and keeps 5 lots until the close of the 40th Active Trading Day', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [100_000]);
        const limitsAfter = (activeDays: number) => {
            closeActiveSessions(plan, state, activeDays);
            return [
                plan.dailyLossLimitFor(state),
                plan.maxContractsFor(state, nq),
            ];
        };

        expect(limitsAfter(ACTIVE_DAYS_PER_TIER - 2)).toStrictEqual([2000, 5]);
        expect(limitsAfter(1)).toStrictEqual([2500, 5]);
        expect(limitsAfter(ACTIVE_DAYS_PER_TIER)).toStrictEqual([3000, 5]);
        expect(limitsAfter(ACTIVE_DAYS_PER_TIER)).toStrictEqual([3500, 5]);
        expect(limitsAfter(ACTIVE_DAYS_PER_TIER - 1)).toStrictEqual([3500, 5]);
        expect(limitsAfter(1)).toStrictEqual([10_000, 30]);
    });

    it('keeps counting through a payout, since payouts do not affect the tier', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        closeSessions(plan, state, [15_000]);
        closeActiveSessions(plan, state, 5);

        plan.withdraw(state, 3000);
        closeActiveSessions(plan, state, ACTIVE_DAYS_PER_TIER - 6);

        expect(plan.dailyLossLimitFor(state)).toBe(2500);
    });
});

const PRE_REVISION_50K_TIER_LIMITS: ReadonlyMap<number, number> = new Map([
    [2500, 5000],
    [3000, 5500],
    [3500, 6000],
]);
const TRACE_DAYS = 60;
const RESERVE_RETURNED = 40_000;

interface LfaTraceDay {
    readonly debited: number;
    readonly limit: null | number;
    readonly pnl: number;
}

function profitDebitedOverHorizon(plan: ReserveLivePlan): number {
    const result = runLiveHorizon({
        commission: dollars(0),
        horizonDays: TRACE_DAYS,
        payoutRequestSize: undefined,
        plan,
        positionSizing: null,
        retainedCushion: plan.resolveRetainedCushion(undefined),
        rng: () => 0,
        rrRatio: 1,
        tradesPerDay: 1,
        winrate: fraction(1),
    });
    return result.recurringWithdrawn / 0.9;
}

function tracedProfitDebited(trace: readonly LfaTraceDay[]): number {
    return trace.reduce((sum, day) => sum + day.debited, 0) - RESERVE_RETURNED;
}

function traceWinningDays(plan: ReserveLivePlan): LfaTraceDay[] {
    const state = plan.initialState();
    const retainedCushion = plan.resolveRetainedCushion(undefined);
    const trace: LfaTraceDay[] = [];
    for (let day = 0; day < TRACE_DAYS; day++) {
        const limit = plan.dailyLossLimitFor(state);
        runLiveDay({
            commission: dollars(0),
            idleDayProbability: 0,
            plan,
            positionSizing: null,
            rng: () => 0,
            rrRatio: 1,
            state,
            tradesPerDay: 1,
            winrate: fraction(1),
        });
        const debited = plan.payoutRequestAmount(
            state,
            retainedCushion,
            undefined,
        );
        if (debited > 0) plan.withdraw(state, debited);
        trace.push({ debited, limit, pnl: state.todayPnL });
    }
    return trace;
}

function withPreRevisionTierLimits(plan: ReserveLivePlan): ReserveLivePlan {
    const counterfactual = Object.create(plan) as ReserveLivePlan;
    counterfactual.dailyLossLimitFor = (state) => {
        const limit = plan.dailyLossLimitFor.call(counterfactual, state);
        return limit === null
            ? null
            : (PRE_REVISION_50K_TIER_LIMITS.get(limit) ?? limit);
    };
    return counterfactual;
}

describe('TopStep LFA 60-day profitDebited re-pin (N-67): livePhase.test.ts moved from $49,131.46 to $48,783.96, and the whole -$347.50 is the 50K tier change', () => {
    const current = buildTopStepLivePlan();
    const preRevision = withPreRevisionTierLimits(buildTopStepLivePlan());
    const currentTrace = traceWinningDays(current);
    const preRevisionTrace = traceWinningDays(preRevision);
    const firstTierSession = 29;

    it('reproduces both pins: $48,783.96 on the $2,500 tier and $49,131.46 with the pre-revision $5,000 limit on the same plan', () => {
        expect(profitDebitedOverHorizon(current)).toBeCloseTo(48_783.96, 3);
        expect(profitDebitedOverHorizon(preRevision)).toBeCloseTo(49_131.46, 3);
        expect(tracedProfitDebited(currentTrace)).toBeCloseTo(48_783.96, 3);
        expect(tracedProfitDebited(preRevisionTrace)).toBeCloseTo(49_131.46, 3);
    });

    it('takes the whole -$347.50 on day 30, the first session on the unlocked $15,000 tier: its winner is capped at the $2,500 limit where the $5,000 limit let the 5% risk of about $2,847.50 through', () => {
        const day = currentTrace[firstTierSession];
        const preRevisionDay = preRevisionTrace[firstTierSession];

        expect(day?.limit).toBe(2500);
        expect(preRevisionDay?.limit).toBe(5000);
        expect(day?.pnl).toBeCloseTo(2500, 9);
        expect(preRevisionDay?.pnl).toBeCloseTo(2847.5, 2);
        expect(
            (day?.debited ?? 0) - (preRevisionDay?.debited ?? 0),
        ).toBeCloseTo(-347.5, 9);
        expect(
            tracedProfitDebited(currentTrace) -
                tracedProfitDebited(preRevisionTrace),
        ).toBeCloseTo(-347.5, 6);
    });

    it('matches every session before day 30 exactly', () => {
        expect(currentTrace.slice(0, firstTierSession)).toStrictEqual(
            preRevisionTrace.slice(0, firstTierSession),
        );
    });

    it('re-merges after day 30 up to the sub-cent residue that whole-cent payouts leave: the same limits, P&L within a tenth of a cent, and one cent paid a day apart (days 33 and 34) that nets to zero', () => {
        const after = currentTrace.slice(firstTierSession + 1);
        const preRevisionAfter = preRevisionTrace.slice(firstTierSession + 1);
        const debitGaps = after.map(
            (day, index) =>
                day.debited - (preRevisionAfter[index]?.debited ?? 0),
        );
        const centMovedOnDays = debitGaps.flatMap((gap, index) =>
            Math.abs(gap) > 0 ? [firstTierSession + 2 + index] : [],
        );

        expect(after.map((day) => day.limit)).toStrictEqual(
            preRevisionAfter.map((day) => day.limit),
        );
        expect(after.every((day) => day.limit === 2000)).toBe(true);
        for (const [index, day] of after.entries()) {
            expect(
                Math.abs(day.pnl - (preRevisionAfter[index]?.pnl ?? 0)),
            ).toBeLessThan(0.001);
        }
        expect(centMovedOnDays).toStrictEqual([33, 34]);
        expect(debitGaps.every((gap) => Math.abs(gap) < 0.011)).toBe(true);
        expect(debitGaps.reduce((sum, gap) => sum + gap, 0)).toBeCloseTo(0, 9);
    });
});
