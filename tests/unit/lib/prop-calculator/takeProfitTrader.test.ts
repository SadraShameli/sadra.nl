import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    DrawdownKind,
    FirmId,
    fraction,
    PolicySizing,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { TakeProfitTrader } from '~/lib/prop-calculator/firms/tpt/TakeProfitTrader';
import { simulate } from '~/lib/prop-calculator/simulator';
import { runDay } from '~/lib/prop-calculator/simulator/day';
import {
    LossStreak,
    newPhaseStats,
    TradeTotals,
} from '~/lib/prop-calculator/simulator/PhaseStats';

import { dayRunOptionsFor } from './dayRunOptions';

const plan = (() => {
    const found = new TakeProfitTrader().findPlan({
        accountSize: 50_000,
        firm: FirmId.Tpt,
    });
    if (!found) throw new Error('TPT 50K plan not found');
    return found;
})();

function freshStats(startingBalance: number) {
    const totals = new TradeTotals();
    return newPhaseStats(startingBalance, totals, new LossStreak(totals));
}

function idleDayOptions(idleDayProbability: number) {
    return {
        commission: dollars(0),
        dayPolicy: {
            ladder: [2000],
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: { kind: DayStopRuleKind.None },
        },
        idleDayProbability,
        positionSizing: null,
        rng: () => 0,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        winrate: fraction(0.4),
    } as const;
}

function stateAt(bestDayProfit: number, profit: number) {
    const state = plan.initialState();
    state.balance = state.startingBalance + profit;
    state.bestDayProfit = bestDayProfit;
    state.tradingDays = plan.minTradingDays;
    return state;
}

describe('Take Profit Trader 50K', () => {
    it('passes on three trading days, not five', () => {
        expect(plan.minTradingDays).toBe(3);
    });

    it('trails end-of-day in the evaluation and intraday once funded', () => {
        expect(plan.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.fundedDrawdown.kind).toBe(DrawdownKind.IntradayTrailing);
    });

    it('runs no daily loss limit in either phase', () => {
        const state = plan.initialState();
        state.todayPnL = -49_000;
        expect(plan.isDayLockedOut(state, TradingPhase.Eval)).toBe(false);
        expect(plan.isDayLockedOut(state, TradingPhase.Funded)).toBe(false);
    });

    it('applies the 50% consistency bar to the evaluation only', () => {
        expect(plan.evalConsistencyRule()?.maxBestDayShare).toBe(0.5);
        expect(plan.fundedConsistencyRule()).toBeNull();
    });

    describe('consistency violation passes only above 2x the best day, not 2x the profit target (Rule 5, N-79)', () => {
        it('does not pass at 2x the profit target ($6,000) when a $3,500 best day still leaves that at or below 2x the best day ($7,000)', () => {
            expect(plan.isPassed(stateAt(3500, 6000))).toBe(false);
        });

        it('does not pass at exactly 2x the best day: Rule 5 requires more than twice the best day, not at least', () => {
            expect(plan.isPassed(stateAt(3500, 7000))).toBe(false);
            expect(plan.isPassed(stateAt(2000, 4000))).toBe(false);
        });

        it('passes once net P/L exceeds 2x the best day', () => {
            expect(plan.isPassed(stateAt(3500, 7000.01))).toBe(true);
            expect(plan.isPassed(stateAt(2000, 4000.01))).toBe(true);
        });

        it('still passes normally when the best day is under half of net profit', () => {
            expect(plan.isPassed(stateAt(1000, 3000))).toBe(true);
        });
    });

    it('has no qualifying-day requirement and no payout cap', () => {
        expect(plan.minDaysAfterPassForPayout).toBe(0);
        expect(plan.minQualifyingDayProfit).toBeNull();
        expect(plan.payoutRequestCap).toBeNull();
        expect(plan.payoutBuffer).toBeNull();
    });

    it('pays 80% with no qualifying-day requirement and no payout cap', () => {
        expect(plan.payoutFromProfit(1000, 0)).toBe(800);
    });

    it('charges the subscription only while the evaluation runs', () => {
        expect(plan.fees.monthlySubscription).toBe(170);
        expect(plan.totalCostThroughDay(42)).toBeGreaterThan(
            plan.totalCostThroughDay(21),
        );

        const base = {
            maxEvalDays: 150,
            plan,
            riskPerTrade: 400,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 2,
            trials: 100,
            winrate: 0.55,
        } as const;
        const costAt400 = simulate({
            ...base,
            fundedHorizonDays: 400,
        }).expectedTotalCost;
        const costAt40 = simulate({
            ...base,
            fundedHorizonDays: 40,
        }).expectedTotalCost;
        expect(Math.abs(costAt400 - costAt40)).toBeLessThan(10);
    });
});

describe('TPT PRO funded inactivity closure follows the calendar-week rule, not a rolling idle counter (N-80)', () => {
    it('sets no rolling maxConsecutiveIdleDays for the funded phase, since the firm rule is a calendar week', () => {
        expect(plan.maxConsecutiveIdleDaysFor(TradingPhase.Funded)).toBeNull();
        expect(plan.maxConsecutiveIdleDaysFor(TradingPhase.Eval)).toBeNull();
    });

    it('declares a 5-session calendar-week inactivity rule for the funded phase only', () => {
        expect(
            plan.calendarWeekInactivityFor(TradingPhase.Funded)
                ?.sessionsPerWeek,
        ).toBe(5);
        expect(plan.calendarWeekInactivityFor(TradingPhase.Eval)).toBeNull();
    });

    it('closes the funded account at the end of a calendar week with zero traded sessions, on the 5th idle session, not the 7th', () => {
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const stats = freshStats(state.startingBalance);
        const options = idleDayOptions(1);

        let result;
        for (let session = 1; session <= 5; session++) {
            result = runDay(
                dayRunOptionsFor(TradingPhase.Funded, {
                    ...options,
                    plan,
                    state,
                    stats,
                }),
            );
            if (session < 5) expect(result.busted).toBe(false);
        }

        expect(result?.busted).toBe(true);
        expect(result?.closedForInactivity).toBe(true);
    });

    it('never closes a rolling 7-session idle gap that spans two calendar weeks, as long as each week has one traded session', () => {
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const stats = freshStats(state.startingBalance);
        const tradedSessions = new Set([1, 9]);

        for (let session = 1; session <= 10; session++) {
            const isTraded = tradedSessions.has(session);
            const result = runDay(
                dayRunOptionsFor(TradingPhase.Funded, {
                    ...idleDayOptions(isTraded ? 0 : 1),
                    plan,
                    state,
                    stats,
                }),
            );
            expect(result.busted).toBe(false);
        }

        expect(state.consecutiveIdleDays).toBe(1);
    });

    it('rejects setting both calendarWeekInactivity and maxConsecutiveIdleDays on the same plan', () => {
        expect(() => plan.withOverrides({ maxConsecutiveIdleDays: 7 })).toThrow(
            /calendarWeekInactivity and maxConsecutiveIdleDays/,
        );
    });

    it('rejects a non-positive-integer sessionsPerWeek', () => {
        expect(() =>
            plan.withOverrides({
                calendarWeekInactivity: { sessionsPerWeek: 0 },
                maxConsecutiveIdleDays: undefined,
            }),
        ).toThrow(/calendarWeekInactivity\.sessionsPerWeek/);
    });
});

function proPlusSentences(): string[] {
    const note = new TakeProfitTrader().notes.find((candidate) =>
        candidate.startsWith('PRO+ (the live-capital account'),
    );
    if (note === undefined) throw new Error('no PRO+ note');
    return note.split(/(?<=\.)\s+/);
}

function sentenceWith(fragment: string): string {
    const sentence = proPlusSentences().find((candidate) =>
        candidate.includes(fragment),
    );
    if (sentence === undefined) {
        throw new Error(`no PRO+ sentence names ${fragment}`);
    }
    return sentence;
}

describe("TPT notes cite the firm's own Zendesk articles, not the propfirmmatch extraction or a 403 caveat (N-85)", () => {
    const firm = new TakeProfitTrader();

    it('never cites the propfirmmatch.com extraction', () => {
        expect(firm.notes.some((note) => note.includes('propfirmmatch'))).toBe(
            false,
        );
    });

    it('cites Zendesk 15171769361053 for the calendar-week trading note', () => {
        const note = firm.notes.find((candidate) =>
            candidate.includes('traded day per calendar week'),
        );
        expect(note).toContain('15171769361053');
    });

    it('cites Zendesk 15169066911133 for the contract-limit note', () => {
        const note = firm.notes.find((candidate) =>
            candidate.includes(
                '6 minis / 60 micros, flat across eval and funded',
            ),
        );
        expect(note).toContain('15169066911133');
    });

    it('cites the PRO+ Zendesk articles instead of a 403/search-engine caveat', () => {
        const note = firm.notes.find((candidate) =>
            candidate.startsWith('PRO+ (the live-capital account'),
        );
        expect(note).toContain('15172006753821');
        expect(note).toContain('15171978600349');
        expect(note).not.toContain('403');
        expect(note).not.toContain('search engine');
        expect(note).not.toContain('search-engine');
    });

    describe('the PRO+ note pins each claim to the article that states it (N-85)', () => {
        const ADVANTAGES = '15171929948829';
        const RULES = '15172006753821';
        const UPGRADE = '15171978600349';

        it('attributes the 90/10 split only to Advantages of PRO+, which states it', () => {
            const sentence = sentenceWith('90/10');

            expect(sentence).toContain(ADVANTAGES);
            expect(sentence).not.toContain(RULES);
            expect(sentence).not.toContain(UPGRADE);
        });

        it("attributes 'no buffer zone requirement for withdrawal' only to Advantages of PRO+", () => {
            const sentence = sentenceWith('buffer zone requirement');

            expect(sentence).toContain(ADVANTAGES);
            expect(sentence).not.toContain(RULES);
            expect(sentence).not.toContain(UPGRADE);
        });

        it('scopes the only-claims to the three articles fetched, since other help center articles state 90/10 and no buffer', () => {
            for (const fragment of ['90/10', 'buffer zone requirement']) {
                const sentence = sentenceWith(fragment);

                expect(sentence).toContain('three articles');
                expect(sentence).not.toMatch(/stated only by/);
            }
        });

        it('names the PRO+ Development cooldown article as a second source that states 90/10', () => {
            const sentence = sentenceWith('90/10');

            expect(sentence).toContain('39331980656925');
            expect(sentence).toContain('Live payouts split 90/10');
        });

        it('attributes the starting drawdown and the $0 trail floor to the Upgrade Process article only', () => {
            const sentence = sentenceWith(
                'equivalent to the starting drawdown',
            );

            expect(sentence).toContain(UPGRADE);
            expect(sentence).not.toContain(ADVANTAGES);
            expect(sentence).not.toContain(RULES);
        });

        it('attributes the weekly trading requirement to the PRO+ Account Rules article only', () => {
            const sentence = sentenceWith('per calendar week');

            expect(sentence).toContain(RULES);
            expect(sentence).not.toContain(UPGRADE);
            expect(sentence).not.toContain(ADVANTAGES);
        });

        it('records the frozen $5,000 profit the Upgrade Process article states and the engine does not model', () => {
            const sentence = sentenceWith('$5,000');

            expect(sentence).toContain(UPGRADE);
            expect(sentence).toContain('frozen');
            expect(sentence).toContain('not model');
        });

        it('no longer says the Rules or Upgrade articles confirm the split or the missing buffer', () => {
            const joined = proPlusSentences().join(' ');

            expect(joined).not.toContain('confirmed by the same source');
            expect(joined).not.toContain('Confirmed directly against');
        });
    });
});
