import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { moduleGraphFrom } from '../../../importSpecifiers';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const ADVISOR_ROOT = path.join(
    SOURCE_ROOT,
    'lib',
    'prop-calculator',
    'advisor',
);
const ADVISOR_INDEX = path.join(ADVISOR_ROOT, 'index.ts');
const ADVISOR_DP_PREFIX = `${path.join(ADVISOR_ROOT, 'dp')}${path.sep}`;
const CORE_ROOT = path.join(SOURCE_ROOT, 'lib', 'prop-calculator', 'core');
const FORBIDDEN_CORE_FILES = new Set([
    path.join(CORE_ROOT, 'AverageRewardSolver.ts'),
    path.join(CORE_ROOT, 'FundedDpModelGaps.ts'),
    path.join(CORE_ROOT, 'FundedStateValue.ts'),
]);

describe('advisor/index.ts stays browser-safe (F-147)', () => {
    const graph = moduleGraphFrom(ADVISOR_INDEX, SOURCE_ROOT);

    it('walks into core through the directory-to-index resolution of ../core', () => {
        expect(graph.files).toContain(path.join(CORE_ROOT, 'index.ts'));
    });

    it('never reaches FundedStateValue, AverageRewardSolver or FundedDpModelGaps', () => {
        expect(
            graph.files.filter((file) => FORBIDDEN_CORE_FILES.has(file)),
        ).toEqual([]);
    });

    it('never reaches a node: module', () => {
        expect(graph.externalSpecifiers).toEqual([]);
    });

    it('never reaches advisor/dp', () => {
        expect(
            graph.files.some((file) => file.startsWith(ADVISOR_DP_PREFIX)),
        ).toBe(false);
    });

    it('reaches advisor/policy', () => {
        expect(graph.files).toContain(
            path.join(ADVISOR_ROOT, 'policy', 'index.ts'),
        );
    });
});

describe('moduleGraphFrom flags a planted reach (fixture)', () => {
    let fixtureRoot: null | string = null;

    afterEach(() => {
        if (fixtureRoot !== null)
            rmSync(fixtureRoot, { force: true, recursive: true });
        fixtureRoot = null;
    });

    it('follows a transitive relative re-export into a forbidden file and records a node: specifier', () => {
        fixtureRoot = mkdtempSync(path.join(tmpdir(), 'advisor-import-graph-'));
        writeFileSync(
            path.join(fixtureRoot, 'entry.ts'),
            "export * from './mid';\nimport 'node:fs';\n",
        );
        writeFileSync(
            path.join(fixtureRoot, 'mid.ts'),
            "export { thing } from './forbidden';\n",
        );
        writeFileSync(
            path.join(fixtureRoot, 'forbidden.ts'),
            'export const thing = 1;\n',
        );

        const graph = moduleGraphFrom(
            path.join(fixtureRoot, 'entry.ts'),
            fixtureRoot,
        );

        expect(graph.files).toContain(path.join(fixtureRoot, 'forbidden.ts'));
        expect(graph.externalSpecifiers).toEqual(['node:fs']);
    });

    it('resolves a ~/ specifier back to the given source root', () => {
        fixtureRoot = mkdtempSync(path.join(tmpdir(), 'advisor-import-graph-'));
        writeFileSync(
            path.join(fixtureRoot, 'entry.ts'),
            "export { thing } from '~/leaf';\n",
        );
        writeFileSync(
            path.join(fixtureRoot, 'leaf.ts'),
            'export const thing = 1;\n',
        );

        const graph = moduleGraphFrom(
            path.join(fixtureRoot, 'entry.ts'),
            fixtureRoot,
        );

        expect(graph.files).toContain(path.join(fixtureRoot, 'leaf.ts'));
    });

    it('resolves a directory import to its index.ts', () => {
        fixtureRoot = mkdtempSync(path.join(tmpdir(), 'advisor-import-graph-'));
        const dir = path.join(fixtureRoot, 'sub');
        mkdirSync(dir);
        writeFileSync(
            path.join(fixtureRoot, 'entry.ts'),
            "export * from './sub';\n",
        );
        writeFileSync(path.join(dir, 'index.ts'), 'export const thing = 1;\n');

        const graph = moduleGraphFrom(
            path.join(fixtureRoot, 'entry.ts'),
            fixtureRoot,
        );

        expect(graph.files).toContain(path.join(dir, 'index.ts'));
    });
});
