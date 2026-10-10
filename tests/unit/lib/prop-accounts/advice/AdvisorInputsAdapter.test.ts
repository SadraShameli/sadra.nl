import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { optionalDollars, usdCents } from '~/lib/prop-accounts';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const TEST_ROOT = path.join(process.cwd(), 'tests');
const SOURCE_FILE = /\.tsx?$/;

function filesMatching(root: string, pattern: RegExp): string[] {
    return sourceFiles(root)
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => path.relative(process.cwd(), file));
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? full : [];
    });
}

describe('optionalDollars (PT-68d)', () => {
    it('converts a stored cents amount to dollars', () => {
        expect(optionalDollars(usdCents(75_000))).toBe(750);
        expect(optionalDollars(usdCents(1999))).toBe(19.99);
        expect(optionalDollars(usdCents(0))).toBe(0);
    });

    it('reads a missing amount as undefined, never as zero dollars', () => {
        expect(optionalDollars(null)).toBeUndefined();
        expect(optionalDollars(undefined)).toBeUndefined();
    });

    it('accepts a plain stored cents number and refuses a fractional cent amount', () => {
        expect(optionalDollars(12_300)).toBe(123);
        expect(() => optionalDollars(10.5)).toThrow(RangeError);
    });
});

describe('one optional-dollars helper and no unused advisor inputs adapter (PT-68d)', () => {
    it('defines optionalDollars once across src', () => {
        expect(
            filesMatching(SOURCE_ROOT, /function optionalDollars\b/),
        ).toEqual([
            path.join(
                'src',
                'lib',
                'prop-accounts',
                'advice',
                'AdvisorInputsAdapter.ts',
            ),
        ]);
    });

    it('has no advisorInputsFrom left in src or tests beyond this guard', () => {
        expect(filesMatching(SOURCE_ROOT, /advisorInputsFrom/)).toEqual([]);
        expect(filesMatching(TEST_ROOT, /advisorInputsFrom\(/)).toEqual([]);
    });
});
