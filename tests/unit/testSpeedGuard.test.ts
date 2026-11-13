import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../vitest.config';

const TESTS_ROOT = path.join(process.cwd(), 'tests');
const TEST_FILE = /\.tsx?$/;
const MAX_TIMEOUT_MS = 10_000;
const TIMEOUT_FLAG = /--(?:hook|test|teardown)-?timeout/i;

const TIMEOUT_KEYS: ReadonlySet<string> = new Set([
    'hookTimeout',
    'teardownTimeout',
    'testTimeout',
    'timeout',
]);

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
    'node_modules',
    'test-results',
]);

interface Offender {
    readonly milliseconds: null | number;
    readonly where: string;
}

function configuredTimeouts(value: unknown, trail: string): Offender[] {
    if (Array.isArray(value)) {
        return value.flatMap((entry, position) =>
            configuredTimeouts(entry, `${trail}[${position}]`),
        );
    }
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, entry]) => {
        const where = `${trail}.${key}`;
        if (!TIMEOUT_KEYS.has(key)) return configuredTimeouts(entry, where);
        const milliseconds = typeof entry === 'number' ? entry : null;
        return milliseconds !== null && milliseconds <= MAX_TIMEOUT_MS
            ? []
            : { milliseconds, where };
    });
}

function testFilesUnder(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter(
            (entry) =>
                entry.isFile() &&
                TEST_FILE.test(entry.name) &&
                path
                    .relative(directory, entry.parentPath)
                    .split(path.sep)
                    .every((segment) => !SKIPPED_DIRECTORIES.has(segment)),
        )
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('the test suite speed guard', () => {
    it('leaves the vitest config on its default 5 second test timeout and 10 second hook timeout', () => {
        expect(configuredTimeouts(config, 'vitest.config')).toEqual([]);
    });

    it('passes no timeout flag to vitest from any package.json script', () => {
        const manifestText = readFileSync(
            path.join(process.cwd(), 'package.json'),
            'utf8',
        );
        const manifest: unknown = JSON.parse(manifestText);
        const scripts =
            typeof manifest === 'object' &&
            manifest !== null &&
            'scripts' in manifest &&
            typeof manifest.scripts === 'object' &&
            manifest.scripts !== null
                ? Object.entries(manifest.scripts)
                : [];
        const flagged = scripts.filter(([, command]) =>
            TIMEOUT_FLAG.test(String(command)),
        );
        expect(scripts.length).toBeGreaterThan(0);
        expect(flagged).toEqual([]);
    });

    it('scans every test and fixture file, so an empty directory listing never passes silently', () => {
        expect(testFilesUnder(TESTS_ROOT).length).toBeGreaterThan(500);
    });
});
