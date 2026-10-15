import { type ThemeStyles, type ThemeVars } from './themeSchemas';
import { ThemeVarKey } from './ThemeVarKey';

const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em)?$/;
const NUMBER = /^(?:\d+\.?\d*|\.\d+)$/;
const NUMERIC_PREFIX = /^-?(?:\d+\.?\d*|\.\d+)/;

const SHADOW_DEFAULTS = {
    blur: '3px',
    color: 'black',
    offsetX: '0',
    offsetY: '1px',
    opacity: 0.1,
    spread: '0px',
};

const DERIVED_KEYS: ReadonlySet<ThemeVarKey> = new Set([
    ThemeVarKey.LetterSpacing,
    ThemeVarKey.ShadowBlur,
    ThemeVarKey.ShadowColor,
    ThemeVarKey.ShadowOffsetX,
    ThemeVarKey.ShadowOffsetY,
    ThemeVarKey.ShadowOpacity,
    ThemeVarKey.ShadowSpread,
]);

const PASSTHROUGH_KEYS: readonly ThemeVarKey[] = Object.values(
    ThemeVarKey,
).filter((key) => !DERIVED_KEYS.has(key));

export function renderThemeCss(styles: ThemeStyles): string {
    return [
        themeBlock('html:root', styles.light),
        themeBlock('html.dark', styles.dark),
    ].join('\n');
}

function lengthOr(value: string | undefined, fallback: string): string {
    return value !== undefined && LENGTH.test(value) ? value : fallback;
}

function numericPart(length: string): number {
    return Number(NUMERIC_PREFIX.exec(length)?.[0] ?? '0');
}

function passthroughDeclarations(vars: ThemeVars): string[] {
    return PASSTHROUGH_KEYS.filter((key) => vars[key] !== undefined).map(
        (key) => `--${key}:${vars[key] ?? ''};`,
    );
}

function shadowDeclarations(vars: ThemeVars): string[] {
    const x = lengthOr(
        vars[ThemeVarKey.ShadowOffsetX],
        SHADOW_DEFAULTS.offsetX,
    );
    const y = lengthOr(
        vars[ThemeVarKey.ShadowOffsetY],
        SHADOW_DEFAULTS.offsetY,
    );
    const blur = lengthOr(vars[ThemeVarKey.ShadowBlur], SHADOW_DEFAULTS.blur);
    const spread = lengthOr(
        vars[ThemeVarKey.ShadowSpread],
        SHADOW_DEFAULTS.spread,
    );
    const color = vars[ThemeVarKey.ShadowColor] ?? SHADOW_DEFAULTS.color;
    const rawOpacity = vars[ThemeVarKey.ShadowOpacity];
    const opacity =
        rawOpacity !== undefined && NUMBER.test(rawOpacity)
            ? Number(rawOpacity)
            : SHADOW_DEFAULTS.opacity;
    const tint = (multiplier: number): string => {
        const percent = Math.min(100, Math.max(0, opacity * multiplier * 100));
        return `color-mix(in srgb, ${color} ${percent.toFixed(1)}%, transparent)`;
    };
    const innerSpread = `${String(numericPart(spread) - 1)}px`;
    const one = (multiplier: number): string =>
        `${x} ${y} ${blur} ${spread} ${tint(multiplier)}`;
    const two = (offsetY: string, innerBlur: string): string =>
        `${one(1)}, ${x} ${offsetY} ${innerBlur} ${innerSpread} ${tint(1)}`;
    const scale: readonly (readonly [string, string])[] = [
        ['shadow-2xs', one(0.5)],
        ['shadow-xs', one(0.5)],
        ['shadow-sm', two('1px', '2px')],
        ['shadow', two('1px', '2px')],
        ['shadow-md', two('2px', '4px')],
        ['shadow-lg', two('4px', '6px')],
        ['shadow-xl', two('8px', '10px')],
        ['shadow-2xl', one(2.5)],
    ];
    return scale.map(([name, value]) => `--${name}:${value};`);
}

function themeBlock(selector: string, vars: ThemeVars): string {
    const declarations = [
        ...passthroughDeclarations(vars),
        ...trackingDeclarations(vars),
        ...shadowDeclarations(vars),
    ];
    return `${selector}{${declarations.join('')}}`;
}

function trackingDeclarations(vars: ThemeVars): string[] {
    const value = vars[ThemeVarKey.LetterSpacing];
    return value !== undefined && LENGTH.test(value)
        ? [`--tracking-normal:${value};`]
        : [];
}
