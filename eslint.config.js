import nextPlugin from '@next/eslint-plugin-next';
// @ts-expect-error - no types published
import drizzle from 'eslint-plugin-drizzle';
// @ts-expect-error - no types published
import jsxA11y from 'eslint-plugin-jsx-a11y';
import hooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
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
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parserOptions: { projectService: true } },
        plugins: {
            '@next/next': nextPlugin,
            'react-hooks': hooks,
            drizzle,
            'jsx-a11y': jsxA11y,
            'simple-import-sort': simpleImportSort,
        },
        extends: [
            ...tseslint.configs.recommendedTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
        ],
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            ...jsxA11y.flatConfigs.recommended.rules,
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            '@typescript-eslint/array-type': 'off',
            '@typescript-eslint/consistent-type-definitions': 'off',
            '@typescript-eslint/consistent-type-imports': [
                'warn',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
            ],
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/no-misused-promises': [
                'error',
                { checksVoidReturn: { attributes: false } },
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
        },
        settings: {
            react: { version: 'detect' },
        },
    },
    {
        files: ['**/*.{js,mjs,cjs}'],
        plugins: {
            'simple-import-sort': simpleImportSort,
        },
        extends: [...tseslint.configs.recommended],
        rules: {
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
        },
    },
    {
        linterOptions: { reportUnusedDisableDirectives: true },
    },
);
