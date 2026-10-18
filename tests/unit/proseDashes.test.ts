import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { posixPath } from './posixPath';
import { EM_DASH, SPACED_DOUBLE_HYPHEN } from './proseDashes';

const REPO_ROOT = process.cwd();
const SCANNED_ROOTS = ['src', 'tests'] as const;
const GUARD_FILE = 'tests/unit/proseDashes.test.ts';
const NUL_BYTE = 0;
const LINE_BREAK = /\r?\n/;
const PROSE_DOUBLE_HYPHEN =
    /[A-Za-z0-9.,)"'`+] -- [A-Za-z0-9("$'`]|[A-Za-z0-9.,)`+] --$/;

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
    'node_modules',
    'test-results',
]);

function hasProseDash(line: string): boolean {
    return line.includes(EM_DASH) || PROSE_DOUBLE_HYPHEN.test(line);
}

function proseDashLinesOf(text: string): number[] {
    return text
        .split(LINE_BREAK)
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => hasProseDash(line))
        .map(({ number }) => number);
}

function scannedFiles(): string[] {
    return SCANNED_ROOTS.flatMap((root) =>
        readdirSync(path.join(REPO_ROOT, root), {
            recursive: true,
            withFileTypes: true,
        })
            .filter(
                (entry) =>
                    entry.isFile() &&
                    path
                        .relative(REPO_ROOT, entry.parentPath)
                        .split(path.sep)
                        .every((segment) => !SKIPPED_DIRECTORIES.has(segment)),
            )
            .map((entry) =>
                posixPath(
                    path.relative(
                        REPO_ROOT,
                        path.join(entry.parentPath, entry.name),
                    ),
                ),
            ),
    ).filter((file) => file !== GUARD_FILE);
}

function textOf(file: string): null | string {
    const bytes = readFileSync(path.join(REPO_ROOT, file));
    return bytes.includes(NUL_BYTE) ? null : bytes.toString('utf8');
}

describe('prose dashes', () => {
    it('flags a spaced double hyphen and an em dash, but not a cli flag, a css property or a decrement', () => {
        expect(hasProseDash(`stale${SPACED_DOUBLE_HYPHEN}see below`)).toBe(
            true,
        );
        expect(
            hasProseDash(`a trailing clause${SPACED_DOUBLE_HYPHEN.trimEnd()}`),
        ).toBe(true);
        expect(hasProseDash(`the cap ${EM_DASH} a number`)).toBe(true);
        expect(
            hasProseDash(`standard PRO+${SPACED_DOUBLE_HYPHEN}exposing`),
        ).toBe(true);
        expect(
            hasProseDash(`tags \`one time\`${SPACED_DOUBLE_HYPHEN}no fee`),
        ).toBe(true);
        expect(hasProseDash('bun run cli prop optimize --fee 100')).toBe(false);
        expect(hasProseDash('width: calc(var(--gap) * 2);')).toBe(false);
        expect(hasProseDash('margin: --spacing(4);')).toBe(false);
        expect(hasProseDash('remaining--;')).toBe(false);
    });

    it('finds no spaced double hyphen or em dash in any text file under src or tests', () => {
        const offenders = scannedFiles().flatMap((file) => {
            const text = textOf(file);
            return text === null
                ? []
                : proseDashLinesOf(text).map((line) => `${file}:${line}`);
        });
        expect(offenders).toEqual([]);
    });
});
