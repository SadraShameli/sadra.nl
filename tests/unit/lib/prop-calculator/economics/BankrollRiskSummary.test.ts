import { describe, expect, it } from 'vitest';

import { fraction } from '~/lib/prop-calculator/core';
import {
    bankrollLossRiskSummary,
    EconomicsDisclosure,
} from '~/lib/prop-calculator/economics';

const THREE_POINT_NETS = [
    ...Array.from({ length: 80 }, () => -250),
    ...Array.from({ length: 15 }, () => 500),
    ...Array.from({ length: 5 }, () => 10_000),
];
const THREE_POINT_COST = 250;
const BOOTSTRAP_FLOOR_ATTEMPTS = 59;
const TOY_NETS = [-100, -100, -100, -100, 900];
const TOY_CLOSED_FORM_ATTEMPTS = 44;
const TOY_TOLERANCE_ATTEMPTS = 3;

function minimumAttemptsOf(
    nets: readonly number[],
    cost: number,
    threshold: number,
    seed?: number,
): number {
    const attempts = bankrollLossRiskSummary(
        nets,
        cost,
        fraction(threshold),
        seed,
    ).minimumBudget.value?.attempts;
    if (attempts === undefined) throw new Error('no minimum budget');
    return attempts;
}

describe('bankrollLossRiskSummary (PT-62d)', () => {
    it('does not report NaN attempts when the attempt cost is zero', () => {
        const summary = bankrollLossRiskSummary(
            [100, 100, 100],
            0,
            fraction(0.5),
        );
        expect(summary.minimumBudget.value).not.toBeNull();
        if (summary.minimumBudget.value === null)
            throw new Error('unreachable');
        expect(Number.isNaN(summary.minimumBudget.value.attempts)).toBe(false);
        expect(summary.minimumBudget.value.attempts).toBe(0);
        expect(summary.minimumBudget.value.budget).toBe(0);
    });
});

describe('bankrollLossRiskSummary keys the minimum budget on the compound distribution (PT-80)', () => {
    it('needs more attempts than a bootstrap of the nets can get under the threshold with, for dispersed payouts', () => {
        expect(
            minimumAttemptsOf(THREE_POINT_NETS, THREE_POINT_COST, 0.05),
        ).toBeGreaterThanOrEqual(BOOTSTRAP_FLOOR_ATTEMPTS);
    });

    it('still gives the closed-form attempts on the two-point toy, within the Monte Carlo tolerance', () => {
        expect(
            Math.abs(
                minimumAttemptsOf(TOY_NETS, 100, 0.05) -
                    TOY_CLOSED_FORM_ATTEMPTS,
            ),
        ).toBeLessThanOrEqual(TOY_TOLERANCE_ATTEMPTS);
    });

    it('keeps the one-value binomial only as a labelled cross-check at the budget attempts', () => {
        const summary = bankrollLossRiskSummary(
            THREE_POINT_NETS,
            THREE_POINT_COST,
            fraction(0.05),
        );
        expect(summary.closedFormCrossCheck?.value).not.toBeNull();
        expect(summary.closedFormCrossCheck?.disclosures).toContain(
            EconomicsDisclosure.OneValuePerPayingAttempt,
        );
        expect(summary.closedFormCrossCheck?.value).toBeLessThan(0.05);
    });

    it('has no cross-check when there is no minimum budget', () => {
        expect(
            bankrollLossRiskSummary(THREE_POINT_NETS, THREE_POINT_COST, null)
                .closedFormCrossCheck,
        ).toBeNull();
    });

    it('is deterministic per seed and builds one curve inside the test limit', () => {
        const started = performance.now();
        const first = minimumAttemptsOf(
            THREE_POINT_NETS,
            THREE_POINT_COST,
            0.05,
            4,
        );
        expect(performance.now() - started).toBeLessThan(4000);
        expect(
            minimumAttemptsOf(THREE_POINT_NETS, THREE_POINT_COST, 0.05, 4),
        ).toBe(first);
    });
});
