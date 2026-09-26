import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    capRiskToRemainingDailyLoss,
    computedDayPolicy,
    computeEvalStateValue,
    type ComputeRisk,
    contracts,
    DailyLossLimitKind,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    type FundedCycleSnapshot,
    InstrumentSymbol,
    ladderRungSchema,
    ladderRungsSchema,
    placeWholeContractTrade,
    type Plan,
    type PlanId,
    PolicySizing,
    policySizingOf,
    type PositionSizingConfig,
    resolveAffordableRisk,
    resolveFundedTradeRisk,
    resolvePositionSizing,
    RungSizing,
    stopLossCountSchema,
    stopTargetDollarsSchema,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { computeFundedStateValue } from '~/lib/prop-calculator/core/FundedStateValue';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type Rng } from '~/lib/prop-calculator/rng';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

import { freshFundedCycle } from '../dayRunOptions';
import { dayRunOptionsFor } from '../dayRunOptions';

function freshStats(startingBalance: number) {
    const totals = new TradeTotals();
    return newPhaseStats(startingBalance, totals, new LossStreak(totals));
}

function planFor(id: PlanId): Plan {
    const firm = findFirm(id.firm);
    if (!firm) throw new Error(`firm ${id.firm} not registered`);
    const plan = firm.findPlan(id);
    if (!plan) throw new Error('plan not found');
    return plan;
}

const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

const alwaysWins: Rng = () => 0;

describe('resolveFundedTradeRisk', () => {
    it('sizes risk as exactly percent times the remaining cushion', () => {
        expect(resolveFundedTradeRisk(2000, fraction(0.1))).toBe(200);
        expect(resolveFundedTradeRisk(2000, fraction(0.05))).toBe(100);
    });
});

describe('computedDayPolicy', () => {
    it('builds a policy whose ladder length matches maxTrades but whose sizing comes from computeRisk, not the ladder values', () => {
        const policy = computedDayPolicy(() => 999, 3);

        expect(policy.ladder).toHaveLength(3);
        expect(policy.ladder.every((rung) => rung === 0)).toBe(true);
        expect(policy.maxLossesPerDay).toBeNull();
        expect(policy.computeRisk?.(apexEod.initialState(), 0)).toBe(999);
    });

    it('wires a percent-of-cushion computeRisk through runDay so each trade is sized off the live cushion, not a fixed dollar amount', () => {
        const state = apexEod.initialState();
        const stats = freshStats(state.startingBalance);
        const cushionAtStart = state.balance - state.threshold;
        const percent = fraction(0.1);
        const dayPolicy = computedDayPolicy(
            (tradeState) =>
                resolveFundedTradeRisk(
                    tradeState.balance - tradeState.threshold,
                    percent,
                ),
            1,
            { kind: DayStopRuleKind.None },
        );

        runDay({
            commission: dollars(0),
            dayPolicy,
            fundedCycle: freshFundedCycle(apexEod, state),
            phase: TradingPhase.Funded,
            plan: apexEod,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(1),
        });

        expect(state.balance - state.startingBalance).toBeCloseTo(
            percent * cushionAtStart,
            8,
        );
    });
});

describe('runDay when computeRisk is unset', () => {
    it('falls back to dayPolicy.ladder[index], byte-identical to the pre-computeRisk behavior', () => {
        const state = apexEod.initialState();
        const stats = freshStats(state.startingBalance);
        const dayPolicy: DayPolicy = {
            ladder: [300],
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.None },
        };
        expect(dayPolicy.computeRisk).toBeUndefined();

        runDay({
            commission: dollars(0),
            dayPolicy,
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats,
            winrate: fraction(1),
        });

        expect(state.balance - state.startingBalance).toBe(300);
    });
});

describe('the day policy input schemas live in the domain', () => {
    it('accepts a ladder that ends on a $0 rung', () => {
        expect(ladderRungsSchema.safeParse([400, 600, 0]).success).toBe(true);
    });

    it('rejects a $0 first rung', () => {
        expect(ladderRungsSchema.safeParse([0, 400]).success).toBe(false);
    });

    it('rejects a positive rung after a $0 rung', () => {
        const parsed = ladderRungsSchema.safeParse([400, 0, 600]);
        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0]?.message).toBe(
            'rung 3 follows a $0 rung and would never trade',
        );
    });

    it('rejects an empty ladder and a negative rung', () => {
        expect(ladderRungsSchema.safeParse([]).success).toBe(false);
        expect(ladderRungSchema.safeParse(-1).success).toBe(false);
    });

    it('bounds the stop rule parameters', () => {
        expect(stopLossCountSchema.safeParse(1).success).toBe(true);
        expect(stopLossCountSchema.safeParse(0).success).toBe(false);
        expect(stopLossCountSchema.safeParse(1.5).success).toBe(false);
        expect(stopTargetDollarsSchema.safeParse(0.5).success).toBe(true);
        expect(stopTargetDollarsSchema.safeParse(0).success).toBe(false);
    });
});

describe('resolveAffordableRisk', () => {
    it('returns the whole cushion when there is no daily loss limit', () => {
        expect(resolveAffordableRisk(2000, null, -300, 0)).toBe(2000);
        expect(resolveAffordableRisk(2000, null, -300, 5)).toBe(2000);
    });

    it('caps at the daily loss limit headroom left today', () => {
        expect(resolveAffordableRisk(2000, 1000, -300, 0)).toBe(700);
    });

    it('caps at the cushion when the cushion is below the headroom', () => {
        expect(resolveAffordableRisk(500, 1000, 0, 0)).toBe(500);
    });

    it('keeps the round-trip commission inside the daily loss limit, so a full-size loser lands exactly on it (N-56)', () => {
        const risk = resolveAffordableRisk(2000, 1000, -300, 5);
        expect(risk).toBe(695);
        expect(-300 - risk - 5).toBe(-1000);
    });

    it('is the same rule the live phase caps a trade with', () => {
        for (const [dailyLossLimit, todayPnL, commission] of [
            [1000, -300, 5],
            [1000, 0, 2.5],
            [500, -120, 0],
        ] as const) {
            expect(
                resolveAffordableRisk(
                    Infinity,
                    dailyLossLimit,
                    todayPnL,
                    commission,
                ),
            ).toBe(
                capRiskToRemainingDailyLoss(
                    Infinity,
                    dailyLossLimit,
                    todayPnL,
                    commission,
                ),
            );
        }
    });
});

const alwaysLoses: Rng = () => 0.99;

describe('runDay keeps a losing trade and its commission inside the daily loss limit (N-56)', () => {
    it.each([TradingPhase.Eval, TradingPhase.Funded])(
        'sizes the %s trade to the limit minus the commission',
        (phase) => {
            const flatLimit = {
                amount: dollars(500),
                kind: DailyLossLimitKind.Flat,
            } as const;
            const plan = apexEod.withOverrides({
                evalDailyLossLimit: flatLimit,
                fundedDailyLossLimit: flatLimit,
            });
            const state = plan.initialState();
            if (phase === TradingPhase.Funded) plan.beginFundedPhase(state);
            const stats = freshStats(state.startingBalance);
            runDay(
                dayRunOptionsFor(phase, {
                    commission: dollars(5),
                    dayPolicy: flatDayPolicy(1000, 1),
                    plan,
                    positionSizing: null,
                    rng: alwaysLoses,
                    rrRatio: 2,
                    rungSizing: RungSizing.CapToCushion,
                    state,
                    stats,
                    winrate: fraction(0.5),
                }),
            );
            expect(state.todayPnL).toBe(-500);
            expect(state.balance).toBe(state.startingBalance - 500);
        },
    );
});

describe('both dynamic programs cap the first trade at the daily loss limit minus the commission (N-56 review)', () => {
    const flatLimit = {
        amount: dollars(500),
        kind: DailyLossLimitKind.Flat,
    } as const;
    const plan = apexEod.withOverrides({
        evalDailyLossLimit: flatLimit,
        fundedDailyLossLimit: flatLimit,
    });

    function evalFirstTradeRisk(commission: number): number {
        const result = computeEvalStateValue({
            commission: dollars(commission),
            maxActionDollars: 800,
            maxEvalDays: 2,
            plan,
            rrRatio: 3.2,
            tradesPerDay: 1,
            winrate: fraction(0.95),
        });
        return result.dayPolicy.computeRisk?.(plan.initialState(), 0) ?? 0;
    }

    function fundedFirstTradeRisk(commission: number): number {
        const result = computeFundedStateValue({
            actionStepMultiple: 0.25,
            commission: dollars(commission),
            cushionStepMultiple: 0.25,
            cycleBestDayBucketCount: 1,
            evalInitialValue: 0,
            feePerAttempt: dollars(0),
            maxActionMultiple: 0.5,
            maxCushionMultiple: 1.5,
            maxPreLockOffsetMultiple: 1,
            payoutRegimeCap: 0,
            plan,
            rrRatio: 3,
            tradesPerDay: 1,
            winrate: 0.95,
        });
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        return result.dayPolicy.computeRisk?.(state, 0) ?? 0;
    }

    it('the eval DP sizes a first trade that must win the target in two days at $500 - $5 = $495, and at $500 with no commission', () => {
        expect(evalFirstTradeRisk(5)).toBe(495);
        expect(evalFirstTradeRisk(0)).toBe(500);
    });

    it(
        'the funded DP sizes a full-edge first trade at $500 - $5 = $495, and at $500 with no commission',
        {
            timeout: 120_000,
        },
        () => {
            expect(fundedFirstTradeRisk(5)).toBe(495);
            expect(fundedFirstTradeRisk(0)).toBe(500);
        },
    );
});

describe('both dynamic programs keep every later trade of the day inside the remaining daily loss limit minus the commission (N-56)', () => {
    const DAILY_LOSS_LIMIT = 500;
    const COMMISSION = 5;
    const EVAL_FIRST_TRADE_RISKS = [45, 95, 145, 195, 245, 295, 345, 395];
    const FUNDED_FIRST_TRADE_RISKS = [95, 195, 295, 395];
    const flatLimit = {
        amount: dollars(DAILY_LOSS_LIMIT),
        kind: DailyLossLimitKind.Flat,
    } as const;
    const plan = apexEod.withOverrides({
        evalDailyLossLimit: flatLimit,
        fundedDailyLossLimit: flatLimit,
    });

    function afterFirstLoss(state: AccountState, firstRisk: number) {
        const todayPnL = -(firstRisk + COMMISSION);
        return { ...state, balance: state.balance + todayPnL, todayPnL };
    }

    function remainingAfterCommission(state: AccountState): number {
        return DAILY_LOSS_LIMIT - COMMISSION + state.todayPnL;
    }

    it(
        'the eval DP never sizes a second trade whose loss plus commission breaches the limit',
        {
            timeout: 60_000,
        },
        () => {
            const result = computeEvalStateValue({
                commission: dollars(COMMISSION),
                cushionStepDollars: 50,
                maxActionDollars: 800,
                maxEvalDays: 6,
                plan,
                rrRatio: 3.2,
                tradesPerDay: 2,
                winrate: fraction(0.95),
            });
            const risks = EVAL_FIRST_TRADE_RISKS.map((firstRisk) => {
                const state = afterFirstLoss(plan.initialState(), firstRisk);
                const risk = result.dayPolicy.computeRisk?.(state, 1) ?? 0;
                expect(risk).toBeLessThanOrEqual(
                    remainingAfterCommission(state) + 1e-9,
                );
                return risk;
            });

            expect(risks.some((risk) => risk > 0)).toBe(true);
        },
    );

    it(
        'the funded DP never sizes a second trade whose loss plus commission breaches the limit',
        {
            timeout: 120_000,
        },
        () => {
            const result = computeFundedStateValue({
                actionStepMultiple: 0.25,
                commission: dollars(COMMISSION),
                cushionStepMultiple: 0.05,
                cycleBestDayBucketCount: 1,
                evalInitialValue: 0,
                feePerAttempt: dollars(0),
                maxActionMultiple: 0.5,
                maxCushionMultiple: 1.5,
                maxPreLockOffsetMultiple: 1,
                payoutRegimeCap: 0,
                plan,
                rrRatio: 3,
                tradesPerDay: 2,
                winrate: 0.95,
            });
            const fundedStart = plan.initialState();
            plan.beginFundedPhase(fundedStart);
            const risks = FUNDED_FIRST_TRADE_RISKS.map((firstRisk) => {
                const state = afterFirstLoss(fundedStart, firstRisk);
                const risk = result.dayPolicy.computeRisk?.(state, 1) ?? 0;
                expect(risk).toBeLessThanOrEqual(
                    remainingAfterCommission(state) + 1e-9,
                );
                return risk;
            });

            expect(risks.some((risk) => risk > 0)).toBe(true);
        },
    );
});

describe('ComputeRisk takes the funded cycle as one named snapshot', () => {
    it('requires every funded cycle field once a snapshot is passed, the last payout balance and the funded reset count included (N-34)', () => {
        expectTypeOf<FundedCycleSnapshot>().toEqualTypeOf<{
            readonly cycleBestDayProfit: number;
            readonly dayGateProgress: number;
            readonly fundedResetsUsed: number;
            readonly lastPayoutBalance: number;
            readonly payoutsIssued: number;
        }>();
        expectTypeOf<Parameters<ComputeRisk>>().toEqualTypeOf<
            [AccountState, number, FundedCycleSnapshot?]
        >();
    });

    it('hands the funded cycle snapshot from runDay to computeRisk unchanged', () => {
        const state = apexEod.initialState();
        const fundedCycle: FundedCycleSnapshot = {
            cycleBestDayProfit: 400,
            dayGateProgress: 3,
            fundedResetsUsed: 1,
            lastPayoutBalance: 51_250,
            payoutsIssued: 2,
        };
        const received: (FundedCycleSnapshot | undefined)[] = [];
        runDay({
            commission: dollars(0),
            dayPolicy: computedDayPolicy((_state, _index, snapshot) => {
                received.push(snapshot);
                return 100;
            }, 2),
            fundedCycle,
            phase: TradingPhase.Funded,
            plan: apexEod,
            positionSizing: null,
            rng: alwaysWins,
            rrRatio: 1,
            rungSizing: RungSizing.CapToCushion,
            state,
            stats: freshStats(state.startingBalance),
            winrate: fraction(1),
        });
        expect(received).toStrictEqual([fundedCycle, fundedCycle]);
    });
});

describe('every day policy builder states how its risk is placed (T33, R4, R9)', () => {
    it('builds a flat and a computed policy as ContractCapped unless WholeContracts is asked for, and says so on the policy', () => {
        expect(flatDayPolicy(250, 2).sizing).toBe(PolicySizing.ContractCapped);
        expect(computedDayPolicy(() => 250, 2).sizing).toBe(
            PolicySizing.ContractCapped,
        );
        expect(
            flatDayPolicy(250, 2, undefined, PolicySizing.WholeContracts)
                .sizing,
        ).toBe(PolicySizing.WholeContracts);
        expect(
            computedDayPolicy(
                () => 250,
                2,
                undefined,
                PolicySizing.WholeContracts,
            ).sizing,
        ).toBe(PolicySizing.WholeContracts);
    });

    it('reads a declared policy with no sizing field as ContractCapped, the only sizing a declared ladder has ever had', () => {
        const declared: DayPolicy = {
            ladder: [300, 600],
            maxLossesPerDay: null,
            stopRule: { kind: DayStopRuleKind.None },
        };
        expect(policySizingOf(declared)).toBe(PolicySizing.ContractCapped);
        expect(
            policySizingOf({
                ...declared,
                sizing: PolicySizing.WholeContracts,
            }),
        ).toBe(PolicySizing.WholeContracts);
    });
});

function mnqAtTenPoints(): PositionSizingConfig {
    const positionSizing = resolvePositionSizing(InstrumentSymbol.MNQ, 10);
    if (positionSizing === null) throw new Error('MNQ sizing did not resolve');
    return positionSizing;
}

describe('placeWholeContractTrade is the one whole-contract placement rule the funded and live phases share (T33, U18)', () => {
    it('rounds the intended risk down to whole $20 MNQ micros when the room covers it', () => {
        expect(
            placeWholeContractTrade({
                intendedRisk: 250,
                maxContracts: null,
                positionSizing: mnqAtTenPoints(),
                room: 1000,
                rungSizing: RungSizing.CapToCushion,
            }),
        ).toEqual({ rewardRisk: 240, risk: 240 });
    });

    it('takes one micro when the room is below one contract: the loss stops at the room and the win pays on the micro', () => {
        expect(
            placeWholeContractTrade({
                intendedRisk: 250,
                maxContracts: null,
                positionSizing: mnqAtTenPoints(),
                room: 10,
                rungSizing: RungSizing.CapToCushion,
            }),
        ).toEqual({ rewardRisk: 20, risk: 10 });
    });

    it('sizes to the room, not the intended risk, when the room is between whole contracts', () => {
        expect(
            placeWholeContractTrade({
                intendedRisk: 250,
                maxContracts: null,
                positionSizing: mnqAtTenPoints(),
                room: 150,
                rungSizing: RungSizing.CapToCushion,
            }),
        ).toEqual({ rewardRisk: 140, risk: 140 });
    });

    it('never places more contracts than the contract limit, and nothing at a limit of zero', () => {
        const base = {
            intendedRisk: 1000,
            positionSizing: mnqAtTenPoints(),
            room: 5000,
            rungSizing: RungSizing.CapToCushion,
        };
        expect(
            placeWholeContractTrade({ ...base, maxContracts: contracts(30) }),
        ).toEqual({ rewardRisk: 600, risk: 600 });
        expect(
            placeWholeContractTrade({ ...base, maxContracts: contracts(0) }),
        ).toEqual({
            rewardRisk: 0,
            risk: 0,
        });
    });

    it('skips a whole-contract trade the room cannot cover when rungs skip, and takes it once the room does', () => {
        const base = {
            intendedRisk: 250,
            maxContracts: null,
            positionSizing: mnqAtTenPoints(),
            rungSizing: RungSizing.SkipIfUnaffordable,
        };
        expect(placeWholeContractTrade({ ...base, room: 239 })).toEqual({
            rewardRisk: 0,
            risk: 0,
        });
        expect(placeWholeContractTrade({ ...base, room: 240 })).toEqual({
            rewardRisk: 240,
            risk: 240,
        });
    });

    it('places nothing with no room or no intended risk', () => {
        const base = {
            maxContracts: null,
            positionSizing: mnqAtTenPoints(),
            rungSizing: RungSizing.CapToCushion,
        };
        for (const [intendedRisk, room] of [
            [250, 0],
            [250, -5],
            [0, 1000],
        ] as const) {
            expect(
                placeWholeContractTrade({ ...base, intendedRisk, room }),
            ).toEqual({ rewardRisk: 0, risk: 0 });
        }
    });
});
