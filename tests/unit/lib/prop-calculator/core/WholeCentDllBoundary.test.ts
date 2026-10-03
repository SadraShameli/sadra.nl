import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as core from '~/lib/prop-calculator/core';
import {
    capRiskToRemainingDailyLoss,
    CENT_ROUNDING_TOLERANCE_IN_CENTS,
    CENTS_PER_DOLLAR,
    createInitialLiveAccountState,
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    FtmoFuturesVariant,
    isAtOrBelowWithinCentTolerance,
    type LiveAccountState,
    LivePlan,
    ONE_CENT,
    type Plan,
    PolicySizing,
    resolveAffordableRisk,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { FtmoFutures } from '~/lib/prop-calculator/firms';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import {
    LossStreak,
    newPhaseStats,
    type PhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { posixPath } from '../../../posixPath';
import { scriptedRng } from '../scriptedRng';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const SCANNED_ROOTS = ['src', 'tests'];
const RETIRED_CENT_NAMES = [
    /\bisAtOrBelowCents\b/,
    /\bCENT_ROUNDING_TOLERANCE\b/,
];
const THIS_FILE =
    'tests/unit/lib/prop-calculator/core/WholeCentDllBoundary.test.ts';

const FTMO_PRO_DLL = 1000;
const WIN_DRAW = 0;
const LOSS_DRAW = 0.99;

function driftedLimitState(plan: Plan) {
    return { ...plan.initialState(), todayPnL: -FTMO_PRO_DLL + 1e-12 };
}

function ftmoPro(): Plan {
    const plan = new FtmoFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.FtmoFutures,
        variant: FtmoFuturesVariant.Pro,
    });
    if (!plan) throw new Error('FTMO Futures Pro 50K plan not found');
    return plan;
}

function liveDllPlan(): LivePlan {
    return new LivePlan({
        cushionPercent: { postLock: fraction(0.1), preLock: fraction(0.05) },
        label: 'Whole-cent DLL Live',
        liveDailyLossLimit: {
            amount: dollars(500),
            kind: DailyLossLimitKind.Flat,
        },
        liveDrawdown: null,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
    });
}

function liveStateAt(todayPnL: number): LiveAccountState {
    return { ...createInitialLiveAccountState(0, -3000), todayPnL };
}

function phaseStats(startingBalance: number): PhaseStats {
    const totals = new TradeTotals();
    return newPhaseStats(startingBalance, totals, new LossStreak(totals));
}

function runScriptedDay(options: {
    commission: number;
    draws: readonly number[];
    ladder: readonly number[];
    plan: Plan;
    subCentCushion?: number;
}) {
    const initial = options.plan.initialState();
    const state =
        options.subCentCushion === undefined
            ? initial
            : {
                  ...initial,
                  balance: initial.threshold + options.subCentCushion,
              };
    const stats = phaseStats(state.startingBalance);
    const result = runDay({
        commission: dollars(options.commission),
        dayPolicy: {
            ladder: options.ladder,
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: { kind: DayStopRuleKind.None },
        },
        idleDayProbability: 0,
        phase: TradingPhase.Eval,
        plan: options.plan,
        positionSizing: null,
        rng: scriptedRng(options.draws),
        rrRatio: 2.5,
        rungSizing: RungSizing.CapToCushion,
        state,
        stats,
        winrate: fraction(0.5),
    });
    return { result, state, stats };
}

describe('isAtOrBelowWithinCentTolerance compares money with a float-drift tolerance of a millionth of a cent, not by whole-cent rounding (N-69)', () => {
    it('exports the cent constants it is built on through the core barrel, the tolerance with its unit in the name', () => {
        expect(CENTS_PER_DOLLAR).toBe(100);
        expect(CENT_ROUNDING_TOLERANCE_IN_CENTS).toBe(1e-6);
    });

    it('treats a float-drifted -999.9999999999999 as at the -1,000 limit', () => {
        expect(isAtOrBelowWithinCentTolerance(-999.9999999999999, -1000)).toBe(
            true,
        );
        expect(isAtOrBelowWithinCentTolerance(-1000 + 1e-12, -1000)).toBe(true);
    });

    it('keeps one cent short of the bound above it, and anything below it at or below', () => {
        expect(isAtOrBelowWithinCentTolerance(-999.99, -1000)).toBe(false);
        expect(isAtOrBelowWithinCentTolerance(-1000, -1000)).toBe(true);
        expect(isAtOrBelowWithinCentTolerance(-1000.01, -1000)).toBe(true);
    });

    it('does not round to whole cents: a thousandth of a cent short of the bound, or four tenths of a cent, stays above it', () => {
        expect(isAtOrBelowWithinCentTolerance(-999.99999, -1000)).toBe(false);
        expect(isAtOrBelowWithinCentTolerance(-999.996, -1000)).toBe(false);
    });

    it('reads a whole cent stored a hair low as a whole cent', () => {
        expect(isAtOrBelowWithinCentTolerance(ONE_CENT, 500 - 499.99)).toBe(
            true,
        );
        expect(isAtOrBelowWithinCentTolerance(ONE_CENT, ONE_CENT / 2)).toBe(
            false,
        );
    });
});

describe('the daily loss limit locks out at the limit despite float drift (N-69)', () => {
    const pro = ftmoPro();

    it('locks the day out and terminates FTMO Pro when a capped loser leaves todayPnL at -limit + 1e-12', () => {
        for (const phase of [TradingPhase.Eval, TradingPhase.Funded]) {
            expect(pro.isDayLockedOut(driftedLimitState(pro), phase)).toBe(
                true,
            );
            expect(pro.isBust(driftedLimitState(pro), phase)).toBe(true);
        }
    });

    it('still leaves a day one cent short of the limit open', () => {
        const oneCentShort = {
            ...pro.initialState(),
            todayPnL: -FTMO_PRO_DLL + ONE_CENT,
        };
        expect(pro.isDayLockedOut(oneCentShort, TradingPhase.Eval)).toBe(false);
        expect(pro.isBust(oneCentShort, TradingPhase.Eval)).toBe(false);
    });

    it('locks a live day out at -limit + 1e-12 and not one cent short of it', () => {
        const plan = liveDllPlan();
        expect(plan.isDayLockedOut(liveStateAt(-500 + 1e-12))).toBe(true);
        expect(plan.isDayLockedOut(liveStateAt(-500 + ONE_CENT))).toBe(false);
    });

    it('terminates FTMO Pro on the santa case: $5 commission, rr 2.5, ladder [293.69, 700, 1500], W/L/L', () => {
        const { result, state, stats } = runScriptedDay({
            commission: 5,
            draws: [WIN_DRAW, LOSS_DRAW, LOSS_DRAW],
            ladder: [293.69, 700, 1500],
            plan: pro,
        });
        expect(stats.tradesTaken).toBe(3);
        expect(state.todayPnL).toBeCloseTo(-FTMO_PRO_DLL, 9);
        expect(result.busted).toBe(true);
    });

    it('ends a soft-limit day after the capped loser instead of taking a sub-cent extra trade', () => {
        const soft = pro.withOverrides({
            evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Lockout,
        });
        const { result, state, stats } = runScriptedDay({
            commission: 0,
            draws: [WIN_DRAW, LOSS_DRAW, WIN_DRAW],
            ladder: [293.69, 2500, 500],
            plan: soft,
        });
        expect(state.todayPnL).toBeCloseTo(-FTMO_PRO_DLL, 9);
        expect(stats.tradesTaken).toBe(2);
        expect(result.busted).toBe(false);
    });
});

describe('funded and live sizing agree at the sub-cent edge (N-69)', () => {
    it.each([
        [500, -499.995, 0],
        [500, -469.995, 30],
        [1000, -1000 + 1e-12, 0],
        [500, -499.992, 0],
    ] as const)(
        'risks nothing with limit %d, todayPnL %d and commission %d, where under one cent of room is left',
        (limit, todayPnL, commission) => {
            expect(
                resolveAffordableRisk(Infinity, limit, todayPnL, commission),
            ).toBe(0);
            expect(
                capRiskToRemainingDailyLoss(900, limit, todayPnL, commission),
            ).toBe(0);
        },
    );

    it.each([
        [500, -499.99, 0],
        [1000, -994.99, 5],
    ] as const)(
        'keeps a whole cent of room stored a hair low: limit %d, todayPnL %d, commission %d',
        (limit, todayPnL, commission) => {
            const funded = resolveAffordableRisk(
                Infinity,
                limit,
                todayPnL,
                commission,
            );
            expect(funded).toBeCloseTo(ONE_CENT, 10);
            expect(
                capRiskToRemainingDailyLoss(
                    Infinity,
                    limit,
                    todayPnL,
                    commission,
                ),
            ).toBe(funded);
        },
    );

    it('agrees on every room from two cents below zero to two cents above one cent, in tenths of a cent', () => {
        for (let tenths = -20; tenths <= 30; tenths++) {
            const todayPnL = -500 + tenths / 1000;
            const funded = resolveAffordableRisk(Infinity, 500, todayPnL, 0);
            expect(
                capRiskToRemainingDailyLoss(Infinity, 500, todayPnL, 0),
            ).toBe(Math.max(0, funded));
        }
    });

    it('keeps the cushion cap: a cushion below the room still wins', () => {
        expect(resolveAffordableRisk(300, 1000, -300, 5)).toBe(300);
    });
});

describe('a sub-cent drawdown cushion stays tradable, unlike sub-cent daily loss room', () => {
    it.each([
        [0.004, null, 0, 0],
        [0.004, 1000, 0, 5],
        [0.009, 500, -100, 0],
    ] as const)(
        'risks the whole cushion of %d with daily loss limit %s, todayPnL %d and commission %d',
        (cushion, limit, todayPnL, commission) => {
            expect(
                resolveAffordableRisk(cushion, limit, todayPnL, commission),
            ).toBe(cushion);
        },
    );

    it('lets an account a fraction of a cent above its drawdown threshold trade and bust, where zero risk would keep it open forever without a trade', () => {
        const { result, state, stats } = runScriptedDay({
            commission: 0,
            draws: [LOSS_DRAW],
            ladder: [500],
            plan: ftmoPro(),
            subCentCushion: 0.004,
        });

        expect(stats.tradesTaken).toBe(1);
        expect(state.balance).toBe(state.threshold);
        expect(result.busted).toBe(true);
    });

    it('ends only the day when the daily loss room is under a cent, since the room comes back at the next session', () => {
        const pro = ftmoPro();
        const endOfDay = { ...pro.initialState(), todayPnL: -999.995 };

        expect(pro.affordableRisk(endOfDay, TradingPhase.Eval, 0)).toBe(0);
        expect(
            pro.affordableRisk(
                { ...endOfDay, todayPnL: 0 },
                TradingPhase.Eval,
                0,
            ),
        ).toBe(FTMO_PRO_DLL);
    });
});

describe('a cushion-capped loser lands on the drawdown threshold without float drift', () => {
    it('busts on isBreached for every sampled balance and threshold at zero commission', () => {
        const pro = ftmoPro();
        const rng = mulberry32(69);
        let cushionCappedSamples = 0;
        for (let sample = 0; sample < 5000; sample++) {
            const threshold = 47_000 + Math.round(rng() * 300_000) / 100;
            const balance =
                threshold + 0.01 + Math.round(rng() * 400_000) / 100;
            const state = { ...pro.initialState(), balance, threshold };
            const risk = pro.affordableRisk(state, TradingPhase.Eval, 0);
            const cushionCapped = Math.min(risk, balance - threshold);
            if (cushionCapped !== balance - threshold) continue;
            cushionCappedSamples += 1;
            const after = { ...state, balance: state.balance - cushionCapped };
            expect(pro.drawdown.isBreached(after)).toBe(true);
        }
        expect(cushionCappedSamples).toBeGreaterThanOrEqual(1000);
    });
});

function ftmoDllNote(): string {
    const note = new FtmoFutures().notes.find((text) =>
        text.includes('DailyLossLimitBreachEffect'),
    );
    if (note === undefined) {
        throw new Error(
            'no FTMO Futures note mentions DailyLossLimitBreachEffect',
        );
    }
    return note;
}

describe('the FTMO daily loss limit note states the float-drift tolerance of the limit compare (N-69)', () => {
    it('names the tolerance comparison instead of a bare todayPnL <= -limit or a whole-cent claim', () => {
        const note = ftmoDllNote();

        expect(note).toContain('closes exactly on the $1,000 limit');
        expect(note).toContain('isAtOrBelowWithinCentTolerance');
        expect(note).toContain('a millionth of a cent');
        expect(note).not.toContain('isAtOrBelowCents');
        expect(note).not.toContain('in whole cents');
        expect(note).not.toContain('uses todayPnL <= -limit');
    });

    it('says a trade is skipped when under one commission plus one cent of room is left', () => {
        const note = ftmoDllNote();

        expect(note).toContain('less than one commission plus one cent');
        expect(note).not.toContain('no more than one commission');
    });
});

function typeScriptFilesUnder(root: string): string[] {
    return readdirSync(path.join(REPO_ROOT, root), { recursive: true })
        .map(String)
        .filter((name) => /\.tsx?$/.test(name))
        .map((name) => posixPath(path.join(root, name)));
}

describe('the transitional cent-helper aliases are gone, one name each (N-69)', () => {
    it('exports neither isAtOrBelowCents nor CENT_ROUNDING_TOLERANCE through the core barrel', () => {
        const exported = Object.keys(core);

        expect(exported).toContain('isAtOrBelowWithinCentTolerance');
        expect(exported).toContain('CENT_ROUNDING_TOLERANCE_IN_CENTS');
        expect(exported).not.toContain('isAtOrBelowCents');
        expect(exported).not.toContain('CENT_ROUNDING_TOLERANCE');
    });

    it('leaves no source or test file using the retired names', () => {
        const users = SCANNED_ROOTS.flatMap(typeScriptFilesUnder)
            .filter((file) => file !== THIS_FILE)
            .filter((file) => {
                const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
                return RETIRED_CENT_NAMES.some((name) => name.test(text));
            });

        expect(users).toEqual([]);
    });
});
