const config =
    process.env.NODE_ENV === 'production'
        ? {
              plugins: {
                  'postcss-import': {},
                  'tailwindcss/nesting': {},
                  tailwindcss: {},
                  autoprefixer: {},
                  cssnano: {
                      preset: [
                          'default',
                          { discardComments: { removeAll: true } },
                      ],
                  },
              },
          }
        : {
              plugins: {
                  tailwindcss: {},
              },
          };

export default config;
