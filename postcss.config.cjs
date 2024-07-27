const config = {
  plugins: {
    'postcss-import': {},
    'tailwindcss/nesting': {},
    tailwindcss: {},
    autoprefixer: {},
    cssnano: { preset: 'default', discardComments: { removeAll: true } },
  },
};

module.exports = config;
