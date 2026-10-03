import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const SOURCE_FILE = /\.tsx?$/;
const CORE_DEFINITION = 'lib/prop-calculator/core/accountPolicy/';
const ONE_READER =
    'lib/prop-calculator/advisor/policy/documentedPolicySimInputs.ts';
const TIGHTEST_CALL = /(?<![.\w])tightestVerifiedCumulativeTrigger\(/;
const LIMIT_CALL = /(?<![.\w])verifiedCumulativePayoutLimit\(/;

function filesCalling(pattern: RegExp): readonly string[] {
    return filesUnder(SOURCE_ROOT)
        .filter((full) => pattern.test(readFileSync(full, 'utf8')))
        .map((full) =>
            path.relative(SOURCE_ROOT, full).split(path.sep).join('/'),
        )
        .filter((file) => !file.startsWith(CORE_DEFINITION))
        .toSorted((left, right) => left.localeCompare(right));
}

function filesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

describe('the confirmed cumulative trigger is read in one place (PT-36q, F-145)', () => {
    it('reads the tightest confirmed trigger only through verifiedCumulativeTriggerOf', () => {
        expect(filesCalling(TIGHTEST_CALL)).toStrictEqual([ONE_READER]);
    });

    it('lets no caller outside the core read the bare amount helper', () => {
        expect(filesCalling(LIMIT_CALL)).toStrictEqual([]);
    });
});
