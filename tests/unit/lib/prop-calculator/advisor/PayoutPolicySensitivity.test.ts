import { describe, expect, it } from 'vitest';

import {
    LifetimePayoutCapBasis,
    payoutPolicySensitivity,
    type PayoutPolicySensitivityPlanEntry,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { PayoutRequestPolicy } from '~/lib/prop-calculator/core';

function entry(
    planKey: string,
    documentedMonthlyNet: number,
    optimumMonthlyNet: null | number,
): PayoutPolicySensitivityPlanEntry {
    return {
        documented: { monthlyNet: documentedMonthlyNet, standardError: 10 },
        labels: labels(),
        optimum:
            optimumMonthlyNet === null
                ? null
                : { monthlyNet: optimumMonthlyNet, standardError: 10 },
        planKey,
    };
}

function labels() {
    return {
        lifetimeCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
        payoutPolicy: PayoutRequestPolicy.FullRequestOnly,
        retainedCushion: 2000,
        startBasis: StartBasis.Fresh,
        trials: 500,
    };
}

function ranksOf(
    ranked: readonly { documentedRank: number; planKey: string }[],
): Map<string, number> {
    return new Map(ranked.map((e) => [e.planKey, e.documentedRank]));
}

describe('payoutPolicySensitivity (PT-32)', () => {
    it('ranks plans by documented monthly net, best first', () => {
        const ranked = payoutPolicySensitivity([
            entry('a', 100, 100),
            entry('b', 300, 300),
            entry('c', 200, 200),
        ]);
        expect(
            ranked
                .toSorted((x, y) => x.documentedRank - y.documentedRank)
                .map((e) => e.planKey),
        ).toStrictEqual(['b', 'c', 'a']);
    });

    it('marks payout-policy sensitive exactly when the documented and optimum ranks differ', () => {
        const ranked = payoutPolicySensitivity([
            entry('a', 100, 300),
            entry('b', 300, 100),
            entry('c', 200, 200),
        ]);
        const byKey = new Map(ranked.map((e) => [e.planKey, e]));
        expect(byKey.get('a')?.payoutPolicySensitive).toBe(true);
        expect(byKey.get('b')?.payoutPolicySensitive).toBe(true);
        expect(byKey.get('c')?.payoutPolicySensitive).toBe(false);
    });

    it('breaks a tie deterministically by plan key', () => {
        const first = payoutPolicySensitivity([
            entry('b', 100, 100),
            entry('a', 100, 100),
        ]);
        const second = payoutPolicySensitivity([
            entry('a', 100, 100),
            entry('b', 100, 100),
        ]);
        expect(ranksOf(first)).toStrictEqual(ranksOf(second));
        expect(ranksOf(first).get('a')).toBe(1);
        expect(ranksOf(first).get('b')).toBe(2);
    });

    it('reports a plan with no optimum (every size refused) instead of dropping it', () => {
        const ranked = payoutPolicySensitivity([
            entry('a', 100, null),
            entry('b', 300, 300),
        ]);
        const byKey = new Map(ranked.map((e) => [e.planKey, e]));
        expect(byKey.get('a')?.optimum).toBeNull();
        expect(byKey.get('a')?.optimumRank).toBeNull();
        expect(byKey.get('a')?.documentedRank).toBe(2);
        expect(byKey.get('a')?.payoutPolicySensitive).toBe(false);
        expect(byKey.get('b')?.optimumRank).toBe(1);
    });
});
