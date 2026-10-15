import { z } from 'zod';

import { ThemeSource } from './ThemeSource';
import { ThemeVarKey } from './ThemeVarKey';

export const THEME_VALUE_MAX_LENGTH = 200;
export const THEME_NAME_MAX_LENGTH = 80;
export const THEME_ID_PATTERN = /^[\w-]{2,64}$/;

const UNSAFE_THEME_VALUE = /[;{}<>\\]|\/\*|\*\//;

export function isSafeThemeValue(value: string): boolean {
    return (
        value.length > 0 &&
        value.length <= THEME_VALUE_MAX_LENGTH &&
        !UNSAFE_THEME_VALUE.test(value) &&
        hasBalancedQuotes(value)
    );
}

function hasBalancedQuotes(value: string): boolean {
    const singles = value.split("'").length - 1;
    const doubles = value.split('"').length - 1;
    return singles % 2 === 0 && doubles % 2 === 0;
}

export const themeValueSchema = z
    .string()
    .refine((value) => isSafeThemeValue(value), 'Unsafe theme value');

export const themeVarsSchema = z.partialRecord(
    z.enum(ThemeVarKey),
    themeValueSchema,
);

export type ThemeVars = z.infer<typeof themeVarsSchema>;

export const themeStylesSchema = z.object({
    dark: themeVarsSchema,
    light: themeVarsSchema,
});

export type ThemeStyles = z.infer<typeof themeStylesSchema>;

export const themeIdSchema = z.string().regex(THEME_ID_PATTERN);

export const tweakcnThemeSchema = z.object({
    author: z.string().max(THEME_NAME_MAX_LENGTH).nullable(),
    id: themeIdSchema,
    likes: z.number().int().nonnegative().nullable(),
    name: z.string().min(1).max(THEME_NAME_MAX_LENGTH),
    source: z.enum(ThemeSource),
    styles: themeStylesSchema,
});

export type TweakcnTheme = z.infer<typeof tweakcnThemeSchema>;

export const themeBundleSchema = z.object({
    community: z.array(tweakcnThemeSchema),
    fetchedAt: z.iso.datetime(),
    presets: z.array(tweakcnThemeSchema),
});

export type ThemeBundle = z.infer<typeof themeBundleSchema>;

export const appliedThemeSchema = z.object({
    css: z.string(),
    fonts: z.array(z.string()),
    id: themeIdSchema,
    name: z.string(),
    source: z.enum(ThemeSource),
});

export type AppliedTheme = z.infer<typeof appliedThemeSchema>;
