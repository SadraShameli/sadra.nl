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
const SOURCE_FILE = /\.tsx?$/;
const ACTUAL_VERSUS_ACCEPTED =
    /actualRiskCents\s*[<>]=?\s*[\w.]*acceptedRiskCents|acceptedRiskCents\s*[<>]=?\s*[\w.]*actualRiskCents|Math\.abs\([\w.]*actualRiskCents\s*-\s*[\w.]*acceptedRiskCents\)/g;

function comparisonCountsBySourceFile(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const file of sourceFiles(SOURCE_ROOT)) {
        const count = readFileSync(file, 'utf8').match(
            ACTUAL_VERSUS_ACCEPTED,
        )?.length;
        if (count !== undefined) {
            counts.set(path.relative(SOURCE_ROOT, file), count);
        }
    }
    return counts;
}

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

describe('one violation form (PT-27c, F-V20)', () => {
    it('defines the violation form once, in the account page violations section, and the weekly review renders it', () => {
        expect(
            filesMatching(ACCOUNTS_ROOT, /\bfunction \w*ViolationForm\b/),
        ).toEqual(['_components/detail/ViolationsSection.tsx']);
        expect(
            filesMatching(ACCOUNTS_ROOT, /(?<!function )violationFormSchema\(/),
        ).toEqual(['_components/detail/ViolationsSection.tsx']);
        expect(
            filesMatching(
                path.join(ACCOUNTS_ROOT, 'review'),
                /<ViolationForm\b/,
            ),
        ).toEqual(['WeeklyReviewView.tsx']);
    });

    it('leaves the violation mutations to the form: the weekly review runs none of its own', () => {
        expect(
            filesMatching(
                path.join(ACCOUNTS_ROOT, 'review'),
                /violation\.(?:create|update)\.useMutation\(/,
            ),
        ).toEqual([]);
    });
});

describe('one followed rule (PT-27c, F-V20)', () => {
    it('keeps the weekly review model free of its own comparison of actual against accepted risk', () => {
        const model = readFileSync(
            path.join(ACCOUNTS_ROOT, 'review', 'weeklyReviewModel.ts'),
            'utf8',
        );
        expect(model.match(ACTUAL_VERSUS_ACCEPTED)).toBeNull();
        expect(model).toContain('isDecisionFollowed');
        expect(model).toContain('decisionAdherenceOf');
    });

    it('renders the log-violation offer from the model alone: the weekly review view never re-derives it from the adherence', () => {
        const view = readFileSync(
            path.join(ACCOUNTS_ROOT, 'review', 'WeeklyReviewView.tsx'),
            'utf8',
        );
        expect(view).toContain('row.violationOffer');
        expect(view).not.toContain('isViolationLogged');
        expect(view).not.toContain('lastDecision?.adherence');
        expect(view).not.toContain('lastDecision.isAboveAccepted');
    });

    it('compares actual against accepted risk only in the adherence band and the one exceedance predicate, once each', () => {
        expect(comparisonCountsBySourceFile()).toEqual(
            new Map([
                ['lib/prop-accounts/conduct/BustDiagnosis.ts', 1],
                ['lib/prop-accounts/metrics/DecisionAdherence.ts', 1],
            ]),
        );
    });
});
