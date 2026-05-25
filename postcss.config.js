const isProduction = process.env.NODE_ENV === 'production';

const plugins = {
    '@tailwindcss/postcss': {},
    ...(isProduction && {
        cssnano: {
            preset: ['default', { discardComments: { removeAll: true } }],
        },
    }),
};

export default { plugins };
