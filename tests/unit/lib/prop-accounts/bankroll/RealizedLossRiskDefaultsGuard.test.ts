import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { posixPath } from '../../../posixPath';

const SOURCES = readdirSync(path.resolve('src'), {
    recursive: true,
    withFileTypes: true,
})
    .filter((dirent) => dirent.isFile() && /\.tsx?$/.test(dirent.name))
    .map((dirent) => {
        const file = path.join(dirent.parentPath, dirent.name);
        return { file, text: readFileSync(file, 'utf8') };
    });

function definingFiles(pattern: RegExp): readonly string[] {
    return SOURCES.filter(({ text }) => pattern.test(text)).map(({ file }) =>
        posixPath(path.relative(path.resolve(), file)),
    );
}

describe('the realized loss risk inputs have one definition (PT-81b)', () => {
    it.each([
        ['the pooled attempt cost', /function pooledAttemptCostCentsOf\(/],
        ['the realized risk seed', /const \w*RISK_SEED\w* = /],
        ['the first payout fallback', /const \w*FIRST_PAYOUT_FALLBACK_DAYS = /],
    ])('defines %s once, in the bankroll module', (_name, pattern) => {
        expect(definingFiles(pattern)).toEqual([
            'src/lib/prop-accounts/bankroll/RealizedLossRisk.ts',
        ]);
    });
});
