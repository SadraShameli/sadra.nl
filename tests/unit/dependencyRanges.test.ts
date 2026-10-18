import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const manifestSchema = z.object({
    dependencies: z.record(z.string(), z.string()),
    devDependencies: z.record(z.string(), z.string()),
});

const VERSIONED_RANGE = /\d/u;

function unpinnedDependencies(): string[] {
    const manifest = manifestSchema.parse(
        JSON.parse(readFileSync('package.json', 'utf8')),
    );
    return Object.entries({
        ...manifest.dependencies,
        ...manifest.devDependencies,
    })
        .filter(([, range]) => !VERSIONED_RANGE.test(range))
        .map(([name, range]) => `${name}@${range}`);
}

describe('package.json dependency ranges', () => {
    it('names a version for every dependency so a fresh resolve cannot jump majors', () => {
        expect(unpinnedDependencies()).toEqual([]);
    });
});
