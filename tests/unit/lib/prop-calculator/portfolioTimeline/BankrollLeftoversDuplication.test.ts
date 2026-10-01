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

describe('bankroll leftovers duplication (PT-55b)', () => {
    it('defines empiricalPayingStatsOf in exactly one place, the shared economics helper', () => {
        const commandText = textOf('src/cli/commands/prop/sim/command.ts');
        const leversText = textOf(
            'src/lib/prop-calculator/economics/BankrollLevers.ts',
        );
        expect(
            occurrences(commandText, /function empiricalPayingStatsOf/),
        ).toBe(0);
        expect(occurrences(leversText, /function empiricalPayingStatsOf/)).toBe(
            1,
        );
        expect(commandText).toMatch(
            /import\s*{[^}]*empiricalPayingStatsOf[^}]*}\s*from\s*'~\/lib\/prop-calculator\/economics'/,
        );
    });

    it('defines the dated-charge due-through cursor in exactly one shared place', () => {
        const accountText = textOf(
            'src/lib/prop-calculator/portfolioTimeline/accountTimeline.ts',
        );
        const bankrollText = textOf(
            'src/lib/prop-calculator/portfolioTimeline/bankrollTimeline.ts',
        );
        const cursorText = textOf(
            'src/lib/prop-calculator/portfolioTimeline/DatedChargeCursor.ts',
        );
        expect(occurrences(accountText, /class DatedChargeCursor/)).toBe(0);
        expect(occurrences(bankrollText, /class DatedChargeCursor/)).toBe(0);
        expect(occurrences(bankrollText, /function cumulativeDueThrough/)).toBe(
            0,
        );
        expect(occurrences(cursorText, /class DatedChargeCursor/)).toBe(1);
        expect(occurrences(cursorText, /class CardChargeCursor/)).toBe(1);
        expect(accountText).toMatch(
            /import\s*{[^}]*CardChargeCursor[^}]*}\s*from\s*'\.\/DatedChargeCursor'/,
        );
        expect(bankrollText).toMatch(
            /import\s*{[^}]*CardChargeCursor[^}]*}\s*from\s*'\.\/DatedChargeCursor'/,
        );
    });
});
