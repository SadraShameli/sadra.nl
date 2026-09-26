import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    InstrumentSymbol,
    MffuVariant,
    type Plan,
    resolvePositionSizing,
} from '~/lib/prop-calculator/core';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { simulate } from '~/lib/prop-calculator/simulator';

const COARSE_GRID = {
    actionStepMultiple: 0.5,
    cushionStepMultiple: 0.25,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 3,
    rrRatio: 2,
    winrate: 0.5,
} as const;

const TOY_DRAWDOWN = 100;
const TOY_CUSHION_STEP_MULTIPLE = 0.2;
const REPLAY_TRIALS = 100_000;
const REPLAY_RELATIVE_TOLERANCE = 0.03;
const OFF_GRID_TOY = {
    actionStepMultiple: 0.25,
    cushionStepMultiple: TOY_CUSHION_STEP_MULTIPLE,
    cycleBestDayBucketCount: 1,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    rrRatio: 2,
    tradesPerDay: 2,
    winrate: 0.5,
} as const;

function fundedStartSolve(symbol: InstrumentSymbol, stopPoints: number) {
    const plan = topStepFirstPlan();
    const positionSizing = resolvePositionSizing(symbol, stopPoints);
    if (positionSizing === null) throw new Error('sizing did not resolve');
    const result = computeFundedStateValue({
        ...COARSE_GRID,
        plan,
        positionSizing,
    });
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    return {
        initialValue: result.initialValue,
        startRisk: result.dayPolicy.computeRisk?.(state, 0),
        stepDollars:
            COARSE_GRID.cushionStepMultiple * plan.fundedDrawdown.amount,
    };
}

function lockAtOneFiftyToyPlan(): Plan {
    return paysTheFirstWinningCloseToyPlan().withOverrides({
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: { atProfit: dollars(150), lockedThreshold: () => 1000 },
        }),
        minRetainedCushionOverride: undefined,
    });
}

function oneTradeToyValue(options: {
    actionStepMultiple: number;
    maxActionMultiple: number;
    rrRatio: number;
    winrate: number;
}): number {
    return computeFundedStateValue({
        ...options,
        cushionStepMultiple: TOY_CUSHION_STEP_MULTIPLE,
        cycleBestDayBucketCount: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        payoutRegimeCap: 0,
        plan: paysTheFirstWinningCloseToyPlan(),
        tradesPerDay: 1,
    }).initialValue;
}

function paysTheFirstWinningCloseToyPlan(): Plan {
    const rapidEod = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!rapidEod) throw new Error('MFF Rapid EOD 50K plan not found');
    return rapidEod.withOverrides({
        accountSize: dollars(1000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(TOY_DRAWDOWN) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(TOY_DRAWDOWN),
            lock: {
                atProfit: dollars(-1000),
                lockedThreshold: (startingBalance) =>
                    startingBalance - TOY_DRAWDOWN,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minRetainedCushionOverride: dollars(0),
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function topStepFirstPlan(): Plan {
    const plan = new TopStep().plans[0];
    if (!plan) throw new Error('No TopStep plan registered');
    return plan;
}

describe('the funded DP keeps a whole-contract win smaller than one cushion step (N-77)', () => {
    it.each([
        { expectedStartRisk: 200, stopPoints: 2, symbol: InstrumentSymbol.ES },
        { expectedStartRisk: 200, stopPoints: 5, symbol: InstrumentSymbol.NQ },
        { expectedStartRisk: 80, stopPoints: 2, symbol: InstrumentSymbol.MNQ },
    ])(
        'values TopStep with $symbol at a $stopPoints point stop above 0 and trades the capped $expectedStartRisk at the funded start',
        ({ expectedStartRisk, stopPoints, symbol }) => {
            const { initialValue, startRisk, stepDollars } = fundedStartSolve(
                symbol,
                stopPoints,
            );
            expect(COARSE_GRID.rrRatio * expectedStartRisk).toBeLessThan(
                stepDollars,
            );
            expect(initialValue).toBeGreaterThan(0);
            expect(startRisk).toBe(expectedStartRisk);
        },
        600_000,
    );
});

describe('the unsized funded DP keeps the expected post-trade cushion when a trade is off its cushion grid (N-77)', () => {
    it('values a full-cushion trade at a non-integer reward ratio at its true expected payout: half of a $125 win on $20 steps, not half of $120', () => {
        expect(
            oneTradeToyValue({
                actionStepMultiple: 1,
                maxActionMultiple: 1,
                rrRatio: 1.25,
                winrate: 0.5,
            }),
        ).toBeCloseTo(0.5 * 1.25 * TOY_DRAWDOWN, 9);
    });

    it('values a sure $150 win on a $75 risk, an action step that is not a multiple of the $20 cushion step, at $150 and not $140', () => {
        expect(
            oneTradeToyValue({
                actionStepMultiple: 0.25,
                maxActionMultiple: 0.75,
                rrRatio: 2,
                winrate: 1,
            }),
        ).toBeCloseTo(2 * 0.75 * TOY_DRAWDOWN, 9);
    });
});

describe('the funded DP reads its policy at the exact off-grid cushion a real account holds (N-77)', () => {
    it('earns in a replay of its own policy what it predicts on a $25 action grid over $20 cushion steps, and well above the $111 the floored grid earned', () => {
        const plan = lockAtOneFiftyToyPlan();
        const result = computeFundedStateValue({ ...OFF_GRID_TOY, plan });
        const replay = simulate({
            fundedDayPolicy: result.dayPolicy,
            fundedHorizonDays: 2000,
            maxEvalDays: 1,
            plan,
            riskPerTrade: 100,
            rrRatio: OFF_GRID_TOY.rrRatio,
            seed: 7,
            tradesPerDay: OFF_GRID_TOY.tradesPerDay,
            trials: REPLAY_TRIALS,
            winrate: OFF_GRID_TOY.winrate,
        }).expectedGrossPayout;
        expect(replay).toBeGreaterThan(150);
        expect(Math.abs(replay - result.initialValue)).toBeLessThan(
            REPLAY_RELATIVE_TOLERANCE * replay,
        );
    }, 600_000);
});
