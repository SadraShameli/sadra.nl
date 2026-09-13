import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    flatDayPolicy,
    fraction,
    RungSizing,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';
import { type Rng } from '~/lib/prop-calculator/rng';
import { simulateTrial } from '~/lib/prop-calculator/simulator/trial';

const firm = new TopStep();

function scriptedRng(draws: readonly number[]): Rng {
    let index = 0;
    return () => {
        const draw = draws[index];
        if (draw === undefined) throw new Error('scripted rng exhausted');
        index += 1;
        return draw;
    };
}

function standardStandardPlan() {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: firm.id,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep Standard-Standard plan not found');
    return plan;
}

const BUST_THEN_PASS_POLICY = flatDayPolicy(150, 1, {
    kind: DayStopRuleKind.None,
});

const LOSING_DAYS_TO_BUST = 14;
const WINNING_DAYS_TO_PASS = 10;

describe('a trial that never passes the evaluation is never billed the activation fee', () => {
    it("a bust-eval trial's totalCost matches feesUntilPass, not totalCostThroughDay", () => {
        const plan = standardStandardPlan();
        expect(plan.fees.activation).toBeGreaterThan(0);

        const bustOnly = simulateTrial({
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: BUST_THEN_PASS_POLICY,
            fundedDayPolicy: BUST_THEN_PASS_POLICY,
            fundedHorizonDays: 1,
            maxAttempts: 1,
            maxEvalDays: 30,
            minRetainedCushion: dollars(0),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: scriptedRng(
                Array.from({ length: LOSING_DAYS_TO_BUST }, () => 0.9),
            ),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        });

        expect(bustOnly.outcome).toBe('bust-eval');
        expect(bustOnly.resetFeesPaid).toBe(0);
        expect(bustOnly.totalCost).toBe(
            plan.feesUntilPass(bustOnly.daysElapsed, undefined),
        );
        expect(bustOnly.totalCost).toBeLessThan(
            plan.totalCostThroughDay(bustOnly.daysElapsed, undefined),
        );
    });

    it("a pass-clean trial's totalCost still includes the activation fee", () => {
        const plan = standardStandardPlan();

        const passed = simulateTrial({
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: BUST_THEN_PASS_POLICY,
            fundedDayPolicy: BUST_THEN_PASS_POLICY,
            fundedHorizonDays: 0,
            maxAttempts: 1,
            maxEvalDays: 30,
            minRetainedCushion: dollars(0),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: scriptedRng(
                Array.from({ length: WINNING_DAYS_TO_PASS }, () => 0.1),
            ),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        });

        expect(passed.outcome).toBe('pass-clean');
        expect(passed.totalCost).toBe(
            plan.totalCostThroughDay(passed.daysElapsed, undefined),
        );
    });
});
