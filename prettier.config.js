/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
    plugins: ['prettier-plugin-tailwindcss'],
    printWidth: 80,
    singleQuote: true,
    tabWidth: 4,
    tailwindStylesheet: './src/styles/styles.css',
};

export default config;
