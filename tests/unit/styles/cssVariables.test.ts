import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const STYLES_DIRECTORY = path.join(REPO_ROOT, 'src/styles');
const TAILWIND_THEME = path.join(
    REPO_ROOT,
    'node_modules/tailwindcss/theme.css',
);
const GEIST_SANS = path.join(REPO_ROOT, 'node_modules/geist/dist/sans.js');
const SITE_FONTS = path.join(REPO_ROOT, 'src/fonts.ts');

const DECLARED = /(--[\w-]+)\s*:/g;
const REFERENCED = /var\(\s*(--[\w-]+)/g;
const FONT_VARIABLE = /variable:\s*['"](--[\w-]+)['"]/g;

function definedVariables(): Set<string> {
    return new Set([
        ...stylesheetTexts().flatMap((text) => [...namesIn(text, DECLARED)]),
        ...namesIn(readFileSync(TAILWIND_THEME, 'utf8'), DECLARED),
        ...namesIn(readFileSync(GEIST_SANS, 'utf8'), FONT_VARIABLE),
        ...namesIn(readFileSync(SITE_FONTS, 'utf8'), FONT_VARIABLE),
    ]);
}

function namesIn(text: string, pattern: RegExp): Set<string> {
    return new Set(text.matchAll(pattern).map((match) => match[1] ?? ''));
}

function stylesheetTexts(): readonly string[] {
    return readdirSync(STYLES_DIRECTORY)
        .filter((file) => file.endsWith('.css'))
        .map((file) => readFileSync(path.join(STYLES_DIRECTORY, file), 'utf8'));
}

describe('the site stylesheets', () => {
    it('read only CSS variables that the theme, Tailwind or a site font defines', () => {
        const defined = definedVariables();
        const undefinedReads = stylesheetTexts()
            .flatMap((text) => [...namesIn(text, REFERENCED)])
            .filter((name) => !defined.has(name));
        expect(undefinedReads).toEqual([]);
    });
});
