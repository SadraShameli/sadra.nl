import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the DP default trades per day has one definition (WP66b)', () => {
    it('is defined only in the core constants', () => {
        const defining = readdirSync(path.resolve('src'), {
            recursive: true,
            withFileTypes: true,
        })
            .filter((dirent) => dirent.isFile() && /\.tsx?$/.test(dirent.name))
            .map((dirent) => path.join(dirent.parentPath, dirent.name))
            .filter((file) =>
                /const (?:DEFAULT|DP)_TRADES_PER_DAY = /.test(
                    readFileSync(file, 'utf8'),
                ),
            )
            .map((file) => path.relative(path.resolve(), file));
        expect(defining).toEqual(['src/lib/prop-calculator/core/constants.ts']);
    });
});
