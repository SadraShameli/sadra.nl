import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

const SONNER_STYLES = 'node_modules/sonner/dist/styles.css';
const SONNER_OVERRIDES = 'src/styles/sonner.css';
const TAILWIND_THEME = 'node_modules/tailwindcss/theme.css';
const SITE_THEME = 'src/styles/theme.css';
const SITE_BASE = 'src/styles/base.css';

const NATIVE_PARTS = [
    '::selection',
    'accent-color: var(--primary)',
    'scrollbar-color: var(--border)',
    ':-webkit-autofill',
] as const;

const SONNER_THEME_VARIABLE =
    /--(?:border-radius|(?:normal|success|info|warning|error)-[a-z-]+)(?=:)/gu;
const TAILWIND_RADIUS_STEP = /--radius-[a-z0-9]+(?=:)/gu;

function declaredIn(file: string, pattern: RegExp): string[] {
    return [...new Set(textOf(file).match(pattern))].toSorted((a, b) =>
        a.localeCompare(b),
    );
}

function textOf(file: string): string {
    return readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

describe('theme token coverage', () => {
    it('sets every Sonner theme variable from the site tokens', () => {
        const overridden = new Set(
            declaredIn(SONNER_OVERRIDES, SONNER_THEME_VARIABLE),
        );

        expect(
            declaredIn(SONNER_STYLES, SONNER_THEME_VARIABLE).filter(
                (variable) => !overridden.has(variable),
            ),
        ).toEqual([]);
    });

    it('derives every Tailwind radius step from the theme radius', () => {
        const themed = new Set(declaredIn(SITE_THEME, TAILWIND_RADIUS_STEP));

        expect(
            declaredIn(TAILWIND_THEME, TAILWIND_RADIUS_STEP).filter(
                (step) => !themed.has(step),
            ),
        ).toEqual([]);
    });

    it('themes the browser-drawn parts: selection, form accents, scrollbars and autofill', () => {
        const base = textOf(SITE_BASE);

        expect(NATIVE_PARTS.filter((part) => !base.includes(part))).toEqual([]);
    });
});
