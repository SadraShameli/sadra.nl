const TAILWIND_AT_RULES = [
    'apply',
    'custom-variant',
    'utility',
    'variant',
    'layer',
    'import',
    'tailwind',
    'responsive',
    'screen',
    'plugin',
    'theme',
    'page',
    /^page:/,
];

const config = {
    customSyntax: 'postcss-scss',
    extends: 'stylelint-config-recommended-scss',
    plugins: ['stylelint-order'],
    rules: {
        'at-rule-no-deprecated': null,
        'at-rule-no-unknown': [
            true,
            {
                ignoreAtRules: TAILWIND_AT_RULES,
            },
        ],
        'nesting-selector-no-missing-scoping-root': null,
        'order/order': [
            [
                'custom-properties',
                'dollar-variables',
                {
                    name: 'extend',
                    type: 'at-rule',
                },
                {
                    hasBlock: false,
                    name: 'include',
                    type: 'at-rule',
                },
                'declarations',
                {
                    hasBlock: true,
                    name: 'include',
                    type: 'at-rule',
                },
                'rules',
            ],
        ],
        'order/properties-alphabetical-order': true,
        'scss/at-rule-no-unknown': [
            true,
            {
                ignoreAtRules: TAILWIND_AT_RULES,
            },
        ],
        'selector-class-pattern': [
            '^[a-z]([-]?[a-z0-9]+)*(__[a-z0-9]([-]?[a-z0-9]+)*)?(--[a-z0-9]([-]?[a-z0-9]+)*)?$',
            {
                message: (selectorValue) =>
                    `Expected class selector "${selectorValue}" to match BEM CSS pattern.`,
                resolveNestedSelectors: true,
            },
        ],
    },
};

export default config;
