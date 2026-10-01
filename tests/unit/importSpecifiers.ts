import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface ImportSpecifier {
    readonly clause: string;
    readonly specifier: string;
}

export interface ModuleGraph {
    readonly externalSpecifiers: readonly string[];
    readonly files: readonly string[];
}

const MODULE_SPECIFIER =
    /(?:^|[\s;])(?:import|export)\b([^;]*?)\bfrom\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

const LOCAL_CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

const SOURCE_ALIAS = '~/';

export function aliasPathOf(
    specifier: string,
    sourceRoot: string,
): null | string {
    return specifier.startsWith(SOURCE_ALIAS)
        ? path.join(sourceRoot, specifier.slice(SOURCE_ALIAS.length))
        : null;
}

export function importSpecifiersOf(source: string): ImportSpecifier[] {
    return source
        .matchAll(MODULE_SPECIFIER)
        .map((match) => ({
            clause: (match[1] ?? '').trim(),
            specifier: match[2] ?? match[3] ?? match[4] ?? '',
        }))
        .toArray();
}

export function moduleGraphFrom(
    entry: string,
    sourceRoot: string,
): ModuleGraph {
    const seen = new Set<string>([entry]);
    const external = new Set<string>();
    const queue = [entry];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        const source = readFileSync(file, 'utf8');
        for (const { specifier } of importSpecifiersOf(source)) {
            if (specifier.startsWith('node:')) {
                external.add(specifier);
                continue;
            }
            const resolved = resolveLocalSpecifier(file, specifier, sourceRoot);
            if (resolved === null || seen.has(resolved)) continue;
            seen.add(resolved);
            queue.push(resolved);
        }
    }
    return { externalSpecifiers: [...external], files: [...seen] };
}

export function resolveLocalSpecifier(
    fromFile: string,
    specifier: string,
    sourceRoot: string,
): null | string {
    const aliased = aliasPathOf(specifier, sourceRoot);
    if (aliased !== null) {
        return (
            LOCAL_CANDIDATES.map((suffix) => `${aliased}${suffix}`).find(
                (option) => existsSync(option),
            ) ?? null
        );
    }
    if (!specifier.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), specifier);
    return (
        LOCAL_CANDIDATES.map((suffix) => `${base}${suffix}`).find((option) =>
            existsSync(option),
        ) ?? null
    );
}
