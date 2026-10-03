import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AffordableRoomKind,
    createInitialState,
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    DEFAULT_RUNG_SIZING,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    InstrumentSymbol,
    MffuVariant,
    oneContractRisk,
    placeWholeContractTrade,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
    RungSizing,
    type SizedTrade,
    wholeContractCount,
} from '~/lib/prop-calculator/core';
import {
    candidateTrades,
    type CandidateTradesCache,
    computeCandidateTrades,
    computeFundedStateValue,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const CUSHIONS = [5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100];
const REPLAY_TRIALS = 20_000;
const REPLAY_RELATIVE_TOLERANCE = 0.02;
const REPLAY_SIGMAS = 3;
const MNQ_FORTY_DOLLAR_STOP_POINTS = 20;
const TWO_TRADE_TOY_GRID = {
    actionStepMultiple: 0.5,
    cushionStepMultiple: 0.2,
    cycleBestDayBucketCount: 1,
    evalInitialValue: 0,
    feePerAttempt: dollars(0),
    maxActionMultiple: 1,
    maxCushionMultiple: 20,
    rrRatio: 2,
    tradesPerDay: 2,
    winrate: 0.5,
} as const;

function byRisk(trades: readonly SizedTrade[]): SizedTrade[] {
    return trades.toSorted((a, b) => a.risk - b.risk);
}

function dailyLossLimitToyPlan(breach: DailyLossLimitBreachEffect): Plan {
    return onePayoutToyPlan().withOverrides({
        fundedDailyLossLimit: {
            amount: dollars(60),
            kind: DailyLossLimitKind.Flat,
        },
        fundedDailyLossLimitBreach: breach,
    });
}

function onePayoutToyPlan(): Plan {
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
        drawdown: new EodTrailingDrawdown({ amount: dollars(100) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedConsistency: { kind: 'set', rule: null },
        fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDrawdown: new EodTrailingDrawdown({
            amount: dollars(100),
            lock: {
                atProfit: dollars(150),
                lockedThreshold: () => 1000,
            },
        }),
        isInstantFunded: true,
        maxLifetimePayouts: 1,
        minDaysAfterPassForPayout: 0,
        minPayoutProfit: dollars(0),
        minPayoutProfitPerCycle: dollars(0),
        minPayoutRequest: dollars(0),
        minQualifyingDayProfit: null,
        minTradingDays: 0,
        payoutBalanceShareCap: undefined,
        payoutRequestCap: undefined,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
    });
}

function policyRisks(
    positionSizing: null | PositionSizingConfig,
): { cushion: number; risk: number }[] {
    const plan = onePayoutToyPlan();
    const result = computeFundedStateValue({
        actionStepMultiple: 0.25,
        cushionStepMultiple: 0.05,
        cycleBestDayBucketCount: 1,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxCushionMultiple: 2,
        maxPreLockOffsetMultiple: 0.5,
        payoutRegimeCap: 0,
        plan,
        positionSizing,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.6,
    });
    return CUSHIONS.map((cushion) => {
        const state = createInitialState(plan.accountSize, plan.accountSize);
        state.threshold = plan.accountSize - 100;
        state.balance = state.threshold + cushion;
        return {
            cushion,
            risk: result.dayPolicy.computeRisk?.(state, 0) ?? 0,
        };
    });
}

function roomBelowOneContractReplay(plan: Plan = onePayoutToyPlan()): {
    dpValue: number;
    replayToleranceDollars: number;
    replayValue: number;
} {
    const positionSizing = sizing(
        InstrumentSymbol.MNQ,
        MNQ_FORTY_DOLLAR_STOP_POINTS,
    );
    const result = computeFundedStateValue({
        ...TWO_TRADE_TOY_GRID,
        plan,
        positionSizing,
    });
    expect(result.unconvergedLevelCount).toBe(0);
    const out = simulate({
        fundedDayPolicy: result.dayPolicy,
        fundedHorizonDays: 2000,
        instrument: InstrumentSymbol.MNQ,
        maxEvalDays: 1,
        plan,
        riskPerTrade: 100,
        rrRatio: TWO_TRADE_TOY_GRID.rrRatio,
        seed: 7,
        stopPoints: MNQ_FORTY_DOLLAR_STOP_POINTS,
        tradesPerDay: TWO_TRADE_TOY_GRID.tradesPerDay,
        trials: REPLAY_TRIALS,
        winrate: TWO_TRADE_TOY_GRID.winrate,
    });
    return {
        dpValue: result.initialValue,
        replayToleranceDollars:
            REPLAY_RELATIVE_TOLERANCE * out.expectedGrossPayout +
            REPLAY_SIGMAS * out.estimates.expectedGrossPayout.standardError,
        replayValue: out.expectedGrossPayout,
    };
}

function secondTradeRiskAfterMnqLoss(plan: Plan): number {
    const result = computeFundedStateValue({
        ...TWO_TRADE_TOY_GRID,
        plan,
        positionSizing: sizing(
            InstrumentSymbol.MNQ,
            MNQ_FORTY_DOLLAR_STOP_POINTS,
        ),
        tradesPerDay: 3,
    });
    const state = createInitialState(plan.accountSize, plan.accountSize);
    state.threshold = plan.accountSize - 100;
    state.balance = plan.accountSize - 40;
    state.todayPnL = -40;
    return result.dayPolicy.computeRisk?.(state, 1) ?? NaN;
}

function sizing(symbol: InstrumentSymbol, stopPoints: number) {
    const resolved = resolvePositionSizing(symbol, stopPoints);
    if (resolved === null) throw new Error('sizing did not resolve');
    return resolved;
}

describe('the funded DP values its candidates in whole contracts when position sizing is given (WP39d, T33)', () => {
    const mnqAtOnePointFive = sizing(InstrumentSymbol.MNQ, 1.5);

    it('chooses only risks simulate places unchanged in whole MNQ contracts at a 1.5 point stop', () => {
        const risks = policyRisks(mnqAtOnePointFive);
        expect(risks.some(({ risk }) => risk > 0)).toBe(true);
        for (const { cushion, risk } of risks) {
            if (risk <= 0) continue;
            const placed = placeWholeContractTrade({
                intendedRisk: risk,
                maxContracts: null,
                positionSizing: mnqAtOnePointFive,
                room: cushion,
                roomKind: AffordableRoomKind.BustsAccount,
                rungSizing: DEFAULT_RUNG_SIZING,
            });
            expect({ cushion, placed: placed.risk }).toStrictEqual({
                cushion,
                placed: risk,
            });
            expect(
                wholeContractCount(risk, mnqAtOnePointFive) *
                    oneContractRisk(mnqAtOnePointFive),
            ).toBeCloseTo(risk, 9);
        }
    });

    it('never trades when one contract risks more than the largest action it models', () => {
        const nqAtTen = sizing(InstrumentSymbol.NQ, 10);
        expect(oneContractRisk(nqAtTen)).toBeGreaterThan(100);
        for (const { risk } of policyRisks(nqAtTen)) {
            expect(risk).toBe(0);
        }
    });

    it('models a trade whose room is below one contract as simulate places it: the loss is the room and the win pays on one full contract (PT-T1b: the replay runs 20,000 trials and agrees within 2 percent plus three standard errors of the replay, where 200,000 trials and 2 percent took 27 s; the 20,000 trial replay earns 134.31 against the DP value of 132.67)', () => {
        const mnqAtTwenty = sizing(
            InstrumentSymbol.MNQ,
            MNQ_FORTY_DOLLAR_STOP_POINTS,
        );
        expect(oneContractRisk(mnqAtTwenty)).toBe(40);
        expect(
            placeWholeContractTrade({
                intendedRisk: 50,
                maxContracts: null,
                positionSizing: mnqAtTwenty,
                room: 20,
                roomKind: AffordableRoomKind.BustsAccount,
                rungSizing: DEFAULT_RUNG_SIZING,
            }),
        ).toStrictEqual({ rewardRisk: 40, risk: 20 });
        const { dpValue, replayToleranceDollars, replayValue } =
            roomBelowOneContractReplay();
        expect(dpValue).toBeGreaterThan(50);
        expect(Math.abs(replayValue - dpValue)).toBeLessThan(
            replayToleranceDollars,
        );
    });

    it('leaves the unsized DP unchanged: fractional risks on its action grid, capped at the cushion', () => {
        expect(policyRisks(null)).toStrictEqual(
            CUSHIONS.map((cushion) => ({
                cushion,
                risk: Math.min(cushion, 25),
            })),
        );
    });
});

describe('the funded DP skips a whole-contract candidate whose day-locking room is below one contract, as simulate does (N-74, U21)', () => {
    const nqAtTwenty = sizing(InstrumentSymbol.NQ, 20);
    const candidates = {
        actionGrid: [0, 200, 400, 800],
        positionSizing: nqAtTwenty,
        rungSizing: RungSizing.CapToCushion,
    };

    it('offers only the no-trade candidate when a $200 lockout room is below one $400 NQ contract', () => {
        expect(
            computeCandidateTrades(
                candidates,
                { kind: AffordableRoomKind.LocksDay, room: 200 },
                null,
            ),
        ).toStrictEqual([{ rewardRisk: 0, risk: 0 }]);
    });

    it('still offers the T33 one-contract candidate when the same $200 room busts the account', () => {
        expect(
            byRisk(
                computeCandidateTrades(
                    candidates,
                    { kind: AffordableRoomKind.BustsAccount, room: 200 },
                    null,
                ),
            ),
        ).toStrictEqual([
            { rewardRisk: 0, risk: 0 },
            { rewardRisk: 400, risk: 200 },
        ]);
    });

    it('chooses no second trade after a $40 MNQ loss under a $60 lockout daily loss limit: the $20 left is below one contract', () => {
        expect(
            secondTradeRiskAfterMnqLoss(
                dailyLossLimitToyPlan(DailyLossLimitBreachEffect.Lockout),
            ),
        ).toBe(0);
    });

    it('takes one MNQ as the second trade after the same $40 loss when the plan has no daily loss limit', () => {
        expect(secondTradeRiskAfterMnqLoss(onePayoutToyPlan())).toBe(40);
    });

    it('agrees with simulate on the value of a $60 lockout daily loss limit plan within the replay tolerance (PT-T1b: 20,000 trials, 2 percent plus three standard errors; the replay earns 134.31 against the DP value of 132.76)', () => {
        const { dpValue, replayToleranceDollars, replayValue } =
            roomBelowOneContractReplay(
                dailyLossLimitToyPlan(DailyLossLimitBreachEffect.Lockout),
            );
        expect(dpValue).toBeGreaterThan(50);
        expect(Math.abs(replayValue - dpValue)).toBeLessThan(
            replayToleranceDollars,
        );
    });

    it('caches the candidates of a day-locking and an account-busting room of the same size apart', () => {
        for (const order of [
            [AffordableRoomKind.LocksDay, AffordableRoomKind.BustsAccount],
            [AffordableRoomKind.BustsAccount, AffordableRoomKind.LocksDay],
        ]) {
            const candidateTradesCache: CandidateTradesCache = new Map();
            const context = { ...candidates, candidateTradesCache };
            for (const kind of order) {
                const cached = candidateTrades(
                    context,
                    { kind, room: 200 },
                    null,
                );
                expectTypeOf(cached).toEqualTypeOf<readonly SizedTrade[]>();
                expectTypeOf(
                    candidateTradesCache.get(kind)?.get(200)?.get(-1),
                ).toEqualTypeOf<readonly SizedTrade[] | undefined>();
                expect(byRisk(cached)).toStrictEqual(
                    byRisk(
                        computeCandidateTrades(
                            candidates,
                            { kind, room: 200 },
                            null,
                        ),
                    ),
                );
            }
        }
    });
});
