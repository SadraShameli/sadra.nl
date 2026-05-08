import tseslint from 'typescript-eslint';
// @ts-ignore
import drizzle from 'eslint-plugin-drizzle';
// @ts-ignore
import nextPlugin from '@next/eslint-plugin-next';
import hooks from 'eslint-plugin-react-hooks';
// @ts-ignore
import tailwind from 'eslint-plugin-tailwindcss';

export default tseslint.config(
    { ignores: ['.next'] },
    ...tailwind.configs['flat/recommended'],
    {
        settings: {
            tailwindcss: {
                config: {},
                cssFiles: ['./src/styles/styles.css'],
            },
        },
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        plugins: {
            '@next/next': nextPlugin,
            // @ts-ignore
            'react-hooks': hooks,
            drizzle,
        },
        extends: [
            ...tseslint.configs.recommendedTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
        ],
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
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
            'drizzle/enforce-delete-with-where': [
                'error',
                { drizzleObjectName: ['db', 'ctx.db'] },
            ],
            'drizzle/enforce-update-with-where': [
                'error',
                { drizzleObjectName: ['db', 'ctx.db'] },
            ],
            'tailwindcss/classnames-order': 'off',
            'tailwindcss/no-unnecessary-arbitrary-value': 'error',
            'tailwindcss/enforces-shorthand': 'error',
            'tailwindcss/enforces-negative-arbitrary-values': 'error',
        },
        settings: {
            react: { version: 'detect' },
        },
    },
    {
        linterOptions: { reportUnusedDisableDirectives: true },
        languageOptions: { parserOptions: { projectService: true } },
    },
);
