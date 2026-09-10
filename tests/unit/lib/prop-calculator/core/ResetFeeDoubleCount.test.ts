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
import {
    runEvalWithRetries,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';
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
const EVAL_DRAWS = [
    ...Array.from({ length: LOSING_DAYS_TO_BUST }, () => 0.9),
    ...Array.from({ length: WINNING_DAYS_TO_PASS }, () => 0.1),
];

describe("reset-fee cost accounting does not double-count a busted attempt's days against the monthly-subscription bracket", () => {
    it("constructs a real bust-then-pass scenario where cumulative days and the surviving attempt's own days land in different billing months", () => {
        const plan = standardStandardPlan();
        const totals = new TradeTotals();

        const retryResult = runEvalWithRetries({
            commission: dollars(0),
            dayPolicy: BUST_THEN_PASS_POLICY,
            maxAttempts: 2,
            maxEvalDays: 30,
            plan,
            rng: scriptedRng(EVAL_DRAWS),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            totals,
            winrate: fraction(0.5),
        });

        expect(retryResult.terminalOutcome).toBeNull();
        expect(retryResult.attemptsUsed).toBe(2);
        expect(retryResult.attempt.days).toBe(WINNING_DAYS_TO_PASS);
        expect(retryResult.daysElapsed).toBe(
            LOSING_DAYS_TO_BUST + WINNING_DAYS_TO_PASS,
        );
        expect(retryResult.resetFeesPaid).toBe(plan.fees.reset);

        const costWithFix = plan.totalCostThroughDay(
            retryResult.attempt.days,
            undefined,
        );
        const costIfStillDoubleCounted = plan.totalCostThroughDay(
            retryResult.daysElapsed,
            undefined,
        );
        expect(costWithFix).toBeLessThan(costIfStillDoubleCounted);
        expect(costIfStillDoubleCounted - costWithFix).toBe(
            plan.fees.monthlySubscription,
        );
    });

    it("simulateTrial bills against the surviving attempt's own days, not the cumulative day count", () => {
        const plan = standardStandardPlan();

        const result = simulateTrial({
            commission: dollars(0),
            discounts: undefined,
            evalDayPolicy: BUST_THEN_PASS_POLICY,
            fundedDayPolicy: BUST_THEN_PASS_POLICY,
            fundedHorizonDays: 1,
            maxAttempts: 2,
            maxEvalDays: 30,
            minRetainedCushion: dollars(0),
            payoutRequestSize: undefined,
            plan,
            rng: scriptedRng([...EVAL_DRAWS, 0.9]),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        });

        expect(
            result.outcome === 'bust-funded' || result.outcome === 'pass-clean',
        ).toBe(true);

        const expectedEvalCost =
            plan.totalCostThroughDay(WINNING_DAYS_TO_PASS, undefined) +
            plan.fees.reset;
        const buggyEvalCost =
            plan.totalCostThroughDay(
                LOSING_DAYS_TO_BUST + WINNING_DAYS_TO_PASS,
                undefined,
            ) + plan.fees.reset;

        expect(expectedEvalCost).toBeLessThan(buggyEvalCost);
        expect(result.totalCost).toBe(expectedEvalCost);
    });
});
