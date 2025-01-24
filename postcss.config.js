const config =
    process.env.NODE_ENV === 'production'
        ? {
              plugins: {
                  '@tailwindcss/postcss': {},
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
                  '@tailwindcss/postcss': {},
              },
          };

export default config;
