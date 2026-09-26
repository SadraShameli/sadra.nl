import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const PROP_CALCULATOR = path.join(SOURCE_ROOT, 'lib', 'prop-calculator');
const ECONOMICS = path.join(PROP_CALCULATOR, 'economics');
const ECONOMICS_BARREL = path.join(ECONOMICS, 'index.ts');
const CORE = path.join(PROP_CALCULATOR, 'core');
const SIMULATOR = path.join(PROP_CALCULATOR, 'simulator');
const ADVISOR = path.join(PROP_CALCULATOR, 'advisor');
const PROP_ACCOUNTS = path.join(SOURCE_ROOT, 'lib', 'prop-accounts');
const APP = path.join(SOURCE_ROOT, 'app');

interface ImportEdge {
    isTypeOnly: boolean;
    specifier: string;
}

interface ImportGraph {
    externalSpecifiers: Set<string>;
    files: Set<string>;
}

function importEdges(file: string): ImportEdge[] {
    const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        false,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const edges: ImportEdge[] = [];
    const visit = (node: ts.Node): void => {
        if (
            ts.isImportDeclaration(node) &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            edges.push({
                isTypeOnly: isTypeOnlyImport(node),
                specifier: node.moduleSpecifier.text,
            });
        } else if (
            ts.isExportDeclaration(node) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            edges.push({
                isTypeOnly: isTypeOnlyExport(node),
                specifier: node.moduleSpecifier.text,
            });
        } else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
        ) {
            const [argument] = node.arguments;
            if (argument && ts.isStringLiteral(argument)) {
                edges.push({ isTypeOnly: false, specifier: argument.text });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return edges;
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
    if (node.isTypeOnly) return true;
    const clause = node.exportClause;
    return (
        clause !== undefined &&
        ts.isNamedExports(clause) &&
        clause.elements.length > 0 &&
        clause.elements.every((element) => element.isTypeOnly)
    );
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
    if (clause.name) return false;
    const bindings = clause.namedBindings;
    return (
        bindings !== undefined &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((element) => element.isTypeOnly)
    );
}

function isUnder(file: string, directory: string): boolean {
    return file === directory || file.startsWith(`${directory}${path.sep}`);
}

function relativeFiles(files: Iterable<string>, directory: string): string[] {
    return [...files]
        .filter((file) => isUnder(file, directory))
        .map((file) => path.relative(process.cwd(), file));
}

function resolveSpecifier(from: string, specifier: string): null | string {
    let base: null | string = null;
    if (specifier.startsWith('~/')) {
        base = path.join(SOURCE_ROOT, specifier.slice(2));
    } else if (specifier.startsWith('.')) {
        base = path.resolve(path.dirname(from), specifier);
    }
    if (base === null) return null;
    for (const candidate of [
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
    ]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
            return candidate;
        }
    }
    throw new Error(`cannot resolve ${specifier} from ${from}`);
}

function sourceFilesUnder(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

function valueImportGraph(entry: string): ImportGraph {
    const files = new Set<string>();
    const externalSpecifiers = new Set<string>();
    const pending = [entry];
    while (pending.length > 0) {
        const file = pending.pop();
        if (file === undefined || files.has(file)) continue;
        files.add(file);
        for (const edge of importEdges(file)) {
            if (edge.isTypeOnly) continue;
            const resolved = resolveSpecifier(file, edge.specifier);
            if (resolved === null) {
                externalSpecifiers.add(edge.specifier);
            } else {
                pending.push(resolved);
            }
        }
    }
    return { externalSpecifiers, files };
}

describe('the economics sub-barrel import graph', () => {
    const graph = valueImportGraph(ECONOMICS_BARREL);

    it('walks through ../core into the core barrel and its units, so the checks below see the real graph', () => {
        expect(graph.files.has(path.join(CORE, 'index.ts'))).toBe(true);
        expect(graph.files.has(path.join(CORE, 'lib', 'units.ts'))).toBe(true);
    });

    it('would catch a simulator reach: the root barrel walk does reach the simulator', () => {
        const rootGraph = valueImportGraph(
            path.join(PROP_CALCULATOR, 'index.ts'),
        );
        expect(
            relativeFiles(rootGraph.files, SIMULATOR).length,
        ).toBeGreaterThan(0);
    });

    it('reaches no node: specifier', () => {
        expect(
            [...graph.externalSpecifiers].filter((specifier) =>
                specifier.startsWith('node:'),
            ),
        ).toEqual([]);
    });

    it('reaches nothing under src/app', () => {
        expect(relativeFiles(graph.files, APP)).toEqual([]);
    });

    it('reaches nothing under prop-accounts', () => {
        expect(relativeFiles(graph.files, PROP_ACCOUNTS)).toEqual([]);
    });

    it('reaches nothing under the advisor', () => {
        expect(relativeFiles(graph.files, ADVISOR)).toEqual([]);
    });

    it('reaches the simulator only through type imports', () => {
        expect(relativeFiles(graph.files, SIMULATOR)).toEqual([]);
        const typeOnlySimulatorEdges = sourceFilesUnder(ECONOMICS).flatMap(
            (file) =>
                importEdges(file).filter((edge) => {
                    const resolved = resolveSpecifier(file, edge.specifier);
                    return resolved !== null && isUnder(resolved, SIMULATOR);
                }),
        );
        expect(typeOnlySimulatorEdges.length).toBeGreaterThan(0);
        expect(typeOnlySimulatorEdges.every((edge) => edge.isTypeOnly)).toBe(
            true,
        );
    });

    it('reaches core only through its barrel, never an internal core file', () => {
        const coreBarrel = path.join(CORE, 'index.ts');
        const offenders = sourceFilesUnder(ECONOMICS).flatMap((file) =>
            importEdges(file)
                .map((edge) => resolveSpecifier(file, edge.specifier))
                .filter(
                    (resolved): resolved is string =>
                        resolved !== null &&
                        isUnder(resolved, CORE) &&
                        resolved !== coreBarrel,
                )
                .map(
                    (resolved) =>
                        `${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), resolved)}`,
                ),
        );
        expect(offenders).toEqual([]);
    });

    it('is never imported by core', () => {
        const offenders = sourceFilesUnder(CORE).flatMap((file) =>
            importEdges(file)
                .map((edge) => resolveSpecifier(file, edge.specifier))
                .filter(
                    (resolved): resolved is string =>
                        resolved !== null && isUnder(resolved, ECONOMICS),
                )
                .map(
                    (resolved) =>
                        `${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), resolved)}`,
                ),
        );
        expect(offenders).toEqual([]);
    });
});
