import { describe, expect, it } from 'vitest';

import {
    funnelDiagnostic,
    FunnelDiagnosticReason,
    FunnelStage,
} from '~/lib/prop-accounts/metrics';

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
});
