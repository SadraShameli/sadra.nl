import { type ThemeStyles } from './themeSchemas';
import { ThemeVarKey } from './ThemeVarKey';

export const THEME_FONT_FAMILY_PATTERN = /^[A-Za-z0-9 -]{2,60}$/;

const SYSTEM_FONT =
    /^(ui-|system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|monospace|cursive|fantasy|segoe ui|helvetica|arial|georgia|times|cambria|menlo|monaco|consolas|courier|sf ?mono|sfmono|liberation|apple color emoji)/i;

const FONT_KEYS: readonly ThemeVarKey[] = [
    ThemeVarKey.FontSans,
    ThemeVarKey.FontMono,
    ThemeVarKey.FontSerif,
];

export function firstFontFamily(stack: string | undefined): null | string {
    const first = stack
        ?.split(',', 1)[0]
        ?.trim()
        .replaceAll(/^['"]|['"]$/g, '');
    if (first === undefined || first === '' || SYSTEM_FONT.test(first))
        return null;
    return THEME_FONT_FAMILY_PATTERN.test(first) ? first : null;
}

export function themeFontFamilies(styles: ThemeStyles): string[] {
    const families = FONT_KEYS.map((key) =>
        firstFontFamily(styles.light[key]),
    ).filter((family) => family !== null);
    return [...new Set(families)];
}
