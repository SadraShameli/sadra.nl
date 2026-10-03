import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

interface SourceFile {
    file: string;
    text: string;
}

function filesCalling(sources: readonly SourceFile[], call: RegExp): string[] {
    return sources
        .filter(({ text }) => call.test(text))
        .map(({ file }) => file)
        .toSorted((a, b) => a.localeCompare(b));
}

function occurrences(text: string, pattern: RegExp): number {
    return (text.match(new RegExp(pattern, 'g')) ?? []).length;
}

async function readSourceFiles(): Promise<SourceFile[]> {
    const entries = readdirSync(path.join(REPO_ROOT, 'src'), {
        recursive: true,
        withFileTypes: true,
    }).filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name));
    return Promise.all(
        entries.map(async (entry) => {
            const absolute = path.join(entry.parentPath, entry.name);
            return {
                file: path
                    .relative(REPO_ROOT, absolute)
                    .split(path.sep)
                    .join('/'),
                text: await readFile(absolute, 'utf8'),
            };
        }),
    );
}

function textOf(relativePath: string): string {
    return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('bankroll risk helper duplication (PT-62d)', () => {
    it('defines LOSS_RISK_DRAWS in exactly one place, the shared economics helper', () => {
        const cohortText = textOf(
            'src/lib/prop-calculator/economics/CohortOutcome.ts',
        );
        const leversText = textOf(
            'src/lib/prop-calculator/economics/BankrollLevers.ts',
        );
        const riskText = textOf('src/cli/commands/prop/bankroll/risk.ts');
        const batchText = textOf('src/cli/commands/prop/bankroll/batch.ts');
        const workerText = textOf(
            'src/app/(app)/prop-calculator/_workers/toolsWorker.ts',
        );

        expect(
            occurrences(cohortText, /export const LOSS_RISK_DRAWS = 10_000/),
        ).toBe(1);
        for (const text of [leversText, riskText, batchText, workerText]) {
            expect(occurrences(text, /const LOSS_RISK_DRAWS = 10_000/)).toBe(0);
        }
        for (const text of [batchText, workerText]) {
            expect(text).toMatch(
                /import\s*{[^}]*LOSS_RISK_DRAWS[^}]*}\s*from\s*'~\/lib\/prop-calculator\/economics'/,
            );
        }
    });

    it('ties the closed-form compounding illustration cycle length to TRADING_DAYS_PER_MONTH in exactly one place', () => {
        const summaryText = textOf(
            'src/lib/prop-calculator/economics/BankrollRiskSummary.ts',
        );
        const projectText = textOf('src/cli/commands/prop/bankroll/project.ts');
        const modelText = textOf(
            'src/app/(app)/prop-calculator/_components/bankroll/bankrollModel.ts',
        );

        expect(
            occurrences(summaryText, /TRADING_DAYS_PER_MONTH/),
        ).toBeGreaterThanOrEqual(1);
        expect(occurrences(projectText, /illustrativeCycleDays\s*=\s*21/)).toBe(
            0,
        );
        expect(modelText).not.toMatch(/compoundedBankroll/);
        expect(projectText).toMatch(
            /import\s*{[^}]*bankrollCompoundingIllustration[^}]*}\s*from\s*'~\/lib\/prop-calculator\/economics'/,
        );
    });

    it('carries a P(attempt pays) delta on every bankroll lever row', () => {
        const leversText = textOf(
            'src/lib/prop-calculator/economics/BankrollLevers.ts',
        );
        expect(leversText).toMatch(/deltaAttemptPaysProbability/);
    });

    it('reuses the shared mean helper instead of redeclaring meanOf across the bankroll risk summary and the page model', () => {
        const curveText = textOf(
            'src/lib/prop-calculator/economics/BankrollCurve.ts',
        );
        const modelText = textOf(
            'src/app/(app)/prop-calculator/_components/bankroll/bankrollModel.ts',
        );
        for (const text of [curveText, modelText]) {
            expect(occurrences(text, /function meanOf\(/)).toBe(0);
        }
        expect(curveText).toMatch(
            /import\s*{[^}]*mean[^}]*}\s*from\s*'~\/lib\/prop-calculator\/stats'/,
        );
        expect(modelText).toMatch(
            /import\s*{[^}]*mean[^}]*}\s*from\s*'~\/lib\/prop-calculator\/stats'/,
        );
    });
});

describe('one bankroll loss-risk helper (PT-63b, PT-63d)', () => {
    const ASSEMBLING_CALLS =
        /\b(attemptsAffordable|cohortOutcome|noPayoutProbability)\(/;
    const HELPER = 'src/lib/prop-calculator/economics/BankrollRiskFigures.ts';
    const DEFINITIONS = [
        'src/lib/prop-calculator/economics/CohortOutcome.ts',
        'src/lib/prop-calculator/economics/LossRisk.ts',
    ];
    const CALLERS = [
        'src/app/(app)/prop-calculator/_components/OptimalRiskTable.tsx',
        'src/app/(app)/prop-calculator/_components/bankroll/bankrollModel.ts',
        'src/app/(app)/prop-calculator/_workers/toolsWorker.ts',
        'src/cli/commands/prop/bankroll/batch.ts',
        'src/cli/commands/prop/bankroll/risk.ts',
        'src/cli/commands/prop/compare/command.ts',
        'src/cli/commands/prop/sim/command.ts',
        'src/lib/prop-accounts/bankroll/RealizedLossRisk.ts',
        'src/lib/prop-accounts/bankroll/RoundReturns.ts',
        'src/lib/prop-accounts/planning/NextSlotAllocation.ts',
        'src/lib/prop-calculator/economics/BankrollCurve.ts',
        'src/lib/prop-calculator/economics/BankrollLevers.ts',
    ];

    it('lives in the economics barrel and not in the advisor policy folder', () => {
        const barrel = textOf('src/lib/prop-calculator/economics/index.ts');
        expect(barrel).toMatch(
            /bankrollRiskFigures[^}]*}\s*from\s*'\.\/BankrollRiskFigures'/,
        );
        expect(barrel).toMatch(
            /bankrollCohortRisk[^}]*}\s*from\s*'\.\/BankrollRiskFigures'/,
        );
        expect(
            existsSync(
                path.join(
                    REPO_ROOT,
                    'src/lib/prop-calculator/advisor/policy/BankrollRiskFigures.ts',
                ),
            ),
        ).toBe(false);
    });

    it('is the only place that assembles attemptsAffordable, cohortOutcome and noPayoutProbability for a bankroll', () => {
        const helperText = textOf(HELPER);
        expect(helperText).toMatch(/attemptsAffordable\(/);
        expect(helperText).toMatch(/cohortOutcome\(/);
        expect(helperText).toMatch(/noPayoutProbability\(/);
        for (const caller of CALLERS) {
            expect(textOf(caller), caller).not.toMatch(ASSEMBLING_CALLS);
        }
    });

    it('leaves the three figures defined in the helper and the two economics modules that own them, and nowhere else it names', () => {
        const assemblers = [HELPER, ...DEFINITIONS, ...CALLERS].filter((file) =>
            ASSEMBLING_CALLS.test(textOf(file)),
        );
        expect(assemblers.toSorted((a, b) => a.localeCompare(b))).toStrictEqual(
            [HELPER, ...DEFINITIONS].toSorted((a, b) => a.localeCompare(b)),
        );
    });

    it.each([
        'src/app/(app)/prop-calculator/_workers/toolsWorker.ts',
        'src/cli/commands/prop/bankroll/batch.ts',
        'src/lib/prop-accounts/bankroll/RealizedLossRisk.ts',
        'src/lib/prop-accounts/bankroll/RoundReturns.ts',
    ])('%s prices a batch through bankrollCohortRisk', (file) => {
        expect(textOf(file)).toMatch(/\bbankrollCohortRisk\(/);
    });

    it('lets the bankroll lever rows read the readonly net values without copying them', () => {
        expect(
            textOf('src/lib/prop-calculator/economics/BankrollLevers.ts'),
        ).not.toMatch(/\[\.\.\.[^\]]*netValues\]/);
    });

    it('is the only place the tools worker prices a bankroll for the same-EV card', () => {
        const workerText = textOf(
            'src/app/(app)/prop-calculator/_workers/toolsWorker.ts',
        );
        expect(workerText).not.toMatch(
            /\b(attemptsAffordable|noPayoutProbability)\(/,
        );
        expect(workerText).toMatch(/bankrollRisk\(/);
    });
});

describe('one compound loss-risk curve (PT-80)', () => {
    const CURVE = 'src/lib/prop-calculator/economics/BankrollCurve.ts';
    let sources: SourceFile[] = [];

    beforeAll(async () => {
        sources = await readSourceFiles();
    });

    it('is the only place that scans a loss-target budget, and only on the compound curve', () => {
        expect(
            filesCalling(sources, /\bminimumBudgetForLossTarget\(/),
        ).toStrictEqual([
            CURVE,
            'src/lib/prop-calculator/economics/LossRisk.ts',
        ]);
        expect(textOf(CURVE)).not.toMatch(/\bbatchLossClosedForm\(/);
    });

    it('builds the loss curve in one helper and reaches it only through compoundMinimumBudget', () => {
        expect(filesCalling(sources, /\blossProbabilityCurve\(/)).toStrictEqual(
            [CURVE],
        );
        expect(
            filesCalling(sources, /\bcompoundMinimumBudget\(/),
        ).toStrictEqual([
            'src/lib/prop-accounts/bankroll/RealizedLossRisk.ts',
            CURVE,
            'src/lib/prop-calculator/economics/BankrollRiskSummary.ts',
        ]);
    });

    it('keeps the one-value binomial in the summary only as the cross-check', () => {
        const summaryText = textOf(
            'src/lib/prop-calculator/economics/BankrollRiskSummary.ts',
        );
        expect(occurrences(summaryText, /\bbatchLossClosedForm\(/)).toBe(1);
        expect(summaryText).toMatch(/closedFormCrossCheck/);
        expect(
            textOf('src/lib/prop-accounts/bankroll/RealizedLossRisk.ts'),
        ).not.toMatch(/batchLossClosedForm/);
    });

    it('prices the spend-vs-payout curve through bankrollCohortRisk', () => {
        const text = textOf(CURVE);
        expect(text).toMatch(/\bbankrollCohortRisk\(/);
        expect(text).not.toMatch(/\bcohortOutcome\(/);
    });
});
