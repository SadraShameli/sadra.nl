import { describe, expect, it } from 'vitest';

import {
    dollars,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    points,
} from '~/lib/prop-calculator/core';
import { buildAlphaFuturesLivePlan } from '~/lib/prop-calculator/firms/alphafutures/AlphaFuturesLive';
import { type Rng } from '~/lib/prop-calculator/rng';
import { runLiveHorizon } from '~/lib/prop-calculator/simulator';

const alwaysWins: Rng = () => 0;

const ONE_NQ_AT_100 = {
    instrument: INSTRUMENTS[InstrumentSymbol.NQ],
    stopPoints: points(5),
};

describe('buildAlphaFuturesLivePlan contract limits', () => {
    it.each([
        { balance: 0, isLocked: false, micros: 20, minis: 2 },
        { balance: 1999, isLocked: false, micros: 20, minis: 2 },
        { balance: 2500, isLocked: false, micros: 20, minis: 2 },
        { balance: 2000, isLocked: true, micros: 40, minis: 4 },
        { balance: 100, isLocked: true, micros: 40, minis: 4 },
    ])(
        'allows $minis minis / $micros micros at a $balance balance with the MLL locked: $isLocked (50K row of Path To Live Structure)',
        ({ balance, isLocked, micros, minis }) => {
            const plan = buildAlphaFuturesLivePlan();
            const state = {
                ...plan.initialState(),
                balance,
                thresholdLocked: isLocked,
            };

            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
            ).toBe(minis);
            expect(
                plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
            ).toBe(micros);
        },
    );
});

describe('buildAlphaFuturesLivePlan Maximum Loss Limit', () => {
    it("stops trailing at the $0 live starting balance once profit reaches the $2,000 drawdown ('Maximum Loss Limit stops trailing at the account starting balance on all of our accounts')", () => {
        const plan = buildAlphaFuturesLivePlan();
        const state = { ...plan.initialState(), balance: 2000 };

        plan.liveDrawdown?.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(0);
    });

    it('pays out at the default one-drawdown cushion once profit clears the drawdown, in whole $100 NQ contracts (one at 5% of the $2,000 cushion before the lock, two at 10% after it): locks on day 20, then $200 a day paying $160 from day 21, for $1,600 over 30 days', () => {
        const plan = buildAlphaFuturesLivePlan();
        const result = runLiveHorizon({
            commission: dollars(0),
            horizonDays: 30,
            payoutRequestSize: undefined,
            plan,
            positionSizing: ONE_NQ_AT_100,
            retainedCushion: plan.resolveRetainedCushion(undefined),
            rng: alwaysWins,
            rrRatio: 1,
            tradesPerDay: 1,
            winrate: fraction(1),
        });

        expect(result.busted).toBe(false);
        expect(result.daysToFirstWithdrawal).toBe(21);
        expect(result.totalWithdrawn).toBeCloseTo(1600, 6);
    });
});

describe('buildAlphaFuturesLivePlan contract tier after the MLL reaches $0', () => {
    it('keeps the 4-mini / 40-micro tier after a withdrawal once the MLL has locked at $0 ("Contracts (after MLL reaches $0 balance)")', () => {
        const plan = buildAlphaFuturesLivePlan();
        const state = { ...plan.initialState(), balance: 2500 };
        plan.liveDrawdown?.onDayClose(state);
        expect(state.thresholdLocked).toBe(true);

        state.balance = 500;

        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
        ).toBe(4);
        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
        ).toBe(40);
    });
});
