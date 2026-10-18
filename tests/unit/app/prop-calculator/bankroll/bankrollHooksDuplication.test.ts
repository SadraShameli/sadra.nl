import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

const CARD_FILES = [
    'SetupCard.tsx',
    'ProjectionCard.tsx',
    'TwoStrategiesCard.tsx',
    'BatchCard.tsx',
    'SameEvCard.tsx',
    'LeversCard.tsx',
];

function cardText(fileName: string): string {
    return readFileSync(
        path.join(
            REPO_ROOT,
            'src/app/(app)/prop-calculator/_components/bankroll',
            fileName,
        ),
        'utf8',
    );
}

function occurrences(text: string, pattern: RegExp): number {
    return (text.match(new RegExp(pattern, 'g')) ?? []).length;
}

describe('bankroll hooks duplication (PT-62e)', () => {
    it('derives the session, rulebook and variant in exactly one place: useBankrollVariant', () => {
        const hookText = readFileSync(
            path.join(
                REPO_ROOT,
                'src/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant.ts',
            ),
            'utf8',
        );
        expect(occurrences(hookText, /function useBankrollVariant/)).toBe(1);
        for (const fileName of CARD_FILES) {
            const text = cardText(fileName);
            expect(occurrences(text, /bankrollVariantFor\(/)).toBe(0);
            expect(text).toMatch(
                /import\s*{[^}]*useBankrollVariant[^}]*}\s*from\s*'\.\/useBankrollVariant'/,
            );
        }
    });

    it('dedupes the worker dispatch by semantic key in exactly one place: useToolsRequest', () => {
        const hookText = readFileSync(
            path.join(
                REPO_ROOT,
                'src/app/(app)/prop-calculator/_components/bankroll/useToolsRequest.ts',
            ),
            'utf8',
        );
        expect(occurrences(hookText, /function useToolsRequest/)).toBe(1);
        for (const fileName of CARD_FILES) {
            const text = cardText(fileName);
            expect(occurrences(text, /requestedKeyReference/)).toBe(0);
            expect(occurrences(text, /useToolsWorker\(/)).toBe(0);
            expect(text).toMatch(
                /import\s*{[^}]*useToolsRequest[^}]*}\s*from\s*'\.\/useToolsRequest'/,
            );
        }
    });
});
