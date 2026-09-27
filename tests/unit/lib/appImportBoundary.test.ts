import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { importSpecifiersOf } from '../importSpecifiers';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const APP_ROOT = path.join(SOURCE_ROOT, 'app');
const GUARDED_DIRECTORIES = ['server', 'lib'] as const;
const SOURCE_FILE = /\.tsx?$/;

const PRE_EXISTING_APP_IMPORTS: ReadonlyMap<string, readonly string[]> =
    new Map([
        [
            path.join('src', 'lib', 'site', 'content.ts'),
            ['~/app/(app)/_components/GallerySection'],
        ],
    ]);

function importsIntoApp(file: string): string[] {
    const source = readFileSync(file, 'utf8');
    return importSpecifiersOf(source)
        .map(({ specifier }) => specifier)
        .filter((specifier) => isAppSpecifier(file, specifier));
}

function isAppSpecifier(file: string, specifier: string): boolean {
    if (specifier === '~/app' || specifier.startsWith('~/app/')) return true;
    if (!specifier.startsWith('.')) return false;
    const resolved = path.resolve(path.dirname(file), specifier);
    return (
        resolved === APP_ROOT || resolved.startsWith(`${APP_ROOT}${path.sep}`)
    );
}

function sourceFilesUnder(directory: string): string[] {
    return readdirSync(path.join(SOURCE_ROOT, directory), {
        recursive: true,
        withFileTypes: true,
    })
        .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('the server and lib import boundary', () => {
    it('never imports from ~/app in src/server or src/lib, except the pre-existing site content type import', () => {
        const offenders: string[] = [];
        for (const directory of GUARDED_DIRECTORIES) {
            for (const file of sourceFilesUnder(directory)) {
                const relative = path.relative(process.cwd(), file);
                const allowed = PRE_EXISTING_APP_IMPORTS.get(relative) ?? [];
                for (const specifier of importsIntoApp(file)) {
                    if (!allowed.includes(specifier)) {
                        offenders.push(`${relative} -> ${specifier}`);
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('still sees the allow-listed import, so the allow list never goes stale silently', () => {
        for (const [relative, specifiers] of PRE_EXISTING_APP_IMPORTS) {
            const file = path.join(process.cwd(), relative);
            expect(importsIntoApp(file)).toEqual(specifiers);
        }
    });

    it('catches a relative path that climbs into src/app', () => {
        const file = path.join(SOURCE_ROOT, 'server', 'api', 'example.ts');
        expect(isAppSpecifier(file, '../../app/(app)/page')).toBe(true);
        expect(isAppSpecifier(file, '../../lib/format')).toBe(false);
        expect(isAppSpecifier(file, '~/app/(app)/page')).toBe(true);
        expect(isAppSpecifier(file, '~/application')).toBe(false);
    });
});
