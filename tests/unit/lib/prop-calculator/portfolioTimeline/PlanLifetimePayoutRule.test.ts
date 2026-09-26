import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    dollars,
    FirmId,
    flatDayPolicy,
    fraction,
    MffuVariant,
    type Plan,
    type PlanId,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';
import {
    type CardResult,
    runAccountTimeline,
    runEvalToFundedCycle,
} from '~/lib/prop-calculator/portfolioTimeline';
import { type Rng } from '~/lib/prop-calculator/rng';

const alwaysWinRng: Rng = () => 0;
const FUNDED_HORIZON_DAYS = 252;
const LEGACY_PAYOUT_BUDGET = 6;

function at(array: Float64Array, index: number): number {
    const value = array[index];
    if (value === undefined) throw new Error(`index ${index} out of range`);
    return value;
}

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

const topStep50k = planFor({
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
});
const builder50k = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Builder,
});
const apexEod50k = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

function runCard(plan: Plan): CardResult {
    const dayPolicy = flatDayPolicy(500, 1, { kind: DayStopRuleKind.None });
    return runEvalToFundedCycle({
        cardDayBudget: 60,
        commission: dollars(0),
        discounts: undefined,
        evalDayPolicy: dayPolicy,
        fundedDayPolicy: dayPolicy,
        maxEvalDays: 60,
        maxFundedDays: FUNDED_HORIZON_DAYS,
        minRetainedCushion: plan.resolveRetainedCushion(undefined),
        payoutRequestSize: undefined,
        plan,
        positionSizing: null,
        rng: alwaysWinRng,
        rrRatio: 2,
        rungSizing: DEFAULT_RUNG_SIZING,
        winrate: fraction(1),
    });
}

describe('runEvalToFundedCycle: a funded card ends only by bust, the plan lifetime rule or the horizon', () => {
    it('runs a TopStep 50K card with no lifetime payout cap to the horizon with more than 6 payouts', () => {
        expect(topStep50k.maxLifetimePayouts).toBeNull();
        expect(topStep50k.payoutLadder).toBeNull();
        const card = runCard(topStep50k);
        expect(card.payouts.length).toBeGreaterThan(LEGACY_PAYOUT_BUDGET);
        expect(card.totalDays).toBe(card.evalDays + FUNDED_HORIZON_DAYS);
    });

    it('concludes a TopStep 50K card after exactly 9 payouts when the plan caps lifetime payouts at 9', () => {
        const card = runCard(topStep50k.withMaxLifetimePayouts(9));
        expect(card.payouts.length).toBe(9);
        expect(card.totalDays).toBeLessThan(
            card.evalDays + FUNDED_HORIZON_DAYS,
        );
    });

    it("still honours MFF Builder 50K's own lifetime payout cap", () => {
        const card = runCard(builder50k);
        expect(builder50k.maxLifetimePayouts).toBe(5);
        expect(card.payouts.length).toBe(builder50k.maxLifetimePayouts);
    });

    it("still honours Apex EOD 50K's own lifetime payout cap of 6", () => {
        const card = runCard(apexEod50k);
        expect(apexEod50k.maxLifetimePayouts).toBe(6);
        expect(card.payouts.length).toBe(6);
    });
});

describe('runAccountTimeline: no synthetic card restart after 6 payouts', () => {
    it('keeps spend flat after the first TopStep 50K eval and books more than 6 payout days over the horizon', () => {
        const result = runAccountTimeline({
            dayBudget: FUNDED_HORIZON_DAYS,
            dayStop: { kind: DayStopRuleKind.None },
            maxEvalDays: 60,
            plan: topStep50k,
            riskPerTrade: 500,
            rng: alwaysWinRng,
            rrRatio: 2,
            tradesPerDay: 1,
            winrate: 1,
        });

        expect(at(result.cumulativeSpend, FUNDED_HORIZON_DAYS)).toBe(
            at(result.cumulativeSpend, 30),
        );

        let payoutDays = 0;
        for (let day = 1; day <= FUNDED_HORIZON_DAYS; day++) {
            if (
                at(result.cumulativePayout, day) >
                at(result.cumulativePayout, day - 1)
            ) {
                payoutDays += 1;
            }
        }
        expect(payoutDays).toBeGreaterThan(LEGACY_PAYOUT_BUDGET);
    });
});
