/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
    plugins: ['prettier-plugin-tailwindcss'],
    tailwindStylesheet: './src/styles/styles.css',
    singleQuote: true,
    printWidth: 80,
    tabWidth: 4,
};

export default config;
