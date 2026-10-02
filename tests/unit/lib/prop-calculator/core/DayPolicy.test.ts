import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type AccountState,
    AffordableRoomKind,
    ApexVariant,
    capRiskToRemainingDailyLoss,
    computedDayPolicy,
    computeEvalStateValue,
    type ComputeRisk,
    contracts,
    DailyLossLimitBreachEffect,
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
    percentCushionDayPolicy,
    placeWholeContractTrade,
    type Plan,
    type PlanId,
    PolicySizing,
    policySizingOf,
    type PositionSizingConfig,
    resolveAffordableRisk,
    resolveAffordableRoom,
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
    resolveDayPolicy,
    runDay,
    type SimInputs,
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
        const policy = computedDayPolicy(
            () => 999,
            3,
            undefined,
            PolicySizing.ContractCapped,
        );

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
            PolicySizing.ContractCapped,
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

function cushionOf(state: AccountState): number {
    return state.balance - state.threshold;
}

describe('percentCushionDayPolicy is the one percent-of-cushion day policy (PT-68g)', () => {
    const stopRule = { kind: DayStopRuleKind.None } as const;

    it('sizes every trade at exactly the percent of the live cushion, with one slot per trade of the day', () => {
        const policy = percentCushionDayPolicy(
            fraction(0.1),
            3,
            stopRule,
            PolicySizing.ContractCapped,
        );
        const state = apexEod.initialState();

        expect(policy.ladder).toHaveLength(3);
        expect(policy.sizing).toBe(PolicySizing.ContractCapped);
        expect(policy.stopRule).toEqual(stopRule);
        expect(policy.computeRisk?.(state, 0)).toBe(
            resolveFundedTradeRisk(cushionOf(state), fraction(0.1)),
        );
    });

    it('caps the percent risk at the personal max risk and leaves a looser cap bit-identical to no cap', () => {
        const state = apexEod.initialState();
        const uncapped = percentCushionDayPolicy(
            fraction(0.1),
            2,
            stopRule,
            PolicySizing.ContractCapped,
        );
        const capped = percentCushionDayPolicy(
            fraction(0.1),
            2,
            stopRule,
            PolicySizing.ContractCapped,
            dollars(50),
        );
        const loose = percentCushionDayPolicy(
            fraction(0.1),
            2,
            stopRule,
            PolicySizing.ContractCapped,
            dollars(1_000_000),
        );

        expect(uncapped.computeRisk?.(state, 0)).toBeGreaterThan(50);
        expect(capped.computeRisk?.(state, 0)).toBe(50);
        expect(loose.computeRisk?.(state, 0)).toBe(
            uncapped.computeRisk?.(state, 0),
        );
    });

    it('is the policy the simulator resolves for a funded cushion percent', () => {
        const state = apexEod.initialState();
        const inputs: SimInputs = {
            commissionPerRoundTrip: 0,
            fundedCushionPercent: fraction(0.1),
            fundedHorizonDays: 252,
            instrument: InstrumentSymbol.MNQ,
            maxEvalDays: 150,
            plan: apexEod,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            stopPoints: 10,
            tradesPerDay: 3,
            trials: 10,
            winrate: 0.4,
        };

        const resolved = resolveDayPolicy(inputs, TradingPhase.Funded);
        const direct = percentCushionDayPolicy(
            fraction(0.1),
            3,
            stopRule,
            policySizingOf(TradingPhase.Funded),
        );

        expect(resolved.ladder).toEqual(direct.ladder);
        expect(resolved.computeRisk?.(state, 0)).toBe(
            direct.computeRisk?.(state, 0),
        );
    });

    it('is the only place that turns a cushion percent into a trade risk, outside the core domain', () => {
        const root = path.join(process.cwd(), 'src', 'lib', 'prop-calculator');
        for (const file of [
            path.join('simulator', 'day.ts'),
            path.join('advisor', 'EnginePolicyBuilder.ts'),
        ]) {
            expect(readFileSync(path.join(root, file), 'utf8')).not.toContain(
                'resolveFundedTradeRisk',
            );
        }
    });
});

describe('runDay when computeRisk is unset', () => {
    it('falls back to dayPolicy.ladder[index], byte-identical to the pre-computeRisk behavior', () => {
        const state = apexEod.initialState();
        const stats = freshStats(state.startingBalance);
        const dayPolicy: DayPolicy = {
            ladder: [300],
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
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
                    dayPolicy: flatDayPolicy(
                        1000,
                        1,
                        undefined,
                        PolicySizing.ContractCapped,
                    ),
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
        const fullCapWin = 3.2 * (500 - commission) - commission;
        const evalPlan = plan.withOverrides({
            consistency: null,
            minTradingDays: 0,
            profitTarget: dollars(Math.floor(fullCapWin) - 1),
        });
        const result = computeEvalStateValue({
            commission: dollars(commission),
            maxActionDollars: 800,
            maxEvalDays: 1,
            plan: evalPlan,
            rrRatio: 3.2,
            tradesPerDay: 1,
            winrate: fraction(0.95),
        });
        return result.dayPolicy.computeRisk?.(evalPlan.initialState(), 0) ?? 0;
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

    it('the eval DP sizes a first trade that only the full cap can win the target with at $500 - $5 = $495, and at $500 with no commission', () => {
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
                maxEvalDays: 3,
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
            dayPolicy: computedDayPolicy(
                (_state, _index, snapshot) => {
                    received.push(snapshot);
                    return 100;
                },
                2,
                undefined,
                PolicySizing.ContractCapped,
            ),
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
    it.each([PolicySizing.ContractCapped, PolicySizing.WholeContracts])(
        'builds a flat and a computed policy with the %s sizing it is given, and says so on the policy',
        (sizing) => {
            expect(flatDayPolicy(250, 2, undefined, sizing).sizing).toBe(
                sizing,
            );
            expect(
                computedDayPolicy(() => 250, 2, undefined, sizing).sizing,
            ).toBe(sizing);
        },
    );

    it('requires the sizing on every policy and every builder, so a missed call site fails typecheck (N-71)', () => {
        expectTypeOf<DayPolicy['sizing']>().toEqualTypeOf<PolicySizing>();
        expectTypeOf(flatDayPolicy).parameter(3).toEqualTypeOf<PolicySizing>();
        expectTypeOf(computedDayPolicy)
            .parameter(3)
            .toEqualTypeOf<PolicySizing>();
    });

    it('places funded risk in whole contracts and eval risk contract-capped (T33, U18)', () => {
        expect(policySizingOf(TradingPhase.Funded)).toBe(
            PolicySizing.WholeContracts,
        );
        expect(policySizingOf(TradingPhase.Eval)).toBe(
            PolicySizing.ContractCapped,
        );
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
                roomKind: AffordableRoomKind.BustsAccount,
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
                roomKind: AffordableRoomKind.BustsAccount,
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
                roomKind: AffordableRoomKind.BustsAccount,
                rungSizing: RungSizing.CapToCushion,
            }),
        ).toEqual({ rewardRisk: 140, risk: 140 });
    });

    it('never places more contracts than the contract limit, and nothing at a limit of zero', () => {
        const base = {
            intendedRisk: 1000,
            positionSizing: mnqAtTenPoints(),
            room: 5000,
            roomKind: AffordableRoomKind.BustsAccount,
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
            roomKind: AffordableRoomKind.BustsAccount,
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
            roomKind: AffordableRoomKind.BustsAccount,
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

describe('resolveAffordableRoom names what the affordable room ends when a trade loses all of it (N-74, U21)', () => {
    it('is a day-locking room when a lockout daily loss limit is tighter than the cushion', () => {
        expect(
            resolveAffordableRoom(
                2000,
                1000,
                -800,
                0,
                DailyLossLimitBreachEffect.Lockout,
            ),
        ).toStrictEqual({ kind: AffordableRoomKind.LocksDay, room: 200 });
    });

    it('is an account-busting room when the same daily loss limit terminates the account', () => {
        expect(
            resolveAffordableRoom(
                2000,
                1000,
                -800,
                0,
                DailyLossLimitBreachEffect.Terminate,
            ),
        ).toStrictEqual({ kind: AffordableRoomKind.BustsAccount, room: 200 });
    });

    it('is an account-busting room when the cushion is tighter than the lockout daily loss room', () => {
        expect(
            resolveAffordableRoom(
                150,
                1000,
                -800,
                0,
                DailyLossLimitBreachEffect.Lockout,
            ),
        ).toStrictEqual({ kind: AffordableRoomKind.BustsAccount, room: 150 });
    });

    it('is the whole cushion, busting the account, when there is no daily loss limit', () => {
        expect(
            resolveAffordableRoom(
                2000,
                null,
                -800,
                5,
                DailyLossLimitBreachEffect.Lockout,
            ),
        ).toStrictEqual({ kind: AffordableRoomKind.BustsAccount, room: 2000 });
    });

    it('treats a daily loss room that ties the cushion within the cent tolerance as account-busting', () => {
        expect(
            resolveAffordableRoom(
                200,
                1000,
                -800,
                0,
                DailyLossLimitBreachEffect.Lockout,
            ).kind,
        ).toBe(AffordableRoomKind.BustsAccount);
        expect(
            resolveAffordableRoom(
                200 + 1e-9,
                1000,
                -800,
                0,
                DailyLossLimitBreachEffect.Lockout,
            ).kind,
        ).toBe(AffordableRoomKind.BustsAccount);
        expect(
            resolveAffordableRoom(
                200.02,
                1000,
                -800,
                0,
                DailyLossLimitBreachEffect.Lockout,
            ).kind,
        ).toBe(AffordableRoomKind.LocksDay);
    });

    it('carries the same room resolveAffordableRisk returns, whatever the breach effect', () => {
        for (const [cushion, dailyLossLimit, todayPnL, commission] of [
            [2000, null, -300, 5],
            [2000, 1000, -300, 5],
            [500, 1000, 0, 0],
            [2000, 1000, -999.995, 0],
            [2000, 1000, -1200, 0],
        ] as const) {
            for (const breach of [
                DailyLossLimitBreachEffect.Lockout,
                DailyLossLimitBreachEffect.Terminate,
            ]) {
                expect(
                    resolveAffordableRoom(
                        cushion,
                        dailyLossLimit,
                        todayPnL,
                        commission,
                        breach,
                    ).room,
                ).toBe(
                    resolveAffordableRisk(
                        cushion,
                        dailyLossLimit,
                        todayPnL,
                        commission,
                    ),
                );
            }
        }
    });
});

function sizingAt(
    symbol: InstrumentSymbol,
    stopPoints: number,
): PositionSizingConfig {
    const positionSizing = resolvePositionSizing(symbol, stopPoints);
    if (positionSizing === null) throw new Error('sizing did not resolve');
    return positionSizing;
}

describe('placeWholeContractTrade skips a trade whose day-locking room is below one contract (N-74, U21)', () => {
    const nqAtTwenty = sizingAt(InstrumentSymbol.NQ, 20);
    const base = {
        intendedRisk: 800,
        maxContracts: null,
        positionSizing: nqAtTwenty,
        rungSizing: RungSizing.CapToCushion,
    };

    it('places nothing when a lockout daily loss room of $200 is below one $400 NQ contract', () => {
        expect(
            placeWholeContractTrade({
                ...base,
                room: 200,
                roomKind: AffordableRoomKind.LocksDay,
            }),
        ).toStrictEqual({ rewardRisk: 0, risk: 0 });
    });

    it('keeps one contract, the loss capped at the room, when the $200 room busts the account (T33)', () => {
        expect(
            placeWholeContractTrade({
                ...base,
                room: 200,
                roomKind: AffordableRoomKind.BustsAccount,
            }),
        ).toStrictEqual({ rewardRisk: 400, risk: 200 });
    });

    it('floors a day-locking room between whole contracts to whole contracts as before', () => {
        expect(
            placeWholeContractTrade({
                ...base,
                room: 600,
                roomKind: AffordableRoomKind.LocksDay,
            }),
        ).toStrictEqual({ rewardRisk: 400, risk: 400 });
        expect(
            placeWholeContractTrade({
                ...base,
                room: 1000,
                roomKind: AffordableRoomKind.LocksDay,
            }),
        ).toStrictEqual({ rewardRisk: 800, risk: 800 });
    });

    it('places one contract when a day-locking room covers exactly one contract within the cent tolerance', () => {
        expect(
            placeWholeContractTrade({
                ...base,
                room: 400 - 1e-9,
                roomKind: AffordableRoomKind.LocksDay,
            }).risk,
        ).toBeCloseTo(400, 6);
    });

    it('leaves every SkipIfUnaffordable placement unchanged by the room kind', () => {
        for (const room of [-5, 0, 200, 399.99, 400, 600, 800, 1000]) {
            const skipping = {
                ...base,
                room,
                rungSizing: RungSizing.SkipIfUnaffordable,
            };
            expect(
                placeWholeContractTrade({
                    ...skipping,
                    roomKind: AffordableRoomKind.LocksDay,
                }),
            ).toStrictEqual(
                placeWholeContractTrade({
                    ...skipping,
                    roomKind: AffordableRoomKind.BustsAccount,
                }),
            );
        }
    });

    it('never pays a win on more risk than the loss can take unless the room busts the account', () => {
        const sizings = [
            InstrumentSymbol.NQ,
            InstrumentSymbol.MNQ,
            InstrumentSymbol.ES,
        ].flatMap((symbol) =>
            [1.1, 5, 12.3, 20, 40].map((stop) => sizingAt(symbol, stop)),
        );
        let bustBoundOptions = 0;
        for (const positionSizing of sizings) {
            for (const intendedRisk of [0, 50, 200, 400, 800, 1500]) {
                for (const room of [
                    -5, 0, 0.5, 10, 150, 200, 399.99, 400, 600, 1000, 5000,
                ]) {
                    for (const maxContracts of [
                        null,
                        contracts(0),
                        contracts(1),
                        contracts(3),
                    ]) {
                        for (const rungSizing of [
                            RungSizing.CapToCushion,
                            RungSizing.SkipIfUnaffordable,
                        ]) {
                            for (const roomKind of [
                                AffordableRoomKind.BustsAccount,
                                AffordableRoomKind.LocksDay,
                            ]) {
                                const { rewardRisk, risk } =
                                    placeWholeContractTrade({
                                        intendedRisk,
                                        maxContracts,
                                        positionSizing,
                                        room,
                                        roomKind,
                                        rungSizing,
                                    });
                                if (rewardRisk <= risk) continue;
                                expect({
                                    intendedRisk,
                                    maxContracts,
                                    room,
                                    roomKind,
                                    rungSizing,
                                }).toMatchObject({
                                    roomKind: AffordableRoomKind.BustsAccount,
                                });
                                bustBoundOptions += 1;
                            }
                        }
                    }
                }
            }
        }
        expect(bustBoundOptions).toBeGreaterThan(0);
    });
});
