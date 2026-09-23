import { describe, expect, it } from 'vitest';

import {
    ConsistencyBasis,
    ConsistencyBoundary,
    ConsistencyNonPositiveProfit,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
    fraction,
} from '~/lib/prop-calculator/core';

function ruleWith(
    boundary?: ConsistencyBoundary,
    nonPositiveProfit?: ConsistencyNonPositiveProfit,
): ConsistencyRule {
    return new ConsistencyRule(
        ConsistencyScope.Funded,
        fraction(0.4),
        ConsistencyBasis.Cycle,
        ConsistencyViolationEffect.Fail,
        boundary,
        nonPositiveProfit,
    );
}

describe('ConsistencyRule defaults keep the exclusive "exceeds" boundary and exempt non-positive profit', () => {
    const rule = new ConsistencyRule(ConsistencyScope.Funded, fraction(0.4));

    it('defaults to an exclusive boundary and passes on non-positive profit', () => {
        expect(rule.boundary).toBe(ConsistencyBoundary.Exclusive);
        expect(rule.nonPositiveProfit).toBe(
            ConsistencyNonPositiveProfit.Passes,
        );
    });

    it.each([
        { best: 400, expected: false, total: 1000 },
        { best: 401, expected: true, total: 1000 },
        { best: 399, expected: false, total: 1000 },
        { best: 0, expected: false, total: 1000 },
        { best: 500, expected: false, total: 0 },
        { best: 500, expected: false, total: -250 },
        { best: 0, expected: false, total: -250 },
    ])(
        'best day $best on profit $total is violated: $expected',
        ({ best, expected, total }) => {
            expect(rule.isViolated(best, total)).toBe(expected);
        },
    );
});

describe('ConsistencyBoundary.Inclusive fails a best day at exactly the share', () => {
    const rule = ruleWith(ConsistencyBoundary.Inclusive);

    it.each([
        { best: 400, expected: true, total: 1000 },
        { best: 800, expected: true, total: 2000 },
        { best: 399.99, expected: false, total: 1000 },
        { best: 401, expected: true, total: 1000 },
        { best: 0, expected: false, total: 1000 },
    ])(
        'best day $best on profit $total is violated: $expected',
        ({ best, expected, total }) => {
            expect(rule.isViolated(best, total)).toBe(expected);
        },
    );

    it('still passes non-positive profit when that option is left at its default', () => {
        expect(rule.isViolated(500, -250)).toBe(false);
        expect(rule.isViolated(0, 0)).toBe(false);
    });
});

describe('ConsistencyNonPositiveProfit.Violates fails a measured profit at or below zero', () => {
    const rule = ruleWith(undefined, ConsistencyNonPositiveProfit.Violates);

    it.each([
        { best: 500, total: -250 },
        { best: 0, total: -250 },
        { best: 0, total: 0 },
        { best: 1200, total: 0 },
        { best: 0, total: -0.01 },
    ])('best day $best on profit $total is violated', ({ best, total }) => {
        expect(rule.isViolated(best, total)).toBe(true);
    });

    it('keeps the exclusive boundary on positive profit', () => {
        expect(rule.isViolated(400, 1000)).toBe(false);
        expect(rule.isViolated(401, 1000)).toBe(true);
    });

    it('does not violate a positive profit whose best day is zero or negative', () => {
        expect(rule.isViolated(0, 1000)).toBe(false);
        expect(rule.isViolated(-100, 1000)).toBe(false);
    });
});

describe('both options together', () => {
    const rule = ruleWith(
        ConsistencyBoundary.Inclusive,
        ConsistencyNonPositiveProfit.Violates,
    );

    it.each([
        { best: 400, expected: true, total: 1000 },
        { best: 399, expected: false, total: 1000 },
        { best: 0, expected: true, total: 0 },
        { best: 300, expected: true, total: -1 },
    ])(
        'best day $best on profit $total is violated: $expected',
        ({ best, expected, total }) => {
            expect(rule.isViolated(best, total)).toBe(expected);
        },
    );
});

describe('ConsistencyRule.shareLabel shows the boundary and the net-losing cycle rule from the rule itself', () => {
    it.each([
        {
            boundary: ConsistencyBoundary.Exclusive,
            expected: '40%',
            nonPositiveProfit: ConsistencyNonPositiveProfit.Passes,
        },
        {
            boundary: ConsistencyBoundary.Inclusive,
            expected: '40% (inclusive)',
            nonPositiveProfit: ConsistencyNonPositiveProfit.Passes,
        },
        {
            boundary: ConsistencyBoundary.Exclusive,
            expected: '40% (fails on a net-losing cycle)',
            nonPositiveProfit: ConsistencyNonPositiveProfit.Violates,
        },
        {
            boundary: ConsistencyBoundary.Inclusive,
            expected: '40% (inclusive, fails on a net-losing cycle)',
            nonPositiveProfit: ConsistencyNonPositiveProfit.Violates,
        },
    ])(
        '$boundary boundary with $nonPositiveProfit non-positive profit reads "$expected"',
        ({ boundary, expected, nonPositiveProfit }) => {
            expect(ruleWith(boundary, nonPositiveProfit).shareLabel()).toBe(
                expected,
            );
        },
    );

    it.each([
        { expected: '30%', share: 0.3 },
        { expected: '33.33%', share: 1 / 3 },
        { expected: '50%', share: 0.5 },
        { expected: '15%', share: 0.15 },
    ])('prints a $share share as $expected', ({ expected, share }) => {
        expect(
            new ConsistencyRule(
                ConsistencyScope.Eval,
                fraction(share),
            ).shareLabel(),
        ).toBe(expected);
    });
});
