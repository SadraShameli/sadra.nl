import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const HEADROOM_CALL = 'accountCapHeadroomFor(';
const SOURCE_FILE = /\.tsx?$/;
const HEADROOM_DEFINITION = path.join(
    'lib',
    'prop-calculator',
    'core',
    'accountPolicy',
    'AccountCapPolicy.ts',
);
const FREE_SLOT_RULE = path.join(
    'lib',
    'prop-accounts',
    'metrics',
    'PooledCapUsage.ts',
);

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

describe('one free funded slot rule for the next slot page, the pooled cap card and the pooled cap alert', () => {
    it('computes pool headroom only inside the pooled cap usage module', () => {
        const callers = sourceFiles(SOURCE_ROOT)
            .map((file) => path.relative(SOURCE_ROOT, file))
            .filter(
                (relative) =>
                    relative !== HEADROOM_DEFINITION &&
                    readFileSync(
                        path.join(SOURCE_ROOT, relative),
                        'utf8',
                    ).includes(HEADROOM_CALL),
            );
        expect(callers).toEqual([FREE_SLOT_RULE]);
    });
});
