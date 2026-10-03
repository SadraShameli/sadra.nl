import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import config from '../../vitest.config';

const TESTS_ROOT = path.join(process.cwd(), 'tests');
const TEST_FILE = /\.tsx?$/;
const MAX_TIMEOUT_MS = 10_000;
const TIMEOUT_FLAG = /--(?:hook|test|teardown)-?timeout/i;

const TEST_APIS: ReadonlySet<string> = new Set([
    'afterAll',
    'afterEach',
    'beforeAll',
    'beforeEach',
    'bench',
    'describe',
    'it',
    'suite',
    'test',
]);

const WHOLE_ARGUMENT_METHODS: ReadonlySet<string> = new Set([
    'configure',
    'setTimeout',
]);

const CONFIGURING_METHODS: ReadonlySet<string> = new Set([
    'each',
    'extend',
    'for',
    'runIf',
    'skipIf',
]);

const HOOK_APIS: ReadonlySet<string> = new Set([
    'afterAll',
    'afterEach',
    'beforeAll',
    'beforeEach',
]);

const CONFIG_OBJECT_ROOTS: ReadonlySet<string> = new Set(['vi', 'vitest']);

const TIMEOUT_KEYS: ReadonlySet<string> = new Set([
    'hookTimeout',
    'teardownTimeout',
    'testTimeout',
    'timeout',
]);

const SCAN_SLICES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const MODULE_CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

const OPERATORS: ReadonlyMap<ts.SyntaxKind, (a: number, b: number) => number> =
    new Map([
        [ts.SyntaxKind.AsteriskToken, (a, b) => a * b],
        [ts.SyntaxKind.MinusToken, (a, b) => a - b],
        [ts.SyntaxKind.PlusToken, (a, b) => a + b],
        [ts.SyntaxKind.SlashToken, (a, b) => a / b],
    ]);

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
    'node_modules',
    'test-results',
]);

interface Offender {
    readonly milliseconds: null | number;
    readonly where: string;
}

class SourceIndex {
    private readonly parsed = new Map<string, ts.SourceFile>();

    constructor(
        private readonly virtualFiles: ReadonlyMap<string, string> = new Map(),
    ) {}

    private constantInStatement(
        file: string,
        statement: ts.Statement,
        name: string,
        visiting: ReadonlySet<string>,
    ): null | number | undefined {
        if (ts.isVariableStatement(statement)) {
            const declaration = statement.declarationList.declarations.find(
                (candidate) =>
                    ts.isIdentifier(candidate.name) &&
                    candidate.name.text === name,
            );
            return declaration?.initializer
                ? this.evaluate(file, declaration.initializer, visiting)
                : undefined;
        }
        if (
            !ts.isImportDeclaration(statement) ||
            !ts.isStringLiteral(statement.moduleSpecifier)
        ) {
            return undefined;
        }
        const imported = importedNameFor(statement, name);
        const target = this.resolveModule(file, statement.moduleSpecifier.text);
        return imported === null || target === null
            ? undefined
            : this.constantOf(target, imported, visiting);
    }

    private resolveModule(from: string, specifier: string): null | string {
        const base = specifier.startsWith('~/')
            ? path.join(process.cwd(), 'src', specifier.slice(2))
            : specifier.startsWith('.')
              ? path.resolve(path.dirname(from), specifier)
              : null;
        if (base === null) return null;
        const resolved = MODULE_CANDIDATES.map(
            (suffix) => `${base}${suffix}`,
        ).find(
            (candidate) =>
                TEST_FILE.test(candidate) &&
                (this.virtualFiles.has(candidate) || existsSync(candidate)),
        );
        return resolved ?? null;
    }

    constantOf(
        file: string,
        name: string,
        visiting: ReadonlySet<string> = new Set(),
    ): null | number {
        const key = `${file}#${name}`;
        if (visiting.has(key)) return null;
        const seen = new Set(visiting).add(key);
        for (const statement of this.sourceOf(file).statements) {
            const found = this.constantInStatement(file, statement, name, seen);
            if (found !== undefined) return found;
        }
        return null;
    }

    evaluate(
        file: string,
        node: ts.Node,
        visiting: ReadonlySet<string> = new Set(),
    ): null | number {
        if (ts.isNumericLiteral(node)) return Number(node.text);
        if (
            ts.isParenthesizedExpression(node) ||
            ts.isAsExpression(node) ||
            ts.isSatisfiesExpression(node)
        ) {
            return this.evaluate(file, node.expression, visiting);
        }
        if (ts.isIdentifier(node)) {
            return this.constantOf(file, node.text, visiting);
        }
        if (!ts.isBinaryExpression(node)) return null;
        const operator = OPERATORS.get(node.operatorToken.kind);
        const left = this.evaluate(file, node.left, visiting);
        const right = this.evaluate(file, node.right, visiting);
        return operator === undefined || left === null || right === null
            ? null
            : operator(left, right);
    }

    sourceOf(file: string): ts.SourceFile {
        const cached = this.parsed.get(file);
        if (cached) return cached;
        const source = ts.createSourceFile(
            file,
            this.virtualFiles.get(file) ?? readFileSync(file, 'utf8'),
            ts.ScriptTarget.Latest,
            false,
            file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
        this.parsed.set(file, source);
        return source;
    }
}

function calleeChain(expression: ts.Expression): string[] {
    if (ts.isIdentifier(expression)) return [expression.text];
    if (ts.isPropertyAccessExpression(expression)) {
        return [...calleeChain(expression.expression), expression.name.text];
    }
    return ts.isCallExpression(expression)
        ? calleeChain(expression.expression)
        : [];
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
            : [{ milliseconds, where }];
    });
}

function importedNameFor(
    declaration: ts.ImportDeclaration,
    localName: string,
): null | string {
    const bindings = declaration.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return null;
    const element = bindings.elements.find(
        (candidate) => candidate.name.text === localName,
    );
    return element ? (element.propertyName ?? element.name).text : null;
}

function isInertArgument(argument: ts.Expression): boolean {
    return (
        ts.isArrowFunction(argument) ||
        ts.isFunctionExpression(argument) ||
        ts.isStringLiteralLike(argument) ||
        ts.isTemplateExpression(argument) ||
        (ts.isIdentifier(argument) && argument.text === 'undefined')
    );
}

function scratchFile(files: Readonly<Record<string, string>>): {
    readonly offendersOf: (name: string) => Offender[];
} {
    const index = new SourceIndex(
        new Map(
            Object.entries(files).map(([name, text]) => [
                path.join(TESTS_ROOT, name),
                text,
            ]),
        ),
    );
    return {
        offendersOf: (name) =>
            timeoutOffendersIn(index, path.join(TESTS_ROOT, name)),
    };
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

function timeoutArgumentsOf(
    call: ts.CallExpression,
): null | readonly ts.Expression[] {
    const [root] = calleeChain(call.expression);
    if (root === undefined) return null;
    const method = ts.isPropertyAccessExpression(call.expression)
        ? call.expression.name.text
        : undefined;
    if (CONFIG_OBJECT_ROOTS.has(root)) {
        return method === 'setConfig' ? call.arguments : null;
    }
    if (!TEST_APIS.has(root)) return null;
    if (method !== undefined && CONFIGURING_METHODS.has(method)) return null;
    if (method !== undefined && WHOLE_ARGUMENT_METHODS.has(method)) {
        return call.arguments;
    }
    if (HOOK_APIS.has(method ?? root)) {
        const [first] = call.arguments;
        const afterTitle =
            first !== undefined && ts.isStringLiteralLike(first)
                ? call.arguments.slice(1)
                : call.arguments;
        return afterTitle.slice(1);
    }
    const [, second, ...rest] = call.arguments;
    return second !== undefined && ts.isObjectLiteralExpression(second)
        ? [second, ...rest]
        : rest;
}

function timeoutOffendersIn(index: SourceIndex, file: string): Offender[] {
    const source = index.sourceOf(file);
    const offenders: Offender[] = [];
    const visit = (node: ts.Node): void => {
        const candidates = ts.isCallExpression(node)
            ? timeoutArgumentsOf(node)
            : null;
        const found = (candidates ?? []).flatMap((argument) =>
            timeoutValuesIn(index, file, argument).filter(
                (milliseconds) =>
                    milliseconds === null || milliseconds > MAX_TIMEOUT_MS,
            ),
        );
        if (found.length > 0) {
            const { line } = source.getLineAndCharacterOfPosition(
                node.getStart(source),
            );
            for (const milliseconds of found) {
                offenders.push({
                    milliseconds,
                    where: `${path.relative(process.cwd(), file)}:${line + 1}`,
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return offenders;
}

function timeoutValuesIn(
    index: SourceIndex,
    file: string,
    argument: ts.Expression,
): (null | number)[] {
    if (isInertArgument(argument)) return [];
    if (!ts.isObjectLiteralExpression(argument)) {
        return [index.evaluate(file, argument)];
    }
    return argument.properties.flatMap((property) => {
        if (ts.isSpreadAssignment(property)) return [null];
        if (ts.isShorthandPropertyAssignment(property)) {
            return TIMEOUT_KEYS.has(property.name.text)
                ? [index.constantOf(file, property.name.text)]
                : [];
        }
        if (!ts.isPropertyAssignment(property)) return [];
        const name = property.name;
        if (ts.isComputedPropertyName(name)) return [null];
        if (
            !ts.isIdentifier(name) &&
            !ts.isStringLiteral(name) &&
            !ts.isNumericLiteral(name)
        ) {
            return [];
        }
        return TIMEOUT_KEYS.has(name.text) &&
            !isInertArgument(property.initializer)
            ? [index.evaluate(file, property.initializer)]
            : [];
    });
}

const ALL_TEST_FILES = testFilesUnder(TESTS_ROOT).toSorted((a, b) =>
    a.localeCompare(b),
);

const SHARED_INDEX = new SourceIndex();

describe('the test suite speed guard', () => {
    it.each(SCAN_SLICES)(
        'sets no per-test, per-hook or per-suite timeout above 10 seconds in slice %d of the files under tests/',
        (slice) => {
            const offenders = ALL_TEST_FILES.filter(
                (_, position) => position % SCAN_SLICES.length === slice,
            ).flatMap((file) => timeoutOffendersIn(SHARED_INDEX, file));
            expect(offenders).toEqual([]);
        },
    );

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
        expect(ALL_TEST_FILES.length).toBeGreaterThan(500);
    });
});

describe('the timeout scanner', () => {
    it('flags a numeric third argument above 10 seconds on tests, hooks and suites', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                it('x', () => {}, 60_000);
                test.skip('y', () => {}, 10_001);
                beforeAll(() => {}, 30000);
                describe('z', () => {}, 20_000);
            `,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            60_000, 10_001, 30_000, 20_000,
        ]);
    });

    it('accepts a timeout at exactly 10 seconds and below', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                it('x', () => {}, 10_000);
                it('y', () => {}, 500);
                beforeEach(() => {});
            `,
        });
        expect(offendersOf('a.test.ts')).toEqual([]);
    });

    it('flags an options object, either position, and a vi.setConfig call', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                it('x', { timeout: 20_000 }, () => {});
                it('y', () => {}, { timeout: 11_000 });
                vi.setConfig({ testTimeout: 12_000, hookTimeout: 5_000 });
            `,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            20_000, 11_000, 12_000,
        ]);
    });

    it('flags the playwright test.setTimeout form', () => {
        const { offendersOf } = scratchFile({
            'a.spec.ts': `test.setTimeout(45_000);`,
        });
        expect(offendersOf('a.spec.ts').map((o) => o.milliseconds)).toEqual([
            45_000,
        ]);
    });

    it('resolves a named constant in the same file and through arithmetic', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                const LIMIT_MS = 30_000;
                const HALF = LIMIT_MS / 2;
                const SMALL = 4 * 1000;
                it('x', () => {}, LIMIT_MS);
                it('y', () => {}, HALF);
                it('z', () => {}, SMALL);
            `,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            30_000, 15_000,
        ]);
    });

    it('resolves a constant imported from a relative fixture', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                import { POOL_MS as LIMIT } from './b';
                it('x', () => {}, LIMIT);
            `,
            'b.ts': `export const POOL_MS = 40_000;`,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            40_000,
        ]);
    });

    it('fails closed on any timeout value it cannot resolve to a number, whatever the name', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                import { somewhere } from 'elsewhere';
                const COMPUTED = compute();
                it('a', () => {}, somewhere.timeout);
                it('b', () => {}, UNKNOWN_TIMEOUT);
                it('c', () => {}, SLOW_MS);
                it('d', () => {}, LIMITS.slow);
                it('e', () => {}, COMPUTED);
                beforeAll(() => {}, SLOW_MS);
                it('f', () => {}, { timeout: SLOW_MS });
                it('g', () => {}, { timeout: LIMITS.slow });
                it('h', () => {}, { ...shared });
            `,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
        ]);
    });

    it('flags a shorthand timeout property, resolving it to its constant when it has one', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                const timeout = 30_000;
                it('a', () => {}, { timeout });
                it('b', () => {}, { hookTimeout });
                it('c', { timeout }, () => {});
            `,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            30_000,
            null,
            30_000,
        ]);
    });

    it('flags the single-argument playwright test.describe.configure form', () => {
        const { offendersOf } = scratchFile({
            'a.spec.ts': `
                test.describe.configure({ timeout: 60_000 });
                test.describe.configure({ mode: 'serial' });
                test.describe.configure({ timeout: 4_000 });
            `,
        });
        expect(offendersOf('a.spec.ts').map((o) => o.milliseconds)).toEqual([
            60_000,
        ]);
    });

    it('flags a hook timeout in its second position and ignores a hook title', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                afterAll(cleanup, 50_000);
                beforeEach('title', setup);
                beforeEach('title', setup, 40_000);
                beforeAll(setup);
            `,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            50_000, 40_000,
        ]);
    });

    it('resolves a constant imported through the ~/ alias and fails closed when the module is not there', () => {
        const { offendersOf } = scratchFile({
            '../src/lib/limits.ts': `
                export const SLOW_MS = 25_000;
                export const FAST_MS = 2_000;
            `,
            'a.test.ts': `
                import { FAST_MS, SLOW_MS as LIMIT } from '~/lib/limits';
                import { MISSING_MS } from '~/lib/missing';
                it('a', () => {}, LIMIT);
                it('b', () => {}, FAST_MS);
                it('c', () => {}, MISSING_MS);
            `,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            25_000,
            null,
        ]);
    });

    it('never reads a test function reference, a title or an options-first object without a timeout as a timeout', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                it('a', handler);
                it('b', async () => {});
                it('c', { retry: 2 }, () => {});
                it('d', () => {}, undefined);
                it('e', () => {}, { timeout: undefined });
                describe(SomeSuite, () => {});
            `,
        });
        expect(offendersOf('a.test.ts')).toEqual([]);
    });

    it('never reads the numbers of an each table or a skipIf condition as a timeout', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                it.each([[100_000, 1], [200_000, 2]])('x %d', () => {});
                it.skipIf(60_000 > 1)('y', () => {});
                it.each([30_000])('z', () => {}, 20_000);
                const sizes = [100_000];
                expect(helper(sizes, 90_000)).toBe(1);
            `,
        });
        expect(offendersOf('a.test.ts').map((o) => o.milliseconds)).toEqual([
            20_000,
        ]);
    });

    it('ignores a test-title number and a numeric argument of an unrelated call', () => {
        const { offendersOf } = scratchFile({
            'a.test.ts': `
                it('takes 100000 ms', () => {
                    waitFor(() => {}, { timeout: 9000 });
                    expect(value(50_000)).toBe(1);
                });
            `,
        });
        expect(offendersOf('a.test.ts')).toEqual([]);
    });
});
