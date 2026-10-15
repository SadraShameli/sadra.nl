import { describe, expect, it } from 'vitest';

import {
    isSafeThemeValue,
    normalizeThemeStyles,
    ThemeVarKey,
} from '~/lib/theme';

const LIGHT = { background: 'oklch(1 0 0)', primary: 'oklch(0.5 0.2 300)' };
const DARK = { background: 'oklch(0.1 0 0)', primary: 'oklch(0.6 0.2 300)' };

describe('isSafeThemeValue', () => {
    it.each([
        'red;}body{display:none',
        '</style><script>alert(1)</script>',
        'url(x) /* comment */',
        String.raw`a\62 c`,
        "Inter', sans-serif",
        '',
    ])('rejects %s', (value) => {
        expect(isSafeThemeValue(value)).toBe(false);
    });

    it.each([
        'oklch(0.5 0.2 300)',
        '#ff00aa',
        "'Plus Jakarta Sans', sans-serif",
        '0.5rem',
    ])('accepts %s', (value) => {
        expect(isSafeThemeValue(value)).toBe(true);
    });
});

describe('normalizeThemeStyles', () => {
    it('keeps only known keys with safe values', () => {
        const styles = normalizeThemeStyles(
            { ...LIGHT, card: 'red;}body{x:y', unknown: 'blue' },
            DARK,
        );
        expect(styles?.light).toEqual(LIGHT);
    });

    it('copies the shared font and radius into the dark palette', () => {
        const styles = normalizeThemeStyles(LIGHT, DARK, {
            'font-sans': 'Inter, sans-serif',
            radius: '1rem',
        });
        expect(styles?.dark[ThemeVarKey.FontSans]).toBe('Inter, sans-serif');
        expect(styles?.dark[ThemeVarKey.Radius]).toBe('1rem');
    });

    it('returns null when a palette has no background or primary', () => {
        expect(normalizeThemeStyles(LIGHT, { background: 'black' })).toBeNull();
        expect(normalizeThemeStyles('not an object', DARK)).toBeNull();
    });
});
