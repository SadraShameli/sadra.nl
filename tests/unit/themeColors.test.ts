import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { posixPath } from './posixPath';

const REPO_ROOT = process.cwd();
const SCANNED_ROOT = 'src';
const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.tsx']);
const LINE_BREAK = /\r?\n/;

const FIXED_COLOR_DIRECTORIES = ['src/lib/email/'] as const;

const COLOR_UTILITY =
    'text|bg|border|ring|fill|stroke|from|to|via|shadow|divide|outline|placeholder|decoration|caret|accent';
const PALETTE =
    'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const THEME_BREAKING_CLASS = new RegExp(
    String.raw`(?<![\w-])(?:prose-invert|(?:${COLOR_UTILITY})-(?:(?:${PALETTE})-\d{2,3}|white|black))(?![\w-])`,
    'u',
);

function hasFixedColors(file: string): boolean {
    return FIXED_COLOR_DIRECTORIES.some((directory) =>
        file.startsWith(directory),
    );
}

function isThemeBreaking(line: string): boolean {
    return THEME_BREAKING_CLASS.test(line);
}

function scannedFiles(): string[] {
    return readdirSync(path.join(REPO_ROOT, SCANNED_ROOT), {
        recursive: true,
        withFileTypes: true,
    })
        .filter(
            (entry) =>
                entry.isFile() &&
                SCANNED_EXTENSIONS.has(path.extname(entry.name)),
        )
        .map((entry) =>
            posixPath(
                path.relative(
                    REPO_ROOT,
                    path.join(entry.parentPath, entry.name),
                ),
            ),
        )
        .filter((file) => !hasFixedColors(file));
}

describe('theme colors', () => {
    it('flags fixed palette, white, black and inverted prose classes but not theme tokens', () => {
        expect(isThemeBreaking('className="prose prose-invert"')).toBe(true);
        expect(isThemeBreaking('className="text-neutral-400"')).toBe(true);
        expect(isThemeBreaking('className="bg-white/10"')).toBe(true);
        expect(isThemeBreaking('className="dark:border-black"')).toBe(true);
        expect(isThemeBreaking('className="text-foreground/90"')).toBe(false);
        expect(isThemeBreaking('className="bg-muted text-primary"')).toBe(
            false,
        );
        expect(isThemeBreaking('className="text-white-space"')).toBe(false);
    });

    it('uses only theme tokens for color, so light, dark and every tweakcn theme apply', () => {
        const offenders = scannedFiles().flatMap((file) =>
            readFileSync(path.join(REPO_ROOT, file), 'utf8')
                .split(LINE_BREAK)
                .map((line, index) => ({ line, number: index + 1 }))
                .filter(({ line }) => isThemeBreaking(line))
                .map(({ number }) => `${file}:${number}`),
        );

        expect(offenders).toEqual([]);
    });
});
