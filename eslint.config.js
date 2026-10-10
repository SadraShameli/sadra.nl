import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import betterTailwind from 'eslint-plugin-better-tailwindcss';
// @ts-expect-error - no types published
import drizzle from 'eslint-plugin-drizzle';
// @ts-expect-error - no types published
import jsxA11y from 'eslint-plugin-jsx-a11y';
import perfectionist from 'eslint-plugin-perfectionist';
// @ts-expect-error - no types published
import promise from 'eslint-plugin-promise';
import hooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const config = defineConfig(
    {
        ignores: [
            '.next',
            'drizzle',
            'public',
            '.vercel',
            'node_modules',
            'next-env.d.ts',
        ],
    },
    {
        extends: [
            js.configs.recommended,
            ...tseslint.configs.strictTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
            unicorn.configs.recommended,
            promise.configs['flat/recommended'],
            perfectionist.configs['recommended-natural'],
            prettier,
        ],
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parserOptions: { projectService: true } },
        plugins: {
            '@next/next': nextPlugin,
            drizzle,
            'jsx-a11y': jsxA11y,
            // @ts-expect-error - react-hooks 7 types clash with ESLint 10's Plugin type
            'react-hooks': hooks,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            ...jsxA11y.flatConfigs.recommended.rules,
            '@typescript-eslint/array-type': 'off',
            '@typescript-eslint/consistent-type-definitions': 'off',

            '@typescript-eslint/consistent-type-imports': [
                'warn',
                { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
            ],
            '@typescript-eslint/no-confusing-void-expression': [
                'error',
                { ignoreArrowShorthand: true },
            ],
            '@typescript-eslint/no-misused-promises': [
                'error',
                { checksVoidReturn: { attributes: false } },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/restrict-template-expressions': [
                'error',
                { allowBoolean: true, allowNumber: true },
            ],
            '@typescript-eslint/switch-exhaustiveness-check': 'error',

            'drizzle/enforce-delete-with-where': [
                'error',
                { drizzleObjectName: ['db', 'ctx.db'] },
            ],
            'drizzle/enforce-update-with-where': [
                'error',
                { drizzleObjectName: ['db', 'ctx.db'] },
            ],
            'no-empty': ['error', { allowEmptyCatch: true }],
            'perfectionist/sort-classes': 'off',
            'promise/always-return': 'off',
            'promise/catch-or-return': 'off',
            'react-hooks/exhaustive-deps': 'warn',
            'react-hooks/rules-of-hooks': 'error',
            'unicorn/filename-case': [
                'error',
                {
                    cases: {
                        camelCase: true,
                        kebabCase: true,
                        pascalCase: true,
                    },
                    ignore: [/^\[.+\]/u, /\.d\.ts$/u],
                },
            ],
            'unicorn/name-replacements': 'off',
            'unicorn/no-array-callback-reference': 'off',
            'unicorn/no-array-reduce': 'off',
            'unicorn/no-nested-ternary': 'off',
            'unicorn/no-null': 'off',

            'unicorn/number-literal-case': 'off',
            'unicorn/prefer-global-this': 'off',
            'unicorn/prefer-spread': 'off',
        },
    },
    {
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
            unicorn.configs.recommended,
            perfectionist.configs['recommended-natural'],
            prettier,
        ],
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: { globals: globals.node },
        rules: {
            'no-empty': ['error', { allowEmptyCatch: true }],
            'perfectionist/sort-classes': 'off',
            'unicorn/name-replacements': 'off',
            'unicorn/no-null': 'off',
            'unicorn/prefer-module': 'off',
        },
    },
    {
        files: ['src/**/*.ts', 'src/**/*.tsx'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            message:
                                "Import through the ~/ alias (for example '~/lib/...'); only same-folder './' imports stay relative.",
                            regex: String.raw`^\.\.(?:/|$)`,
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/**/*.{ts,tsx}', 'tests/**/*.tsx'],
        plugins: { 'better-tailwindcss': betterTailwind },
        rules: {
            'better-tailwindcss/enforce-canonical-classes': [
                'error',
                { entryPoint: 'src/styles/styles.css' },
            ],
        },
    },
    {
        linterOptions: { reportUnusedDisableDirectives: true },
    },
);

export default config;
