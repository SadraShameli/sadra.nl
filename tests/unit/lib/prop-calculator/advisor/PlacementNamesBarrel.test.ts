import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ADVISOR_DIR = 'src/lib/prop-calculator/advisor';
const ADVISOR_IMPORT = /from\s*'~\/lib\/prop-calculator\/advisor\/PlaceableMinimum'/;

function sourcesUnder(directory: string): string[] {
    return readdirSync(path.join(REPO_ROOT, directory), {
        withFileTypes: true,
    }).flatMap((entry) => {
        const entryPath = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return sourcesUnder(entryPath);
        return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
    });
}

describe('the placement names come from the advisor barrel (PT-36j)', () => {
    it('has no importer outside the advisor module reaching into PlaceableMinimum.ts', () => {
        const deepImporters = sourcesUnder('src')
            .filter((file) => !file.startsWith(`${ADVISOR_DIR}/`))
            .filter((file) =>
                ADVISOR_IMPORT.test(
                    readFileSync(path.join(REPO_ROOT, file), 'utf8'),
                ),
            );

        expect(deepImporters).toStrictEqual([]);
    });
});
