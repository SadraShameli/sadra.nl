import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
    importSpecifiersOf,
    moduleGraphFrom,
    resolveLocalSpecifier,
} from '../../../importSpecifiers';

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
const GAP_KIND_LEAF = path.join(CORE_ROOT, 'FundedDpModelGapKind.ts');
const DP_ADVICE_ROW = path.join(ADVISOR_ROOT, 'DpAdviceRow.ts');
const DP_SPECIFIER_HINT = /\bdp\b/;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const ADVISOR_INDEX_GRAPH = moduleGraphFrom(ADVISOR_INDEX, SOURCE_ROOT);

function dpImportersOutsideCli(sourceRoot: string): string[] {
    const dpPrefix = `${path.join(sourceRoot, 'lib', 'prop-calculator', 'advisor', 'dp')}${path.sep}`;
    const cliPrefix = `${path.join(sourceRoot, 'cli')}${path.sep}`;
    const offenders: string[] = [];
    const visit = (directory: string): void => {
        const entries = readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath);
                continue;
            }
            if (
                !SOURCE_EXTENSIONS.has(path.extname(entry.name)) ||
                entryPath.startsWith(dpPrefix) ||
                entryPath.startsWith(cliPrefix)
            ) {
                continue;
            }
            const source = readFileSync(entryPath, 'utf8');
            if (!DP_SPECIFIER_HINT.test(source)) continue;
            const isImportsDp = importSpecifiersOf(source).some(
                ({ specifier }) => {
                    const resolved = resolveLocalSpecifier(
                        entryPath,
                        specifier,
                        sourceRoot,
                    );
                    return resolved?.startsWith(dpPrefix) === true;
                },
            );
            if (isImportsDp) offenders.push(entryPath);
        }
    };
    visit(sourceRoot);
    return offenders;
}

describe('advisor/index.ts stays browser-safe (F-147)', () => {
    const graph = ADVISOR_INDEX_GRAPH;

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

describe('the gap-kind leaf stays browser-safe (F-147)', () => {
    it('exists and reaches no DP solver file and no node: module', () => {
        const graph = moduleGraphFrom(GAP_KIND_LEAF, SOURCE_ROOT);

        expect(
            graph.files.filter((file) => FORBIDDEN_CORE_FILES.has(file)),
        ).toEqual([]);
        expect(graph.externalSpecifiers).toEqual([]);
    });

    it('is reached from the advisor barrel through the core barrel', () => {
        const graph = ADVISOR_INDEX_GRAPH;

        expect(graph.files).toContain(GAP_KIND_LEAF);
    });
});

describe('advisor/DpAdviceRow.ts stays browser-safe (F-147)', () => {
    const graph = moduleGraphFrom(DP_ADVICE_ROW, SOURCE_ROOT);

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

    it('reaches the gap-kind leaf', () => {
        expect(graph.files).toContain(GAP_KIND_LEAF);
    });
});

describe('advisor/dp is Node-only and CLI-only (PD-16)', () => {
    const dpBarrelGraph = moduleGraphFrom(
        path.join(ADVISOR_ROOT, 'dp', 'index.ts'),
        SOURCE_ROOT,
    );
    const importersOutsideCli = dpImportersOutsideCli(SOURCE_ROOT);
    let fixtureRoot: null | string = null;

    afterEach(() => {
        if (fixtureRoot !== null)
            rmSync(fixtureRoot, { force: true, recursive: true });
        fixtureRoot = null;
    });

    it('has a barrel the CLI imports through', () => {
        expect(dpBarrelGraph.files).toContain(
            path.join(ADVISOR_ROOT, 'dp', 'DpAdviceSource.ts'),
        );
    });

    it('is imported by nothing outside src/cli and itself', () => {
        expect(importersOutsideCli).toEqual([]);
    });

    it('the importer scan flags planted importers of the barrel and of a file inside dp outside the CLI and spares the CLI (fixture)', () => {
        fixtureRoot = mkdtempSync(path.join(tmpdir(), 'advisor-dp-importers-'));
        const dpDirectory = path.join(
            fixtureRoot,
            'lib',
            'prop-calculator',
            'advisor',
            'dp',
        );
        mkdirSync(dpDirectory, { recursive: true });
        mkdirSync(path.join(fixtureRoot, 'cli'));
        mkdirSync(path.join(fixtureRoot, 'app'));
        writeFileSync(
            path.join(dpDirectory, 'index.ts'),
            'export const thing = 1;\n',
        );
        writeFileSync(
            path.join(dpDirectory, 'DpFile.ts'),
            'export const deep = 1;\n',
        );
        writeFileSync(
            path.join(fixtureRoot, 'cli', 'ok.ts'),
            "import { thing } from '~/lib/prop-calculator/advisor/dp';\nexport { thing };\n",
        );
        writeFileSync(
            path.join(fixtureRoot, 'app', 'bad.ts'),
            "import { thing } from '~/lib/prop-calculator/advisor/dp';\nexport { thing };\n",
        );

        writeFileSync(
            path.join(fixtureRoot, 'app', 'badDeep.ts'),
            "import { deep } from '~/lib/prop-calculator/advisor/dp/DpFile';\nexport { deep };\n",
        );

        expect(
            dpImportersOutsideCli(fixtureRoot).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual([
            path.join(fixtureRoot, 'app', 'bad.ts'),
            path.join(fixtureRoot, 'app', 'badDeep.ts'),
        ]);
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
