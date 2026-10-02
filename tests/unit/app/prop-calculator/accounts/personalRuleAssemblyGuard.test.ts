import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const ACCOUNTS_ROOT = path.join(
    SOURCE_ROOT,
    'app',
    '(app)',
    'prop-calculator',
    'accounts',
);
const REVIEW_ROOT = path.join(ACCOUNTS_ROOT, 'review');
const ADVICE_ADAPTERS_ROOT = path.join(
    SOURCE_ROOT,
    'lib',
    'prop-accounts',
    'advice',
);
const SOURCE_FILE = /\.tsx?$/;

function filesMatching(root: string, pattern: RegExp): string[] {
    return sourceFiles(root)
        .map((file) => path.relative(root, file))
        .filter((relative) =>
            pattern.test(readFileSync(path.join(root, relative), 'utf8')),
        )
        .toSorted((left, right) => left.localeCompare(right));
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

describe('one personal-rule assembly beyond accounts/_components (PT-68c, F-V16)', () => {
    it('builds no sizing advisor of its own in the weekly review: it goes through personalRuleOptions', () => {
        expect(filesMatching(REVIEW_ROOT, /\bcreateSizingAdvisor\(/)).toEqual(
            [],
        );
        expect(
            filesMatching(REVIEW_ROOT, /\bpersonalAdvisorOptionsOf\(/),
        ).toEqual(['weeklyReviewModel.ts']);
    });

    it('reads no personal rule field in the weekly review beyond the one the reconstruction takes', () => {
        const personalRuleFields = [
            'dailyLossLimitCents',
            'dailyProfitCapCents',
            'maxTradesPerDay',
            'payoutRequestOverrideCents',
            'retainedCushionCents',
        ];
        for (const field of personalRuleFields) {
            expect(filesMatching(REVIEW_ROOT, new RegExp(field))).toEqual([]);
        }
    });

    it('defines no optionalDollars in the weekly review: it reads the one in ~/lib/prop-accounts (PT-68d)', () => {
        expect(
            filesMatching(REVIEW_ROOT, /function optionalDollars\b/),
        ).toEqual([]);
    });

    it('clamps no rung to the personal max risk in the weekly review: the advisor caps it in one place (PT-68d)', () => {
        expect(filesMatching(REVIEW_ROOT, /Math\.min\(\s*rung\.risk/)).toEqual(
            [],
        );
        expect(filesMatching(REVIEW_ROOT, /advisor\.caps\(\)/)).toEqual([]);
    });

    it('converts an optional stored cents amount to dollars once across the advice adapters', () => {
        expect(
            filesMatching(ADVICE_ADAPTERS_ROOT, /function optionalDollars\b/),
        ).toEqual(['AdvisorInputsAdapter.ts']);
    });
});
