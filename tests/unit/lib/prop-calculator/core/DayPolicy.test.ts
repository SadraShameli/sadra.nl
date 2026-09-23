import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    computedDayPolicy,
    type DayPolicy,
    DayStopRuleKind,
    dollars,
    FirmId,
    fraction,
    ladderRungSchema,
    ladderRungsSchema,
    type Plan,
    type PlanId,
    resolveAffordableRisk,
    resolveFundedTradeRisk,
    RungSizing,
    stopLossCountSchema,
    stopTargetDollarsSchema,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type Rng } from '~/lib/prop-calculator/rng';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

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
        expect(resolveAffordableRisk(2000, null, -300)).toBe(2000);
    });

    it('caps at the daily loss limit headroom left today', () => {
        expect(resolveAffordableRisk(2000, 1000, -300)).toBe(700);
    });

    it('caps at the cushion when the cushion is below the headroom', () => {
        expect(resolveAffordableRisk(500, 1000, 0)).toBe(500);
    });
});
