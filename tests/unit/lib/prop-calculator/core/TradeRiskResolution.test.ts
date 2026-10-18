import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    applyClosedTrade,
    applyTrade,
    DailyLossLimitKind,
    dollars,
    type DrawdownStrategy,
    FirmId,
    fraction,
    InstrumentSymbol,
    LivePlan,
    type Plan,
    type PlanId,
    PolicySizing,
    resolveLiveRiskAt,
    resolvePositionSizing,
    resolveRiskAt,
    RungSizing,
    StaticDrawdown,
    StrictlyBelowStaticDrawdown,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { buildApexLivePlan } from '~/lib/prop-calculator/firms/apex/ApexLive';

function planFor(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error(`plan ${JSON.stringify(id)} not found`);
    return plan;
}

const apexIntraday = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Intraday,
});

const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

describe('resolveRiskAt (unsized rows)', () => {
    it('caps a flat risk to the cushion when no daily loss limit applies', () => {
        const state = apexIntraday.initialState();
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 10_000,
            phase: TradingPhase.Eval,
            plan: apexIntraday,
            positionSizing: null,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.ContractCapped,
            state,
        });
        expect(result).toStrictEqual({
            affordable: 2000,
            maxContracts: null,
            rewardRisk: 2000,
            risk: 2000,
        });
    });

    it('caps a flat risk to the daily loss limit after an intraday loss', () => {
        const state = apexEod.initialState();
        state.todayPnL = -600;
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 10_000,
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.ContractCapped,
            state,
        });
        expect(result).toStrictEqual({
            affordable: 400,
            maxContracts: null,
            rewardRisk: 400,
            risk: 400,
        });
    });

    it('SkipIfUnaffordable refuses a risk larger than the room', () => {
        const state = apexEod.initialState();
        const affordable = apexEod.affordableRisk(state, TradingPhase.Eval, 0);
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: affordable + 1,
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rungSizing: RungSizing.SkipIfUnaffordable,
            sizing: PolicySizing.ContractCapped,
            state,
        });
        expect(result.risk).toBe(0);
        expect(result.rewardRisk).toBe(0);
    });

    it('gives zero risk when the room is zero or negative', () => {
        const state = apexEod.initialState();
        state.todayPnL = -1000;
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 500,
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.ContractCapped,
            state,
        });
        expect(result.affordable).toBe(0);
        expect(result.risk).toBe(0);
        expect(result.rewardRisk).toBe(0);
    });
});

describe('resolveRiskAt (ContractCapped eval rows)', () => {
    it('caps an oversized risk to the eval dollar cap for NQ, then to the cushion or DLL', () => {
        const state = apexEod.initialState();
        const nqSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (nqSizing === null) throw new Error('expected a position size');
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 100_000,
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: nqSizing,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.ContractCapped,
            state,
        });
        expect(result).toStrictEqual({
            affordable: 1000,
            maxContracts: 6,
            rewardRisk: 1000,
            risk: 1000,
        });
    });

    it('caps an oversized risk to the eval dollar cap for MNQ before the cushion', () => {
        const state = apexEod.initialState();
        const mnqSizing = resolvePositionSizing(InstrumentSymbol.MNQ, 10);
        if (mnqSizing === null) throw new Error('expected a position size');
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 100_000,
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: mnqSizing,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.ContractCapped,
            state,
        });
        expect(result.maxContracts).toBe(60);
        expect(result.risk).toBe(1000);
    });
});

describe('resolveRiskAt (WholeContracts funded rows)', () => {
    it('rounds a funded trade down to whole contracts', () => {
        const state = apexIntraday.initialState();
        const nqSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (nqSizing === null) throw new Error('expected a position size');
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 250,
            phase: TradingPhase.Funded,
            plan: apexIntraday,
            positionSizing: nqSizing,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.WholeContracts,
            state,
        });
        expect(result).toStrictEqual({
            affordable: 1000,
            maxContracts: 2,
            rewardRisk: 200,
            risk: 200,
        });
    });

    it('gives risk = room and rewardRisk = one contract when room is below one contract under CapToCushion', () => {
        const state = apexIntraday.initialState();
        state.balance = state.threshold + 50;
        const nqSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (nqSizing === null) throw new Error('expected a position size');
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 500,
            phase: TradingPhase.Funded,
            plan: apexIntraday,
            positionSizing: nqSizing,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.WholeContracts,
            state,
        });
        expect(result.rewardRisk).toBe(200);
        expect(result.risk).toBe(50);
    });

    it('gives 0/0 under SkipIfUnaffordable when room is below the placed risk', () => {
        const state = apexIntraday.initialState();
        state.balance = state.threshold + 50;
        const nqSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (nqSizing === null) throw new Error('expected a position size');
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 500,
            phase: TradingPhase.Funded,
            plan: apexIntraday,
            positionSizing: nqSizing,
            rungSizing: RungSizing.SkipIfUnaffordable,
            sizing: PolicySizing.WholeContracts,
            state,
        });
        expect(result.rewardRisk).toBe(0);
        expect(result.risk).toBe(0);
    });

    it('uses the funded tier cap from contractLimitAt', () => {
        const state = apexIntraday.initialState();
        const nqSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (nqSizing === null) throw new Error('expected a position size');
        const result = resolveRiskAt({
            commission: 0,
            intendedRisk: 100_000,
            phase: TradingPhase.Funded,
            plan: apexIntraday,
            positionSizing: nqSizing,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.WholeContracts,
            state,
        });
        expect(result.maxContracts).toBe(2);
        expect(result.rewardRisk).toBe(400);
    });
});

describe('resolveRiskAt shared fields', () => {
    it('affordable equals plan.affordableRisk(state, phase, commission)', () => {
        const state = apexEod.initialState();
        const expected = apexEod.affordableRisk(state, TradingPhase.Eval, 1.5);
        const result = resolveRiskAt({
            commission: 1.5,
            intendedRisk: 100,
            phase: TradingPhase.Eval,
            plan: apexEod,
            positionSizing: null,
            rungSizing: RungSizing.CapToCushion,
            sizing: PolicySizing.ContractCapped,
            state,
        });
        expect(result.affordable).toBe(expected);
    });
});

describe('resolveLiveRiskAt', () => {
    it('resolves the same chain runLiveDay used to compute inline', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();
        state.balance = 500;
        state.todayPnL = -50;
        const positionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (positionSizing === null)
            throw new Error('expected a position size');
        const result = resolveLiveRiskAt({
            commission: dollars(1.5),
            plan,
            positionSizing,
            state,
        });
        expect(result).toStrictEqual({ rewardRisk: 200, risk: 200 });
    });

    it('gives zero risk when the cushion is at or below zero', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();
        state.balance = state.threshold;
        const positionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (positionSizing === null)
            throw new Error('expected a position size');
        const result = resolveLiveRiskAt({
            commission: dollars(0),
            plan,
            positionSizing,
            state,
        });
        expect(result).toStrictEqual({ rewardRisk: 0, risk: 0 });
    });

    it('uses the postLock cushion percent once the drawdown threshold is locked', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();
        state.thresholdLocked = true;
        state.threshold = 100;
        state.balance = 5100;
        const positionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (positionSizing === null)
            throw new Error('expected a position size');
        const result = resolveLiveRiskAt({
            commission: dollars(0),
            plan,
            positionSizing,
            state,
        });
        expect(result).toStrictEqual({ rewardRisk: 400, risk: 400 });
    });

    it('caps to the tiered live daily loss limit when it binds tighter than the cushion', () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();
        state.balance = 15_000;
        state.todayPnL = -4750;
        const positionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
        if (positionSizing === null)
            throw new Error('expected a position size');
        expect(plan.dailyLossLimitFor(state)).toBe(5000);
        const result = resolveLiveRiskAt({
            commission: dollars(0),
            plan,
            positionSizing,
            state,
        });
        expect(result).toStrictEqual({ rewardRisk: 200, risk: 200 });
    });
});

describe('applyClosedTrade', () => {
    it('applies the same drawdown ratchet and balance update as applyTrade', () => {
        const expected = apexEod.initialState();
        applyTrade(apexEod, TradingPhase.Eval, expected, 150, 220);

        const actual = apexEod.initialState();
        applyClosedTrade(actual, apexEod, TradingPhase.Eval, 150, 220);

        expect(actual).toStrictEqual(expected);
    });

    it('applies a losing closed trade identically to applyTrade', () => {
        const expected = apexIntraday.initialState();
        applyTrade(apexIntraday, TradingPhase.Funded, expected, -300);

        const actual = apexIntraday.initialState();
        applyClosedTrade(actual, apexIntraday, TradingPhase.Funded, -300);

        expect(actual).toStrictEqual(expected);
    });
});

function floorLivePlan(
    drawdown: DrawdownStrategy,
    dailyLossLimit: null | number = null,
): LivePlan {
    return new LivePlan({
        cushionPercent: { postLock: fraction(0.05), preLock: fraction(0.05) },
        label: 'Floor Live',
        liveDailyLossLimit:
            dailyLossLimit === null
                ? null
                : {
                      amount: dollars(dailyLossLimit),
                      kind: DailyLossLimitKind.Flat,
                  },
        liveDrawdown: drawdown,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(1) },
        ],
        startingBalance: dollars(10_000),
    });
}

function strictLivePlan(): LivePlan {
    return floorLivePlan(
        new StrictlyBelowStaticDrawdown({ amount: dollars(9000) }),
    );
}

describe('resolveLiveRiskAt on an account sitting exactly on a strictly-below floor (WP62b)', () => {
    const positionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 22.5);
    if (positionSizing === null) throw new Error('expected a position size');
    it('places the one-contract minimum when the cushion is exactly 0 and the account is still alive', () => {
        const plan = strictLivePlan();
        const state = plan.initialState();
        state.balance = state.threshold;

        expect(plan.isBust(state)).toBe(false);
        expect(
            resolveLiveRiskAt({
                commission: dollars(0),
                plan,
                positionSizing,
                state,
            }),
        ).toStrictEqual({ rewardRisk: 450, risk: 450 });
    });

    it('places nothing when a daily loss room under one contract is all that is left', () => {
        const plan = floorLivePlan(
            new StrictlyBelowStaticDrawdown({ amount: dollars(9000) }),
            2000,
        );
        const state = plan.initialState();
        state.balance = state.threshold;
        state.todayPnL = -1800;

        expect(
            resolveLiveRiskAt({
                commission: dollars(0),
                plan,
                positionSizing,
                state,
            }),
        ).toStrictEqual({ rewardRisk: 0, risk: 0 });
    });

    it('leaves every other live plan at cushion 0 sizing to risk 0, since a plain static floor busts there', () => {
        const plan = floorLivePlan(
            new StaticDrawdown({ amount: dollars(9000) }),
        );
        const state = plan.initialState();
        state.balance = state.threshold;

        expect(plan.isBust(state)).toBe(true);
        expect(
            resolveLiveRiskAt({
                commission: dollars(0),
                plan,
                positionSizing,
                state,
            }),
        ).toStrictEqual({ rewardRisk: 0, risk: 0 });
    });

    it.each([200, 449.99, 1e-10])(
        'loses the whole one-contract stop from a cushion of $%d, so the loss crosses the strict floor and busts instead of landing exactly on it',
        (cushion) => {
            const plan = strictLivePlan();
            const state = plan.initialState();
            state.balance = state.threshold + cushion;

            const result = resolveLiveRiskAt({
                commission: dollars(0),
                plan,
                positionSizing,
                state,
            });

            expect(result).toStrictEqual({ rewardRisk: 450, risk: 450 });
            expect(
                plan.isBust({
                    ...state,
                    balance: state.balance - result.risk,
                }),
            ).toBe(true);
        },
    );

    it('keeps the loss capped to the cushion on a plain static floor, where landing on the floor already busts', () => {
        const plan = floorLivePlan(
            new StaticDrawdown({ amount: dollars(9000) }),
        );
        const state = plan.initialState();
        state.balance = state.threshold + 200;

        expect(
            resolveLiveRiskAt({
                commission: dollars(0),
                plan,
                positionSizing,
                state,
            }),
        ).toStrictEqual({ rewardRisk: 450, risk: 200 });
    });

    it('lets a daily loss room that binds before the cushion cap the loss, and places nothing when that room is under one contract', () => {
        const plan = floorLivePlan(
            new StrictlyBelowStaticDrawdown({ amount: dollars(9000) }),
            2000,
        );
        const state = plan.initialState();
        state.todayPnL = -1700;

        expect(
            resolveLiveRiskAt({
                commission: dollars(0),
                plan,
                positionSizing,
                state,
            }),
        ).toStrictEqual({ rewardRisk: 0, risk: 0 });
    });

    it('sizes a live plan with no drawdown, only a daily loss limit, to risk 0 at a balance of 0 as before', () => {
        const plan = new LivePlan({
            cushionPercent: {
                postLock: fraction(0.05),
                preLock: fraction(0.05),
            },
            label: 'Daily Limit Only Live',
            liveDailyLossLimit: {
                amount: dollars(2000),
                kind: DailyLossLimitKind.Flat,
            },
            liveDrawdown: null,
            payoutTiers: [
                { thresholdProfit: dollars(0), traderShare: fraction(1) },
            ],
        });
        const state = plan.initialState();

        expect(state.balance).toBe(0);
        expect(
            resolveLiveRiskAt({
                commission: dollars(0),
                plan,
                positionSizing,
                state,
            }),
        ).toStrictEqual({ rewardRisk: 0, risk: 0 });
    });

    it('sizes a cushion above 0 exactly as before: 5% of $9,000 is one $450 contract', () => {
        const plan = strictLivePlan();
        const state = plan.initialState();

        expect(
            resolveLiveRiskAt({
                commission: dollars(0),
                plan,
                positionSizing,
                state,
            }),
        ).toStrictEqual({ rewardRisk: 450, risk: 450 });
    });
});
