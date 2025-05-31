const config = {
    extends: 'stylelint-config-recommended-scss',
    plugins: ['stylelint-order'],
    customSyntax: 'postcss-scss',
    rules: {
        'at-rule-no-unknown': [
            true,
            {
                ignoreAtRules: [
                    'apply',
                    'utility',
                    'layer',
                    'import',
                    'tailwind',
                    'responsive',
                    'screen',
                    'plugin',
                    'theme',
                    'page',
                    /^page:/,
                ],
            },
        ],
        'at-rule-no-deprecated': null,
        'scss/at-rule-no-unknown': [
            true,
            {
                ignoreAtRules: [
                    'apply',
                    'utility',
                    'layer',
                    'import',
                    'tailwind',
                    'responsive',
                    'screen',
                    'plugin',
                    'theme',
                    'page',
                    /^page:/,
                ],
            },
        ],
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
        'selector-class-pattern': [
            '^[a-z]([-]?[a-z0-9]+)*(__[a-z0-9]([-]?[a-z0-9]+)*)?(--[a-z0-9]([-]?[a-z0-9]+)*)?$',
            {
                resolveNestedSelectors: true,
                message: (selectorValue) =>
                    `Expected class selector "${selectorValue}" to match BEM CSS pattern.`,
            },
        ],
    },
};

export default config;
