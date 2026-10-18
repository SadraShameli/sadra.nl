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

const RHF_WATCH_MESSAGE =
    "Read form values with useWatch({ control, name }): react-hook-form's watch() is not React Compiler safe, so the component can stop re-rendering.";

const RHF_WATCH_RESTRICTIONS = [
    {
        message: RHF_WATCH_MESSAGE,
        selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='watch']",
    },
    {
        message: RHF_WATCH_MESSAGE,
        selector:
            "VariableDeclarator[init.callee.name=/^use(Form|FormContext)$/] > ObjectPattern > Property[key.name='watch']",
    },
];

const NATIVE_CONTROL_RESTRICTIONS = [
    {
        message:
            'Use the shadcn component from ~/components/ui (Button, Input, Label, FieldSet, Select, Textarea, Dialog, Collapsible, Progress) instead of a native form element.',
        selector:
            'JSXOpeningElement[name.name=/^(button|datalist|details|dialog|fieldset|input|label|legend|meter|option|progress|select|summary|textarea)$/]',
    },
    {
        message:
            'Use Tooltip from ~/components/ui/tooltip instead of a native title tooltip.',
        selector:
            "JSXOpeningElement[name.name=/^(?!iframe$|svg$)[a-z]/] > JSXAttribute[name.name='title']",
    },
];

const PANEL_RESTRICTIONS = [
    {
        message:
            'Give a panel its heading through ToolPanel from ~/components/ToolPanel (serif title and optional description), not a hand-built CardHeader, CardTitle or CardDescription.',
        selector:
            'JSXOpeningElement[name.name=/^Card(Description|Header|Title)$/]',
    },
];

const STATUS_RESTRICTIONS = [
    {
        message:
            'Use Alert only with variant="destructive", for errors. Show a computed verdict or state with StatusRow from ~/components/StatusRow, and an explanation with InfoNote from ~/components/InfoNote or the info prop of ToolPanel.',
        selector:
            "JSXOpeningElement[name.name='Alert']:not(:has(JSXAttribute[name.name='variant'][value.value='destructive']))",
    },
];

const COLOUR_CODING_MESSAGE =
    'No colour coding: show a value, sign, grade or state with words, a sign (+ or -) or an icon in the default ink. Errors use FieldError or Alert variant="destructive", destructive actions use the destructive Button or menu item variant, and charts take their series colours from the --chart-* palette.';

const COLOUR_TOKEN_PATTERN = String.raw`--(?:color-)?(?:success|warning|danger|destructive)\b`;

const COLOUR_RESTRICTIONS = [
    {
        message: COLOUR_CODING_MESSAGE,
        selector: `Literal[value=/${COLOUR_TOKEN_PATTERN}/]`,
    },
    {
        message: COLOUR_CODING_MESSAGE,
        selector: `TemplateElement[value.raw=/${COLOUR_TOKEN_PATTERN}/]`,
    },
];

const HEADING_RESTRICTIONS = [
    {
        message:
            'Use the shared headings: PageHeader for the page title, ToolPanel for a panel title, ToolSectionHeading above a group of panels, PanelSubheading for a sub-section inside a panel.',
        selector: 'JSXOpeningElement[name.name=/^h[1-6]$/]',
    },
];

const EDITORIAL_FILES = [
    'src/app/(app)/_components/home/**/*.tsx',
    'src/app/(app)/_components/Portfolio/**/*.tsx',
];

const PARENT_IMPORT_PATTERN = {
    message:
        "Import through the ~/ alias (for example '~/lib/...'); only same-folder './' imports stay relative.",
    regex: String.raw`^\.\.(?:/|$)`,
};

const RELATIVE_TIME_MESSAGE =
    'Show relative times with RelativeTime from ~/components/RelativeTime, which formats after hydration so the server and client render the same text.';

const DATE_FORMAT_MESSAGE =
    'Format dates for display with formatDisplayDate, formatDisplayDateTime, formatDisplayDateRange or formatDisplayMonth from ~/lib/format, so every page shows one format (18 Oct 2026, 08:58).';

const NUMBER_FORMAT_MESSAGE =
    'Format numbers for display with formatCount, formatNumber, formatCurrency or formatPercent from ~/lib/format, so every page groups and rounds the same way.';

const METRIC_RESTRICTIONS = [
    {
        message:
            'Show figures with StatStrip and label and value facts with DetailList from ~/components, not a hand-built dl, dt or dd list.',
        selector: 'JSXOpeningElement[name.name=/^(dl|dt|dd)$/]',
    },
];

const NUMBER_FORMAT_RESTRICTIONS = [
    { message: NUMBER_FORMAT_MESSAGE, property: 'toLocaleString' },
    {
        message: NUMBER_FORMAT_MESSAGE,
        object: 'Intl',
        property: 'NumberFormat',
    },
];

const CHART_RESTRICTIONS = [
    {
        message:
            'Spread CHART_BAR_PROPS from ~/components/ui/chart on every Bar, so a chart with one or two bars keeps a capped width instead of a slab.',
        selector:
            "JSXOpeningElement[name.name='Bar']:not(:has(JSXSpreadAttribute[argument.name='CHART_BAR_PROPS']))",
    },
];

const config = defineConfig(
    {
        ignores: [
            '.claude/worktrees',
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
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
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
                { patterns: [PARENT_IMPORT_PATTERN] },
            ],
            'no-restricted-syntax': [
                'error',
                ...RHF_WATCH_RESTRICTIONS,
                ...COLOUR_RESTRICTIONS,
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
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['src/components/ui/**', 'src/lib/email/**'],
        plugins: { 'better-tailwindcss': betterTailwind },
        rules: {
            'better-tailwindcss/no-restricted-classes': [
                'error',
                {
                    entryPoint: 'src/styles/styles.css',
                    restrict: [
                        {
                            message:
                                'Use a type-* utility (type-micro, type-eyebrow, type-small, type-body, type-lead) or text-xs, text-sm, text-base instead of an arbitrary font size.',
                            pattern: String.raw`^(?:[\w\[\]&=:>*-]+:)*text-\[\d+(?:\.\d+)?(?:px|rem|em)\](?:\/.+)?$`,
                        },
                        {
                            message:
                                'The sm breakpoint is 375px here, so sm:grid-cols-* splits a phone screen. Keep one column on phone and split from md: or lg:.',
                            pattern: String.raw`^(?:[\w\[\]&=:>*-]+:)*sm:(?:[\w\[\]&=:>*-]+:)*grid-cols-.+$`,
                        },
                        {
                            message:
                                'Show work in progress with Spinner from ~/components/ui/spinner, the one place that spins.',
                            pattern: String.raw`^(?:[\w\[\]&=:>*-]+:)*animate-spin$`,
                        },
                        {
                            message: COLOUR_CODING_MESSAGE,
                            pattern: String.raw`^(?:[\w\[\]&=:>*-]+:)*(?:text|bg|border|ring|outline|fill|stroke|from|via|to|decoration|divide|shadow|accent|caret)-(?:success|warning|destructive|danger)(?:-foreground)?(?:\/.+)?$`,
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/components/**/*.tsx'],
        ignores: ['src/components/ui/**', 'src/components/ToolPanel.tsx'],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...RHF_WATCH_RESTRICTIONS,
                ...COLOUR_RESTRICTIONS,
                ...NATIVE_CONTROL_RESTRICTIONS,
                ...CHART_RESTRICTIONS,
                ...PANEL_RESTRICTIONS,
                ...METRIC_RESTRICTIONS,
            ],
        },
    },
    {
        files: [
            'src/components/StatStrip.tsx',
            'src/components/DetailList.tsx',
        ],
        rules: {
            'no-restricted-syntax': [
                'error',
                ...RHF_WATCH_RESTRICTIONS,
                ...COLOUR_RESTRICTIONS,
                ...NATIVE_CONTROL_RESTRICTIONS,
                ...CHART_RESTRICTIONS,
                ...PANEL_RESTRICTIONS,
            ],
        },
    },
    {
        files: ['src/app/**/*.tsx'],
        ignores: EDITORIAL_FILES,
        rules: {
            'no-restricted-syntax': [
                'error',
                ...RHF_WATCH_RESTRICTIONS,
                ...COLOUR_RESTRICTIONS,
                ...NATIVE_CONTROL_RESTRICTIONS,
                ...CHART_RESTRICTIONS,
                ...PANEL_RESTRICTIONS,
                ...STATUS_RESTRICTIONS,
                ...HEADING_RESTRICTIONS,
                ...METRIC_RESTRICTIONS,
            ],
        },
    },
    {
        files: EDITORIAL_FILES,
        rules: {
            'no-restricted-syntax': [
                'error',
                ...RHF_WATCH_RESTRICTIONS,
                ...COLOUR_RESTRICTIONS,
                ...NATIVE_CONTROL_RESTRICTIONS,
                ...CHART_RESTRICTIONS,
                ...PANEL_RESTRICTIONS,
                ...STATUS_RESTRICTIONS,
                ...METRIC_RESTRICTIONS,
            ],
        },
    },
    {
        files: ['src/app/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            importNames: ['format'],
                            message: DATE_FORMAT_MESSAGE,
                            name: 'date-fns',
                        },
                        {
                            importNames: ['formatDistanceToNow'],
                            message: RELATIVE_TIME_MESSAGE,
                            name: 'date-fns',
                        },
                    ],
                    patterns: [PARENT_IMPORT_PATTERN],
                },
            ],
            'no-restricted-properties': [
                'error',
                {
                    message: DATE_FORMAT_MESSAGE,
                    property: 'toLocaleDateString',
                },
                {
                    message: DATE_FORMAT_MESSAGE,
                    property: 'toLocaleTimeString',
                },
                {
                    message: DATE_FORMAT_MESSAGE,
                    object: 'Intl',
                    property: 'DateTimeFormat',
                },
                ...NUMBER_FORMAT_RESTRICTIONS,
            ],
        },
    },
    {
        files: ['src/components/**/*.{ts,tsx}'],
        ignores: ['src/components/ui/**'],
        rules: {
            'no-restricted-properties': [
                'error',
                ...NUMBER_FORMAT_RESTRICTIONS,
            ],
        },
    },
    {
        linterOptions: { reportUnusedDisableDirectives: true },
    },
);

export default config;
