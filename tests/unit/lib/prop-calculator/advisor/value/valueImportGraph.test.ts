import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { moduleGraphFrom } from '../../../../importSpecifiers';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const CORE_ROOT = path.join(SOURCE_ROOT, 'lib', 'prop-calculator', 'core');
const VALUE_INDEX = path.join(
    SOURCE_ROOT,
    'lib',
    'prop-calculator',
    'advisor',
    'value',
    'index.ts',
);
const PROP_ACCOUNTS_PREFIX = `${path.join(SOURCE_ROOT, 'lib', 'prop-accounts')}${path.sep}`;
const APP_PREFIX = `${path.join(SOURCE_ROOT, 'app')}${path.sep}`;
const FORBIDDEN_CORE_FILES = new Set([
    path.join(CORE_ROOT, 'AverageRewardSolver.ts'),
    path.join(CORE_ROOT, 'FundedStateValue.ts'),
]);

describe('advisor/value/index.ts stays browser-safe and engine-only (PT-65a step 9)', () => {
    const graph = moduleGraphFrom(VALUE_INDEX, SOURCE_ROOT);

    it('walks into core through the directory-to-index resolution of ../../core', () => {
        expect(graph.files).toContain(path.join(CORE_ROOT, 'index.ts'));
    });

    it('never reaches a node: module', () => {
        expect(graph.externalSpecifiers).toEqual([]);
    });

    it('never reaches FundedStateValue or AverageRewardSolver', () => {
        expect(
            graph.files.filter((file) => FORBIDDEN_CORE_FILES.has(file)),
        ).toEqual([]);
    });

    it('never reaches prop-accounts', () => {
        expect(
            graph.files.some((file) => file.startsWith(PROP_ACCOUNTS_PREFIX)),
        ).toBe(false);
    });

    it('never reaches ~/app', () => {
        expect(graph.files.some((file) => file.startsWith(APP_PREFIX))).toBe(
            false,
        );
    });
});
