import { z } from 'zod';

import {
    isSafeThemeValue,
    type ThemeStyles,
    type ThemeVars,
} from './themeSchemas';
import { SHARED_THEME_VAR_KEYS, ThemeVarKey } from './ThemeVarKey';

const rawVarsSchema = z.record(z.string(), z.unknown()).catch({});

const THEME_VAR_KEYS: readonly ThemeVarKey[] = Object.values(ThemeVarKey);

export function normalizeThemeStyles(
    light: unknown,
    dark: unknown,
    common?: unknown,
): null | ThemeStyles {
    const lightVars: ThemeVars = {
        ...pickThemeVars(common),
        ...pickThemeVars(light),
    };
    const darkVars = pickThemeVars(dark);
    for (const key of SHARED_THEME_VAR_KEYS) {
        const shared = lightVars[key];
        if (shared !== undefined && darkVars[key] === undefined)
            darkVars[key] = shared;
    }
    return hasCoreColors(lightVars) && hasCoreColors(darkVars)
        ? { dark: darkVars, light: lightVars }
        : null;
}

function hasCoreColors(vars: ThemeVars): boolean {
    return (
        vars[ThemeVarKey.Background] !== undefined &&
        vars[ThemeVarKey.Primary] !== undefined
    );
}

function pickThemeVars(raw: unknown): ThemeVars {
    const record = rawVarsSchema.parse(raw);
    const vars: ThemeVars = {};
    for (const key of THEME_VAR_KEYS) {
        const value = record[key];
        if (typeof value === 'string' && isSafeThemeValue(value))
            vars[key] = value;
    }
    return vars;
}
