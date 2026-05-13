import nextPlugin from '@next/eslint-plugin-next';
// @ts-expect-error - no types published
import drizzle from 'eslint-plugin-drizzle';
// @ts-expect-error - no types published
import jsxA11y from 'eslint-plugin-jsx-a11y';
import perfectionist from 'eslint-plugin-perfectionist';
// @ts-expect-error - no types published
import promise from 'eslint-plugin-promise';
import hooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
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
            ...tseslint.configs.strictTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
            unicorn.configs.recommended,
            promise.configs['flat/recommended'],
            perfectionist.configs['recommended-natural'],
        ],
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parserOptions: { projectService: true } },
        plugins: {
            '@next/next': nextPlugin,
            drizzle,
            'jsx-a11y': jsxA11y,
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
                'warn',
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
            'unicorn/no-array-callback-reference': 'off',
            'unicorn/no-array-reduce': 'off',
            'unicorn/no-nested-ternary': 'off',
            'unicorn/no-null': 'off',
            'unicorn/number-literal-case': 'off',

            'unicorn/prefer-global-this': 'off',
            'unicorn/prefer-spread': 'off',
            'unicorn/prevent-abbreviations': 'off',
        },
        settings: {
            react: { version: 'detect' },
        },
    },
    {
        extends: [
            ...tseslint.configs.recommended,
            unicorn.configs.recommended,
            perfectionist.configs['recommended-natural'],
        ],
        files: ['**/*.{js,mjs,cjs}'],
        rules: {
            'unicorn/no-null': 'off',
            'unicorn/prefer-module': 'off',
            'unicorn/prevent-abbreviations': 'off',
        },
    },
    {
        linterOptions: { reportUnusedDisableDirectives: true },
    },
);
