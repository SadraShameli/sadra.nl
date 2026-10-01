import { readFileSync } from 'node:fs';
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
        for (const text of [riskText, batchText, workerText]) {
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
