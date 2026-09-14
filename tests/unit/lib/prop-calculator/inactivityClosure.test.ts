import { describe, expect, it } from 'vitest';

import {
    AlphaFuturesVariant,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    MffuVariant,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { mulberry32, type Rng } from '~/lib/prop-calculator/rng';
import { simulate } from '~/lib/prop-calculator/simulator';
import { runDay } from '~/lib/prop-calculator/simulator/day';
import {
    LossStreak,
    newPhaseStats,
    TradeTotals,
} from '~/lib/prop-calculator/simulator/PhaseStats';
import { type DayRunOptions } from '~/lib/prop-calculator/simulator/types';

interface CountedRng {
    draws: () => number;
    rng: Rng;
}

function alphaFuturesStandard() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.AlphaFutures);
    if (!firm) throw new Error('AlphaFutures firm not registered');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Standard,
    });
    if (!plan) throw new Error('AlphaFutures Standard 50K plan not found');
    return plan;
}

function constantRng(value: number): Rng {
    return () => value;
}

function countingWrapper(inner: Rng): CountedRng {
    let count = 0;
    return {
        draws: () => count,
        rng: () => {
            count += 1;
            return inner();
        },
    };
}

function freshStats(startingBalance: number) {
    const totals = new TradeTotals();
    return {
        stats: newPhaseStats(startingBalance, totals, new LossStreak(totals)),
        totals,
    };
}

function mffuRapidEod() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.Mffu);
    if (!firm) throw new Error('MFFU firm not registered');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('runDay: opt-in idle-day closure', () => {
    it('engages the idle branch, closes for inactivity, and draws exactly one rng() for that day', () => {
        const plan = mffuRapidEod().withOverrides({
            maxConsecutiveIdleDays: 1,
        });
        const state = plan.initialState();
        const { stats } = freshStats(state.startingBalance);
        const counted = countingWrapper(constantRng(0));

        const result = runDay({
            commission: dollars(0),
            dayPolicy: {
                ladder: [500],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            },
            idleDayProbability: 1,
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rng: counted.rng,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.4),
        });

        expect(result.busted).toBe(true);
        expect(result.closedForInactivity).toBe(true);
        expect(result.traded).toBe(false);
        expect(counted.draws()).toBe(1);
    });

    it(
        'is a true no-op for a plan without the rule, even with idleDayProbability set — ' +
            'identical draw count and identical result with or without it',
        () => {
            const plan = alphaFuturesStandard();
            expect(plan.maxConsecutiveIdleDays).toBeNull();

            function runOnce(idleDayProbability: number | undefined) {
                const state = plan.initialState();
                const { stats } = freshStats(state.startingBalance);
                const counted = countingWrapper(mulberry32(7));
                const result = runDay({
                    commission: dollars(0),
                    dayPolicy: {
                        ladder: [2000, 2000, 2000, 2000],
                        maxLossesPerDay: null,
                        stopRule: { kind: DayStopRuleKind.None },
                    },
                    idleDayProbability,
                    phase: TradingPhase.Eval,
                    plan,
                    positionSizing: null,
                    rng: counted.rng,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    state,
                    stats,
                    winrate: fraction(0.4),
                });
                return { draws: counted.draws(), result, state };
            }

            const withIdleSet = runOnce(1);
            const withoutIdleSet = runOnce(undefined);

            expect(withIdleSet.draws).toBe(withoutIdleSet.draws);
            expect(withIdleSet.result).toStrictEqual(withoutIdleSet.result);
            expect(withIdleSet.state).toStrictEqual(withoutIdleSet.state);
        },
    );

    it('closes on exactly the 7th consecutive idle day for the real MFFU Rapid EOD threshold, not the 6th', () => {
        const plan = mffuRapidEod();
        expect(plan.maxConsecutiveIdleDays).toBe(7);
        const state = plan.initialState();
        const { stats } = freshStats(state.startingBalance);
        const dayOptions: DayRunOptions = {
            commission: dollars(0),
            dayPolicy: {
                ladder: [500],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            },
            idleDayProbability: 1,
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rng: constantRng(0),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.4),
        };

        for (let day = 1; day <= 6; day++) {
            const result = runDay(dayOptions);
            expect(result.busted).toBe(false);
            expect(state.consecutiveIdleDays).toBe(day);
        }
        const seventh = runDay(dayOptions);
        expect(seventh.busted).toBe(true);
        expect(seventh.closedForInactivity).toBe(true);
    });

    it('a traded day resets the streak — needs a fresh 7-in-a-row after any trade, not a cumulative count', () => {
        const plan = mffuRapidEod();
        const state = plan.initialState();
        const { stats } = freshStats(state.startingBalance);
        const idleDayOptions: DayRunOptions = {
            commission: dollars(0),
            dayPolicy: {
                ladder: [500],
                maxLossesPerDay: null,
                stopRule: { kind: DayStopRuleKind.None },
            },
            idleDayProbability: 1,
            phase: TradingPhase.Eval,
            plan,
            positionSizing: null,
            rng: constantRng(0),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(0.4),
        };
        const tradedDayOptions = { ...idleDayOptions, idleDayProbability: 0 };

        for (let day = 0; day < 6; day++) runDay(idleDayOptions);
        expect(state.consecutiveIdleDays).toBe(6);

        const tradedDay = runDay(tradedDayOptions);
        expect(tradedDay.traded).toBe(true);
        expect(state.consecutiveIdleDays).toBe(0);

        for (let day = 0; day < 6; day++) {
            const result = runDay(idleDayOptions);
            expect(result.busted).toBe(false);
        }
        expect(state.consecutiveIdleDays).toBe(6);
    });

    it(
        'a cushion-exhausted RungSizing.SkipIfUnaffordable day also counts toward the streak, ' +
            'even with idleDayProbability at 0 — a day with zero trades counts regardless of why',
        () => {
            const plan = mffuRapidEod().withOverrides({
                maxConsecutiveIdleDays: 2,
            });
            const state = plan.initialState();
            state.balance = state.threshold + 10;
            const { stats } = freshStats(state.startingBalance);
            const dayOptions: DayRunOptions = {
                commission: dollars(0),
                dayPolicy: {
                    ladder: [500],
                    maxLossesPerDay: null,
                    stopRule: { kind: DayStopRuleKind.None },
                },
                idleDayProbability: 0,
                phase: TradingPhase.Eval,
                plan,
                positionSizing: null,
                rng: constantRng(0),
                rrRatio: 2,
                rungSizing: RungSizing.SkipIfUnaffordable,
                state,
                stats,
                winrate: fraction(0.4),
            };

            const first = runDay(dayOptions);
            expect(first.traded).toBe(false);
            expect(first.busted).toBe(false);

            const second = runDay(dayOptions);
            expect(second.traded).toBe(false);
            expect(second.busted).toBe(true);
            expect(second.closedForInactivity).toBe(true);
        },
    );

    it('rejects maxConsecutiveIdleDays: 0 at construction, since it would falsely close an account on a day it actually traded', () => {
        expect(() =>
            mffuRapidEod().withOverrides({ maxConsecutiveIdleDays: 0 }),
        ).toThrow(/maxConsecutiveIdleDays/);
    });

    it('rejects NaN and fractional maxConsecutiveIdleDays values too, matching the error message\'s own "positive integer" promise', () => {
        expect(() =>
            mffuRapidEod().withOverrides({
                maxConsecutiveIdleDays: NaN,
            }),
        ).toThrow(/maxConsecutiveIdleDays/);
        expect(() =>
            mffuRapidEod().withOverrides({ maxConsecutiveIdleDays: 2.5 }),
        ).toThrow(/maxConsecutiveIdleDays/);
    });

    it('accepts a positive maxConsecutiveIdleDays and still leaves omitted (null) untouched', () => {
        expect(
            mffuRapidEod().withOverrides({ maxConsecutiveIdleDays: 1 })
                .maxConsecutiveIdleDays,
        ).toBe(1);
        expect(
            mffuRapidEod().withOverrides({ maxConsecutiveIdleDays: undefined })
                .maxConsecutiveIdleDays,
        ).toBeNull();
    });
});

describe('simulate(): inactivity closure is visible as its own SimOutputs stat', () => {
    it(
        'MFFU Rapid EOD reports a nonzero inactivityClosureProbability when ' +
            'idleDayProbability is set (threshold overridden to 2 days, not the ' +
            'real 7, so the closure reliably occurs within the trial count instead ' +
            'of depending on a rare multi-day-streak event)',
        () => {
            const plan = mffuRapidEod().withOverrides({
                maxConsecutiveIdleDays: 2,
            });
            const out = simulate({
                fundedHorizonDays: 252,
                idleDayProbability: 0.3,
                maxEvalDays: 150,
                plan,
                riskPerTrade: 250,
                rrRatio: 2,
                seed: 42,
                tradesPerDay: 4,
                trials: 500,
                winrate: 0.4,
            });

            expect(out.inactivityClosureProbability).toBeGreaterThan(0);
        },
    );

    it('the four existing outcome probabilities still sum to 1 with the feature engaged', () => {
        const plan = mffuRapidEod();
        const out = simulate({
            fundedHorizonDays: 252,
            idleDayProbability: 0.2,
            maxEvalDays: 150,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 500,
            winrate: 0.4,
        });

        expect(
            out.bustProbability +
                out.timeoutProbability +
                out.passProbability +
                out.fundedBustProbability,
        ).toBeCloseTo(1, 9);
    });

    it('reports zero inactivityClosureProbability for every plan when idleDayProbability is omitted', () => {
        const plan = mffuRapidEod();
        const out = simulate({
            fundedHorizonDays: 60,
            maxEvalDays: 150,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 200,
            winrate: 0.4,
        });

        expect(out.inactivityClosureProbability).toBe(0);
    });
});
