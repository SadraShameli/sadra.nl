import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    funnelDiagnostic,
    FunnelDiagnosticReason,
    FunnelStage,
} from '~/lib/prop-accounts/metrics';
import { dollars, fraction } from '~/lib/prop-calculator/core';
import {
    attemptEconomics,
    fundedValueFrom,
} from '~/lib/prop-calculator/economics';

describe('funnelDiagnostic', () => {
    const modeled = {
        attemptCost: 100,
        averagePayout: 1000,
        passRate: 0.5,
        payoutRate: 0.5,
        payoutsPerPaidFunded: 1,
    };

    it('gives EV per attempt as pass x payout rate x payouts per paid x average payout - cost', () => {
        const result = funnelDiagnostic(modeled, modeled, 10);
        expect(result.reason).toBeNull();
        if (result.reason !== null) return;
        expect(result.modeledEvPerAttempt).toBeCloseTo(
            0.5 * 0.5 * 1 * 1000 - 100,
            6,
        );
        expect(result.realizedEvPerAttempt).toBeCloseTo(
            result.modeledEvPerAttempt,
            6,
        );
    });

    it('returns ModeledFiguresMissing without modeled figures', () => {
        const result = funnelDiagnostic(modeled, null, 10);
        expect(result.reason).toBe(
            FunnelDiagnosticReason.ModeledFiguresMissing,
        );
        expect(result.stages).toBeNull();
    });

    it('swaps one stage at a time from modeled to realized and reports the dollar change per attempt and per month', () => {
        const realized = { ...modeled, payoutRate: 0.25 };
        const result = funnelDiagnostic(realized, modeled, 10);
        expect(result.reason).toBeNull();
        if (result.reason !== null) return;
        const payoutRateRow = result.stages.find(
            (row) => row.stage === FunnelStage.PayoutRate,
        );
        const expectedChange =
            0.5 * 0.25 * 1 * 1000 - 100 - (0.5 * 0.5 * 1 * 1000 - 100);
        expect(payoutRateRow?.dollarChangePerAttempt).toBeCloseTo(
            expectedChange,
            6,
        );
        expect(payoutRateRow?.dollarChangePerMonth).toBeCloseTo(
            expectedChange * 10,
            6,
        );
        const otherStages = result.stages.filter(
            (row) => row.stage !== FunnelStage.PayoutRate,
        );
        for (const row of otherStages) {
            expect(row.dollarChangePerAttempt).toBeCloseTo(0, 6);
        }
    });

    it('ranks stages by the size of their dollar loss per attempt, worst first', () => {
        const realized = {
            ...modeled,
            passRate: 0.4,
            payoutRate: 0.1,
        };
        const result = funnelDiagnostic(realized, modeled, 10);
        expect(result.reason).toBeNull();
        if (result.reason !== null) return;
        expect(result.stages[0]?.stage).toBe(FunnelStage.PayoutRate);
        for (let index = 1; index < result.stages.length; index += 1) {
            const previous = result.stages[index - 1];
            const current = result.stages[index];
            if (previous === undefined || current === undefined) continue;
            expect(previous.dollarChangePerAttempt).toBeLessThanOrEqual(
                current.dollarChangePerAttempt,
            );
        }
    });

    it('takes its EV per attempt from the shared attempt economics for the same factors', () => {
        const figures = {
            attemptCost: 215,
            averagePayout: 1730,
            passRate: 0.37,
            payoutRate: 0.61,
            payoutsPerPaidFunded: 2.4,
        };
        const result = funnelDiagnostic(figures, figures, 10);
        const fundedValue = fundedValueFrom({
            averagePayout: dollars(figures.averagePayout),
            payoutProbabilityGivenFunded: fraction(figures.payoutRate),
            payoutsPerPaidFunded: figures.payoutsPerPaidFunded,
        });
        const economics = attemptEconomics({
            attemptCost: dollars(figures.attemptCost),
            fundedValue: dollars(fundedValue.value ?? 0),
            passProbability: fraction(figures.passRate),
        });
        expect(result.reason).toBeNull();
        expect(economics.value).not.toBeNull();
        expect(result.modeledEvPerAttempt).toBe(
            economics.value?.expectedNetPerAttempt,
        );
        expect(result.realizedEvPerAttempt).toBe(
            economics.value?.expectedNetPerAttempt,
        );
    });

    it('reports invalid figures instead of an EV from a rate outside 0 to 1', () => {
        const result = funnelDiagnostic(
            { ...modeled, passRate: 1.5 },
            modeled,
            10,
        );
        expect(result.reason).toBe(FunnelDiagnosticReason.InvalidFigures);
        expect(result.stages).toBeNull();
        expect(result.modeledEvPerAttempt).toBeNull();
        expect(result.realizedEvPerAttempt).toBeNull();
    });

    it('keeps one product of the four factors, inside the shared economics module', () => {
        const source = readFileSync(
            path.join(
                import.meta.dirname,
                '../../../../../src/lib/prop-accounts/metrics/FunnelDiagnostic.ts',
            ),
            'utf8',
        );
        expect(source).toContain("from '~/lib/prop-calculator/economics'");
        expect(source).toMatch(/\bfundedValueFrom\(/);
        expect(source).toMatch(/\battemptEconomics\(/);
        expect(source).not.toMatch(/\.passRate\s*\*/);
        expect(source).not.toMatch(/\.payoutRate\s*\*/);
        expect(source).not.toMatch(/\.payoutsPerPaidFunded\s*\*/);
    });

    it('swaps the attempt cost as its own stage', () => {
        const realized = { ...modeled, attemptCost: 160 };
        const result = funnelDiagnostic(realized, modeled, 10);
        expect(result.reason).toBeNull();
        if (result.reason !== null) return;
        const costRow = result.stages.find(
            (row) => row.stage === FunnelStage.AttemptCost,
        );
        expect(costRow?.dollarChangePerAttempt).toBeCloseTo(-60, 6);
        expect(costRow?.dollarChangePerMonth).toBeCloseTo(-600, 6);
        expect(result.stages).toHaveLength(5);
    });

    it('returns the untested stages with no noise verdict and their dollar gaps', () => {
        const realized = {
            ...modeled,
            averagePayout: 750,
            payoutsPerPaidFunded: 0.5,
        };
        const result = funnelDiagnostic(realized, modeled, 10);
        expect(result.reason).toBeNull();
        if (result.reason !== null) return;
        expect(result.untestedStages.map((row) => row.stage)).toHaveLength(2);
        expect(result.untestedStages.map((row) => row.stage)).toEqual(
            expect.arrayContaining([
                FunnelStage.AveragePayout,
                FunnelStage.PayoutsPerPaidFunded,
            ]),
        );
        const average = result.untestedStages.find(
            (row) => row.stage === FunnelStage.AveragePayout,
        );
        expect(average?.isBeyondNoise).toBeNull();
        expect(average?.dollarChangePerAttempt).toBeCloseTo(
            0.5 * 0.5 * 1 * 750 - 100 - (0.5 * 0.5 * 1 * 1000 - 100),
            6,
        );
        expect(average?.dollarChangePerMonth).toBeCloseTo(
            (average?.dollarChangePerAttempt ?? 0) * 10,
            6,
        );
        for (const row of result.untestedStages) {
            expect(row.isBeyondNoise).toBeNull();
        }
    });

    it('carries a supplied noise verdict on the tested stages and null on the untested ones', () => {
        const realized = { ...modeled, passRate: 0.3, payoutRate: 0.4 };
        const result = funnelDiagnostic(realized, modeled, 10, {
            [FunnelStage.PassRate]: true,
        });
        expect(result.reason).toBeNull();
        if (result.reason !== null) return;
        const verdictOf = (stage: FunnelStage) =>
            result.stages.find((row) => row.stage === stage)?.isBeyondNoise;
        expect(verdictOf(FunnelStage.PassRate)).toBe(true);
        expect(verdictOf(FunnelStage.PayoutRate)).toBeNull();
        expect(verdictOf(FunnelStage.AttemptCost)).toBeNull();
        expect(verdictOf(FunnelStage.AveragePayout)).toBeNull();
        expect(verdictOf(FunnelStage.PayoutsPerPaidFunded)).toBeNull();
    });

    it('reads a tested stage with no verdict as unknown, not as within noise, and keeps it out of the untested stages', () => {
        const realized = { ...modeled, passRate: 0.3, payoutRate: 0.4 };
        const result = funnelDiagnostic(realized, modeled, 10);
        expect(result.reason).toBeNull();
        if (result.reason !== null) return;
        for (const row of result.stages) {
            expect(row.isBeyondNoise).not.toBe(false);
        }
        expect(result.untestedStages).toHaveLength(2);
        expect(result.untestedStages.map((row) => row.stage)).toEqual(
            expect.arrayContaining([
                FunnelStage.AveragePayout,
                FunnelStage.PayoutsPerPaidFunded,
            ]),
        );
    });

    it('accepts a noise verdict only for the tested stages', () => {
        type Verdicts = NonNullable<Parameters<typeof funnelDiagnostic>[3]>;
        expectTypeOf<FunnelStage.AveragePayout>().not.toExtend<
            keyof Verdicts
        >();
        expectTypeOf<FunnelStage.PayoutsPerPaidFunded>().not.toExtend<
            keyof Verdicts
        >();
        expectTypeOf<FunnelStage.PassRate>().toExtend<keyof Verdicts>();
    });
});
