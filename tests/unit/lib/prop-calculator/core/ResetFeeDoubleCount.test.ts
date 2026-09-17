import { describe, expect, it } from 'vitest';

import {
    DayStopRuleKind,
    dollars,
    flatDayPolicy,
    fraction,
    percent,
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

describe('eval-retry cost accounting is monotonic: more elapsed days plus a real reset-fee purchase can never make totalCost go down', () => {
    it("bills the monthly-subscription bracket off the true cumulative days across every attempt, not just the surviving attempt's own days", () => {
        const plan = standardStandardPlan();
        const totals = new TradeTotals();

        const retryResult = runEvalWithRetries({
            commission: dollars(0),
            dayPolicy: BUST_THEN_PASS_POLICY,
            maxAttempts: 2,
            maxEvalDays: 30,
            plan,
            positionSizing: null,
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

        const costBilledOffCumulativeDays = plan.totalCostThroughDay(
            retryResult.daysElapsed,
            undefined,
        );
        const costBilledOffSurvivingAttemptOnly = plan.totalCostThroughDay(
            retryResult.attempt.days,
            undefined,
        );
        expect(costBilledOffCumulativeDays).toBeGreaterThan(
            costBilledOffSurvivingAttemptOnly,
        );
    });

    it('never lets a busted-attempt-plus-reset-plus-pass trial cost less than a shorter trial that only busted once and never reset', () => {
        const plan = standardStandardPlan();

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

        const bustThenResetThenPass = simulateTrial({
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
            positionSizing: null,
            rng: scriptedRng([...EVAL_DRAWS, 0.9]),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        });
        expect(bustThenResetThenPass.resetFeesPaid).toBe(plan.fees.reset);
        expect(bustThenResetThenPass.daysElapsed).toBeGreaterThan(
            bustOnly.daysElapsed,
        );

        expect(bustThenResetThenPass.totalCost).toBeGreaterThanOrEqual(
            bustOnly.totalCost,
        );
    });
});

describe('a real resetPercent discount reaches resetFeesPaid end-to-end', () => {
    it('runEvalWithRetries discounts the accumulated reset fee by resetPercent', () => {
        const plan = standardStandardPlan();
        const totals = new TradeTotals();

        const retryResult = runEvalWithRetries({
            commission: dollars(0),
            dayPolicy: BUST_THEN_PASS_POLICY,
            discounts: {
                activationPercent: percent(0),
                evalPercent: percent(0),
                resetPercent: percent(40),
            },
            maxAttempts: 2,
            maxEvalDays: 30,
            plan,
            positionSizing: null,
            rng: scriptedRng(EVAL_DRAWS),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            totals,
            winrate: fraction(0.5),
        });

        expect(retryResult.resetFeesPaid).toBe(plan.fees.reset * 0.6);
    });

    it("simulateTrial forwards discounts through to the eval retry loop's resetFeesPaid", () => {
        const plan = standardStandardPlan();

        const bustThenResetThenPass = simulateTrial({
            commission: dollars(0),
            discounts: {
                activationPercent: percent(0),
                evalPercent: percent(0),
                resetPercent: percent(40),
            },
            evalDayPolicy: BUST_THEN_PASS_POLICY,
            fundedDayPolicy: BUST_THEN_PASS_POLICY,
            fundedHorizonDays: 1,
            maxAttempts: 2,
            maxEvalDays: 30,
            minRetainedCushion: dollars(0),
            payoutRequestSize: undefined,
            plan,
            positionSizing: null,
            rng: scriptedRng([...EVAL_DRAWS, 0.9]),
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            shouldCaptureEquity: false,
            winrate: fraction(0.5),
        });

        expect(bustThenResetThenPass.resetFeesPaid).toBe(plan.fees.reset * 0.6);
    });
});
