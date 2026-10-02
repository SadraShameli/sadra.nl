import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '../../../../../src');
const SOURCE_FILE = /\.tsx?$/;
const LITERAL_CALL = /createSizingAdvisor\(\s*[^,()]+,\s*\{[\s\S]*?\n\s*\}\)/g;
const FILES_WITHOUT_CALLS = new Set(['createSizingAdvisor.ts']);

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

describe('every production createSizingAdvisor call names the firm payout count (PT-36g, F-145)', () => {
    const calls = sourceFiles(SOURCE_ROOT)
        .filter((file) => !FILES_WITHOUT_CALLS.has(path.basename(file)))
        .flatMap((file) =>
            (readFileSync(file, 'utf8').match(LITERAL_CALL) ?? []).map(
                (call) => ({ call, file: path.relative(SOURCE_ROOT, file) }),
            ),
        );

    it('finds the literal-options callers', () => {
        expect(
            calls
                .map(({ file }) => path.basename(file))
                .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(['AdviceCoverageOf.ts', 'PayoutReadyOpenRiskRule.ts']);
    });

    it.each(calls.map(({ call, file }) => [file, call] as const))(
        '%s passes paidPayoutsSinceLastLiveAccount explicitly',
        (_file, call) => {
            expect(call).toContain('paidPayoutsSinceLastLiveAccount');
        },
    );
});
