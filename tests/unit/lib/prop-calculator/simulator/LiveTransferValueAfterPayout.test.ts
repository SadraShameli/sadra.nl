import { describe, expect, it } from 'vitest';

import {
    dollars,
    FirmId,
    fraction,
    InstrumentSymbol,
    MffuVariant,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    resolveDayPolicy,
    SIM_DEFAULTS,
    type SimInputs,
} from '~/lib/prop-calculator/simulator';
import { liveTransferValueAfterPayout } from '~/lib/prop-calculator/simulator';
import { runLiveTransferContinuation } from '~/lib/prop-calculator/simulator/livePhase';
import {
    liveTransferOptionsFor,
    resolveLiveTransferSetup,
} from '~/lib/prop-calculator/simulator/LiveTransfer';
import { meanStandardError } from '~/lib/prop-calculator/stats';

const HAZARD = fraction(0.3);
const TRIALS = 25;

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

const PLAN = rapidEodPlan();

function fundedState() {
    const state = PLAN.initialState();
    PLAN.beginFundedPhase(state);
    return state;
}

function inputsOf(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 60,
        instrument: InstrumentSymbol.MNQ,
        liveTransferHazard: HAZARD,
        maxEvalDays: 40,
        plan: PLAN,
        riskPerTrade: 200,
        rrRatio: 2,
        seed: 11,
        stopPoints: 10,
        tradesPerDay: 2,
        trials: TRIALS,
        winrate: 0.55,
        ...overrides,
    };
}

function oracleOf(inputs: SimInputs, trials: number) {
    const setup = resolveLiveTransferSetup({
        commission: dollars(
            inputs.commissionPerRoundTrip ?? SIM_DEFAULTS.commissionPerRoundTrip,
        ),
        fundedRrRatio: inputs.fundedRrRatio ?? inputs.rrRatio,
        fundedTradesPerDay: resolveDayPolicy(inputs, TradingPhase.Funded)
            .ladder.length,
        idleDayProbability: inputs.idleDayProbability,
        instrument: inputs.instrument,
        liveTransferHazard: inputs.liveTransferHazard,
        minRetainedCushion: inputs.minRetainedCushion,
        payoutRequestSize: inputs.payoutRequestSize,
        plan: inputs.plan,
        seed: inputs.seed,
        stopPoints: inputs.stopPoints,
        verifiedCumulativePayoutTrigger: inputs.verifiedCumulativePayoutTrigger,
        winrate: fraction(inputs.winrate),
    });
    if (setup?.continuation == null) throw new Error('expected a continuation');
    let sum = 0;
    let squaredSum = 0;
    for (let trial = 0; trial < trials; trial += 1) {
        const options = liveTransferOptionsFor(setup, trial, 0);
        if (options === undefined) throw new Error('expected options');
        const { recurring } = runLiveTransferContinuation(
            setup.continuation,
            fundedState(),
            inputs.fundedHorizonDays,
            options.rng,
        );
        sum += recurring;
        squaredSum += recurring * recurring;
    }
    return {
        standardError: meanStandardError(sum, squaredSum, trials),
        value: sum / trials,
    };
}

describe('liveTransferValueAfterPayout (PT-73g step 2)', () => {
    it('is the recurring live withdrawals of the engine live-transfer setup averaged over the trials', () => {
        const inputs = inputsOf();

        const value = liveTransferValueAfterPayout(
            inputs,
            fundedState(),
            TRIALS,
        );

        expect(value).toStrictEqual(oracleOf(inputs, TRIALS));
        expect(value.value).toBeGreaterThan(0);
        expect(Number.isFinite(value.standardError ?? NaN)).toBe(true);
    });

    it('reads the commission, the funded reward to risk and the funded trade count the engine setup reads', () => {
        const inputs = inputsOf({
            commissionPerRoundTrip: 4.5,
            fundedRrRatio: 3,
            fundedTradesPerDay: 3,
        });

        expect(
            liveTransferValueAfterPayout(inputs, fundedState(), TRIALS),
        ).toStrictEqual(oracleOf(inputs, TRIALS));
    });

    it('runs the number of trials it is given, not the inputs trial count', () => {
        const inputs = inputsOf({ trials: 400 });

        expect(
            liveTransferValueAfterPayout(inputs, fundedState(), TRIALS),
        ).toStrictEqual(oracleOf(inputs, TRIALS));
    });

    it('is the same figure on a rerun with the same seed', () => {
        const inputs = inputsOf();

        expect(
            liveTransferValueAfterPayout(inputs, fundedState(), TRIALS),
        ).toStrictEqual(
            liveTransferValueAfterPayout(inputs, fundedState(), TRIALS),
        );
    });

    it('is worth $0 with a standard error of $0 when no live plan is modeled', () => {
        expect(
            liveTransferValueAfterPayout(
                inputsOf({ instrument: undefined, stopPoints: undefined }),
                fundedState(),
                TRIALS,
            ),
        ).toStrictEqual({ standardError: 0, value: 0 });
    });

    it('is worth $0 with a standard error of $0 when no hazard is set and no trigger is verified', () => {
        expect(
            liveTransferValueAfterPayout(
                inputsOf({ liveTransferHazard: undefined }),
                fundedState(),
                TRIALS,
            ),
        ).toStrictEqual({ standardError: 0, value: 0 });
    });
});
