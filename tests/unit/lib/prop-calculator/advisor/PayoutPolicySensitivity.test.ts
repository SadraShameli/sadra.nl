import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    LifetimePayoutCapBasis,
    OPTIMUM_MISSING_DISCLOSURE,
    PAYOUT_POLICY_SENSITIVE_NOTE,
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

    it('compares the two orders over the same plans: documented 300 without an optimum, 200 and 100 in the same optimum order is not sensitive (PT-113)', () => {
        const ranked = payoutPolicySensitivity([
            entry('top', 300, null),
            entry('middle', 200, 250),
            entry('bottom', 100, 150),
        ]);
        const byKey = new Map(ranked.map((e) => [e.planKey, e]));
        expect(byKey.get('top')?.documentedRank).toBe(1);
        expect(byKey.get('top')?.optimumRank).toBeNull();
        expect(byKey.get('middle')?.documentedRank).toBe(2);
        expect(byKey.get('middle')?.optimumRank).toBe(1);
        expect(
            ranked.filter((e) => e.payoutPolicySensitive).map((e) => e.planKey),
        ).toEqual([]);
    });
});

describe('payout policy sensitivity texts (PT-113)', () => {
    it.each([
        ['OPTIMUM_MISSING_DISCLOSURE', OPTIMUM_MISSING_DISCLOSURE],
        ['PAYOUT_POLICY_SENSITIVE_NOTE', PAYOUT_POLICY_SENSITIVE_NOTE],
    ])('keeps one copy of %s in src', (_name, text) => {
        const copies = sourceFilesUnder(path.resolve('src')).filter((file) =>
            readFileSync(file, 'utf8').includes(text),
        );
        expect(copies).toEqual([
            path.resolve(
                'src/lib/prop-calculator/advisor/PayoutPolicySensitivity.ts',
            ),
        ]);
    });
});

function sourceFilesUnder(directory: string): readonly string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((dirent) => dirent.isFile() && /\.tsx?$/.test(dirent.name))
        .map((dirent) => path.join(dirent.parentPath, dirent.name));
}
