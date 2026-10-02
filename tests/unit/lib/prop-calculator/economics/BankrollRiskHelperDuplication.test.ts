import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

function occurrences(text: string, pattern: RegExp): number {
    return (text.match(new RegExp(pattern, 'g')) ?? []).length;
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
        expect(leversText).toMatch(
            /import\s*{[^}]*LOSS_RISK_DRAWS[^}]*}\s*from\s*'\.\/CohortOutcome'/,
        );
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
        const summaryText = textOf(
            'src/lib/prop-calculator/economics/BankrollRiskSummary.ts',
        );
        const modelText = textOf(
            'src/app/(app)/prop-calculator/_components/bankroll/bankrollModel.ts',
        );
        for (const text of [summaryText, modelText]) {
            expect(occurrences(text, /function meanOf\(/)).toBe(0);
        }
        expect(summaryText).toMatch(
            /import\s*{[^}]*mean[^}]*}\s*from\s*'~\/lib\/prop-calculator\/stats'/,
        );
        expect(modelText).toMatch(
            /import\s*{[^}]*mean[^}]*}\s*from\s*'~\/lib\/prop-calculator\/stats'/,
        );
    });
});

describe('one bankroll loss-risk helper (PT-63b)', () => {
    const ASSEMBLING_CALLS = /\b(attemptsAffordable|cohortOutcome|noPayoutProbability)\(/;
    const KNOWN_ASSEMBLERS = [
        'src/app/(app)/prop-calculator/_workers/toolsWorker.ts',
        'src/cli/commands/prop/bankroll/batch.ts',
        'src/cli/commands/prop/sim/command.ts',
        'src/lib/prop-accounts/bankroll/RealizedLossRisk.ts',
        'src/lib/prop-accounts/bankroll/RoundReturns.ts',
        'src/lib/prop-accounts/planning/NextSlotAllocation.ts',
        'src/lib/prop-calculator/economics/BankrollLevers.ts',
        'src/lib/prop-calculator/economics/BankrollRiskFigures.ts',
        'src/lib/prop-calculator/economics/CohortOutcome.ts',
        'src/lib/prop-calculator/economics/LossRisk.ts',
    ];
    const CALLERS = [
        'src/cli/commands/prop/bankroll/risk.ts',
        'src/cli/commands/prop/compare/command.ts',
        'src/app/(app)/prop-calculator/_components/OptimalRiskTable.tsx',
        'src/app/(app)/prop-calculator/_components/bankroll/bankrollModel.ts',
    ];

    it('lives in the economics barrel and not in the advisor policy folder', () => {
        const barrel = textOf('src/lib/prop-calculator/economics/index.ts');
        expect(barrel).toMatch(
            /bankrollRiskFigures[^}]*}\s*from\s*'\.\/BankrollRiskFigures'/,
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
        const helperText = textOf(
            'src/lib/prop-calculator/economics/BankrollRiskFigures.ts',
        );
        expect(helperText).toMatch(/attemptsAffordable\(/);
        expect(helperText).toMatch(/cohortOutcome\(/);
        expect(helperText).toMatch(/noPayoutProbability\(/);
        for (const caller of CALLERS) {
            expect(textOf(caller), caller).not.toMatch(ASSEMBLING_CALLS);
        }
    });

    it('lets no new src file assemble the three figures: the files that still do are pinned and may only shrink', () => {
        const SRC_ROOT = path.join(REPO_ROOT, 'src');
        const found = readdirSync(SRC_ROOT, {
            recursive: true,
            withFileTypes: true,
        })
            .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
            .map((entry) => path.join(entry.parentPath, entry.name))
            .filter((file) => ASSEMBLING_CALLS.test(readFileSync(file, 'utf8')))
            .map((file) => path.relative(REPO_ROOT, file))
            .toSorted((a, b) => a.localeCompare(b));
        expect(found).toStrictEqual(
            KNOWN_ASSEMBLERS.toSorted((a, b) => a.localeCompare(b)),
        );
    });

    it('is the only place the tools worker prices a bankroll for the same-EV card', () => {
        const workerText = textOf(
            'src/app/(app)/prop-calculator/_workers/toolsWorker.ts',
        );
        expect(workerText).not.toMatch(/\b(attemptsAffordable|noPayoutProbability)\(/);
        expect(workerText).toMatch(/bankrollRisk\(/);
    });
});
