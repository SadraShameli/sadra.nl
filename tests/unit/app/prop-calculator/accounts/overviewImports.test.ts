import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(import.meta.dirname, '../../../../../src');
const ACCOUNTS_ROOT = path.join(SRC_ROOT, 'app/(app)/prop-calculator/accounts');
const OVERVIEW_ROOT = path.join(ACCOUNTS_ROOT, '_components/overview');
const RULEBOOK_ROUTE = path.join(ACCOUNTS_ROOT, 'rulebook');
const IMPORT_SPECIFIER =
    /\bfrom\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu;

function isInside(target: string, directory: string): boolean {
    const relative = path.relative(directory, target);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolvedImports(file: string): string[] {
    const source = readFileSync(file, 'utf8');
    return source
        .matchAll(IMPORT_SPECIFIER)
        .map((match) => match[1] ?? match[2] ?? '')
        .flatMap((specifier) => {
            if (specifier.startsWith('~/')) {
                return [path.join(SRC_ROOT, specifier.slice(2))];
            }
            return specifier.startsWith('.')
                ? [path.resolve(path.dirname(file), specifier)]
                : [];
        })
        .toArray();
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('the accounts overview imports', () => {
    it('reads at least the overview view and its model', () => {
        const names = sourceFiles(OVERVIEW_ROOT).map((file) =>
            path.basename(file),
        );
        expect(names).toContain('OverviewView.tsx');
        expect(names).toContain('overviewModel.ts');
    });

    it('never import from the rulebook route', () => {
        const offenders = sourceFiles(OVERVIEW_ROOT).flatMap((file) =>
            resolvedImports(file)
                .filter((target) => isInside(target, RULEBOOK_ROUTE))
                .map(
                    (target) =>
                        `${path.relative(SRC_ROOT, file)} -> ${path.relative(SRC_ROOT, target)}`,
                ),
        );
        expect(offenders).toEqual([]);
    });
});
