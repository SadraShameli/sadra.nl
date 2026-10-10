import { defineConfig } from 'vitest/config';

const config = defineConfig({
    resolve: {
        alias: {
            'server-only': new URL(
                'tests/stubs/server-only.ts',
                import.meta.url,
            ).pathname,
            '~/': new URL('src/', import.meta.url).pathname,
        },
    },
    test: {
        coverage: {
            include: [
                'src/lib/**/*.ts',
                'src/server/helpers/**/*.ts',
                'src/server/api/routers/**/*.ts',
            ],
            provider: 'v8',
            reporter: ['text', 'html'],
        },
        exclude: ['**/node_modules/**', '**/.next/**', 'tests/e2e/**'],
        projects: [
            {
                extends: true,
                test: {
                    environment: 'node',
                    include: ['tests/unit/**/*.test.ts'],
                    isolate: false,
                    name: 'unit',
                },
            },
            {
                extends: true,
                test: {
                    environment: 'happy-dom',
                    include: ['tests/unit/**/*.dom.test.tsx'],
                    isolate: true,
                    name: 'dom',
                },
            },
        ],
    },
});

export default config;
