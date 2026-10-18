import { describe, expect, it } from 'vitest';

import {
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    points,
} from '~/lib/prop-calculator/core';
import { buildLucidLivePlan } from '~/lib/prop-calculator/firms';
import { type Rng } from '~/lib/prop-calculator/rng';
import { runLiveDay } from '~/lib/prop-calculator/simulator';

describe('buildLucidLivePlan contract limits', () => {
    it.each([
        { balance: 0, micros: 20, minis: 2 },
        { balance: 2000, micros: 30, minis: 3 },
        { balance: 4000, micros: 40, minis: 4 },
    ])(
        'allows $minis minis / $micros micros at a $balance balance (50K CME row of New Live Scaling Plan)',
        ({ balance, micros, minis }) => {
            const plan = buildLucidLivePlan();
            const state = { ...plan.initialState(), balance };

            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
            ).toBe(minis);
            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
            ).toBe(micros);
        },
    );

    it.each([
        { balance: 2100, micros: 20, minis: 2, todayPnL: 200 },
        { balance: 4100, micros: 30, minis: 3, todayPnL: 200 },
        { balance: 1980, micros: 30, minis: 3, todayPnL: -120 },
        { balance: 3940, micros: 40, minis: 4, todayPnL: -160 },
    ])(
        'reads the tier from the session open, not the intraday balance: $minis minis / $micros micros at a $balance balance after a $todayPnL day so far',
        ({ balance, micros, minis, todayPnL }) => {
            const plan = buildLucidLivePlan();
            const state = { ...plan.initialState(), balance, todayPnL };

            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
            ).toBe(minis);
            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
            ).toBe(micros);
        },
    );
});

const alwaysWins: Rng = () => 0;
const alwaysLoses: Rng = () => 0.999;

interface TierTimingCase {
    readonly dayOneClose: number;
    readonly dayTwoClose: number;
    readonly isWinning: boolean;
    readonly openBalance: number;
    readonly stopPoints: number;
}

const CROSS_UP_CASES: readonly TierTimingCase[] = [
    {
        dayOneClose: 2300,
        dayTwoClose: 2600,
        isWinning: true,
        openBalance: 1900,
        stopPoints: 1,
    },
    {
        dayOneClose: 4500,
        dayTwoClose: 4900,
        isWinning: true,
        openBalance: 3900,
        stopPoints: 1,
    },
];

const FALL_BACK_CASES: readonly TierTimingCase[] = [
    {
        dayOneClose: 1860,
        dayTwoClose: 1780,
        isWinning: false,
        openBalance: 2100,
        stopPoints: 2,
    },
    {
        dayOneClose: 3780,
        dayTwoClose: 3660,
        isWinning: false,
        openBalance: 4100,
        stopPoints: 2,
    },
];

function openState(openBalance: number): LiveAccountState {
    const plan = buildLucidLivePlan();
    const drawdown = plan.liveDrawdown;
    const lock = drawdown?.lock;
    const lockAtProfit = lock?.atProfit ?? null;
    if (drawdown === null || lock === undefined || lockAtProfit === null) {
        throw new Error('Lucid Live needs a drawdown that locks at a profit');
    }
    const initial = plan.initialState();
    const openProfit = openBalance - initial.startingBalance;
    const isLocked = openProfit >= lockAtProfit;
    return {
        ...initial,
        balance: openBalance,
        peakDayCloseProfit: openProfit,
        threshold: isLocked
            ? lock.lockedThreshold(initial.startingBalance)
            : openBalance - drawdown.amount,
        thresholdLocked: isLocked,
    };
}

function runTierTimingDay(
    state: LiveAccountState,
    symbol: InstrumentSymbol,
    timing: TierTimingCase,
    tradesPerDay: number,
): void {
    runLiveDay({
        commission: dollars(0),
        plan: buildLucidLivePlan(),
        positionSizing: {
            instrument: INSTRUMENTS[symbol],
            stopPoints: points(timing.stopPoints),
        },
        rng: timing.isWinning ? alwaysWins : alwaysLoses,
        rrRatio: 5,
        state,
        tradesPerDay,
        winrate: fraction(timing.isWinning ? 1 : 0),
    });
}

describe('Lucid Live contract tiers move at the end of the trading day (N-68, article 15245873)', () => {
    describe.each([
        { symbol: InstrumentSymbol.NQ, unit: 'minis' },
        { symbol: InstrumentSymbol.MNQ, unit: 'micros' },
    ])('$unit', ({ symbol }) => {
        it.each(CROSS_UP_CASES)(
            'a mid-day cross above the tier from a $openBalance open keeps the lower cap for the rest of the day ($dayOneClose close) and raises it only next session ($dayTwoClose)',
            (timing) => {
                const state = openState(timing.openBalance);

                runTierTimingDay(state, symbol, timing, 2);
                expect(state.balance).toBeCloseTo(timing.dayOneClose, 8);

                runTierTimingDay(state, symbol, timing, 1);
                expect(state.balance).toBeCloseTo(timing.dayTwoClose, 8);
            },
        );

        it.each(FALL_BACK_CASES)(
            'a mid-day fall below the tier from a $openBalance open keeps the higher cap for the rest of the day ($dayOneClose close) and lowers it only next session ($dayTwoClose)',
            (timing) => {
                const state = openState(timing.openBalance);

                runTierTimingDay(state, symbol, timing, 2);
                expect(state.balance).toBeCloseTo(timing.dayOneClose, 8);

                runTierTimingDay(state, symbol, timing, 1);
                expect(state.balance).toBeCloseTo(timing.dayTwoClose, 8);
            },
        );
    });
});
