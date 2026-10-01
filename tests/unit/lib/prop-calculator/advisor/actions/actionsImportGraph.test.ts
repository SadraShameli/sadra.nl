import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { moduleGraphFrom } from '../../../../importSpecifiers';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const ACTIONS_INDEX = path.join(
    SOURCE_ROOT,
    'lib',
    'prop-calculator',
    'advisor',
    'actions',
    'index.ts',
);
const PROP_ACCOUNTS_PREFIX = `${path.join(SOURCE_ROOT, 'lib', 'prop-accounts')}${path.sep}`;
const APP_PREFIX = `${path.join(SOURCE_ROOT, 'app')}${path.sep}`;

describe('advisor/actions/index.ts stays browser-safe (PT-74)', () => {
    const graph = moduleGraphFrom(ACTIONS_INDEX, SOURCE_ROOT);

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

    it('never reaches a node: module', () => {
        expect(graph.externalSpecifiers).toEqual([]);
    });
});
