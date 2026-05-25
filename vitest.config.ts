import { defineConfig } from 'vitest/config';

export default defineConfig({
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
        environment: 'node',
        exclude: ['**/node_modules/**', '**/.next/**', 'tests/e2e/**'],
        include: ['tests/unit/**/*.test.ts'],
    },
});
