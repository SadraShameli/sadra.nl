import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as policy from '~/lib/prop-calculator/advisor/policy';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../../..');
const POLICY_SPECIFIER = '~/lib/prop-calculator/advisor/policy';
const IMPORT_BLOCK = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g;

const LABEL_IMPORTERS = [
    'src/app/(app)/prop-calculator/_components/copySplitModel.ts',
    'src/app/(app)/prop-calculator/_components/objectiveRanking.ts',
    'src/cli/commands/prop/ladder/command.ts',
    'src/cli/commands/prop/shared.ts',
];
const RISK_FIGURES_IMPORTERS = [
    'src/app/(app)/prop-calculator/_components/OptimalRiskTable.tsx',
];
const ECONOMICS_SPECIFIER = '~/lib/prop-calculator/economics';
const SHARED_PRICING_IMPORTERS = [
    'src/app/(app)/prop-calculator/_components/objectiveRanking.ts',
    'src/cli/commands/prop/compare/command.ts',
];
const SHARED_PRICING_NAMES = ['priceBatchLoss', 'rankRuinFirst'];
const POLICY_PRICING_NAMES = [
    ...SHARED_PRICING_NAMES,
    'bankrollRiskFigures',
    'BankrollRiskFigures',
];

function namesImportedFrom(relativePath: string, specifier: string): string[] {
    const text = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    return text
        .matchAll(IMPORT_BLOCK)
        .filter((match) => match[2] === specifier)
        .flatMap((match) =>
            (match[1] ?? '')
                .split(',')
                .map((name) => name.trim().replace(/^type\s+/, ''))
                .filter((name) => name !== ''),
        )
        .toArray();
}

describe('the advisor policy barrel drops its compatibility re-exports (PT-63c)', () => {
    it('no longer re-exports SIZING_OBJECTIVE_LABEL, which lives in the advisor barrel', () => {
        expect(policy).not.toHaveProperty('SIZING_OBJECTIVE_LABEL');
    });

    it('no longer re-exports bankrollRiskFigures, which lives in the economics barrel', () => {
        expect(policy).not.toHaveProperty('bankrollRiskFigures');
    });

    it.each(LABEL_IMPORTERS)(
        '%s takes SIZING_OBJECTIVE_LABEL from the advisor barrel',
        (file) => {
            expect(namesImportedFrom(file, POLICY_SPECIFIER)).not.toContain(
                'SIZING_OBJECTIVE_LABEL',
            );
            expect(
                namesImportedFrom(file, '~/lib/prop-calculator/advisor'),
            ).toContain('SIZING_OBJECTIVE_LABEL');
        },
    );

    it.each(RISK_FIGURES_IMPORTERS)(
        '%s takes the bankroll risk figures from the economics barrel',
        (file) => {
            const fromPolicy = namesImportedFrom(file, POLICY_SPECIFIER);
            expect(fromPolicy).not.toContain('bankrollRiskFigures');
            expect(fromPolicy).not.toContain('BankrollRiskFigures');
            const fromEconomics = namesImportedFrom(file, ECONOMICS_SPECIFIER);
            expect(fromEconomics).toContain('bankrollRiskFigures');
            expect(fromEconomics).toContain('BankrollRiskFigures');
        },
    );

    it.each(SHARED_PRICING_IMPORTERS)(
        '%s prices and ranks ruin-first through the economics barrel',
        (file) => {
            const fromPolicy = namesImportedFrom(file, POLICY_SPECIFIER);
            for (const name of POLICY_PRICING_NAMES) {
                expect(fromPolicy).not.toContain(name);
            }
            const fromEconomics = namesImportedFrom(file, ECONOMICS_SPECIFIER);
            for (const name of SHARED_PRICING_NAMES) {
                expect(fromEconomics).toContain(name);
            }
        },
    );
});
