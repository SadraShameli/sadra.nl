/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
    printWidth: 160,
    singleQuote: true,
    jsxSingleQuote: true,
    bracketSameLine: false,
    trailingComma: 'all',
    bracketSpacing: true,
    tabWidth: 4,
    semi: true,
    plugins: ['prettier-plugin-tailwindcss'],
};

export default config;
