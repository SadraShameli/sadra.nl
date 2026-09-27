import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

const OWNED_FILES = [
    'src/lib/prop-calculator/economics/EdgePlausibilityText.ts',
    'src/cli/commands/prop/shared.ts',
    'src/app/(app)/prop-calculator/_components/TradingInputs.tsx',
    'src/app/(app)/prop-calculator/accounts/rulebook/RulebookView.tsx',
] as const;

function occurrencesAcrossOwnedFiles(pattern: RegExp): number {
    return OWNED_FILES.reduce((total, relativePath) => {
        const text = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
        const matches = text.match(new RegExp(pattern, 'g')) ?? [];
        return total + matches.length;
    }, 0);
}

describe('one plausibility note wording for CLI and web (PT-61d, F-V22)', () => {
    it('declares the level-label map in exactly one place', () => {
        expect(
            occurrencesAcrossOwnedFiles(/PLAUSIBILITY_LEVEL_TEXT: Readonly</),
        ).toBe(1);
    });

    it('assembles the plausibility sentence in exactly one place', () => {
        expect(
            occurrencesAcrossOwnedFiles(/R per trade at \$\{winratePercent\}/),
        ).toBe(1);
    });

    it('states the QV-20 disclosure in exactly one place', () => {
        expect(
            occurrencesAcrossOwnedFiles(
                /while QV-20 is open: this note uses \+0\.20R from 40% at 1:2/,
            ),
        ).toBe(1);
    });

    it('is exported through the economics barrel and consumed by the CLI, TradingInputs and the rulebook form', () => {
        const cliSource = readFileSync(
            path.join(REPO_ROOT, OWNED_FILES[1]),
            'utf8',
        );
        const tradingInputsSource = readFileSync(
            path.join(REPO_ROOT, OWNED_FILES[2]),
            'utf8',
        );
        const rulebookSource = readFileSync(
            path.join(REPO_ROOT, OWNED_FILES[3]),
            'utf8',
        );
        expect(cliSource).toContain('edgePlausibilityNoteText');
        expect(tradingInputsSource).toContain('edgePlausibilityNoteText');
        expect(rulebookSource).toContain('edgePlausibilityNoteText');

        const barrelSource = readFileSync(
            path.join(
                REPO_ROOT,
                'src/lib/prop-calculator/economics/index.ts',
            ),
            'utf8',
        );
        expect(barrelSource).toContain('edgePlausibilityNoteText');
    });
});
