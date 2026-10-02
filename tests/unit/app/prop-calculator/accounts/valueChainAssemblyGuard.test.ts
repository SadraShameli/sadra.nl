import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const VALUE_ROOT = path.join(
    SOURCE_ROOT,
    'lib',
    'prop-calculator',
    'advisor',
    'value',
);
const SOURCE_FILE = /\.tsx?$/;
const CHAIN_STEP_BUILDERS =
    /\b(firstPayoutEligibleAccount|firstPayoutEligibleBuild|postFirstPayoutAccount)\b/u;

function filesMatching(pattern: RegExp): string[] {
    return sourceFiles(SOURCE_ROOT)
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => path.relative(SOURCE_ROOT, file))
        .toSorted((left, right) => left.localeCompare(right));
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

describe('one value chain assembly in src (PT-67e, F-V18)', () => {
    it('names the chain step builders only in the value lib', () => {
        const outsideValueLib = filesMatching(CHAIN_STEP_BUILDERS).filter(
            (file) =>
                !path
                    .join(SOURCE_ROOT, file)
                    .startsWith(`${VALUE_ROOT}${path.sep}`),
        );
        expect(outsideValueLib).toEqual([]);
    });

    it('calls the lib valueChain from the overview worker and the tools worker, the two places that build a chain', () => {
        expect(filesMatching(/\bvalueChain\(/u)).toEqual([
            path.join(
                'app',
                '(app)',
                'prop-calculator',
                '_workers',
                'overviewWorkerMessages.ts',
            ),
            path.join(
                'app',
                '(app)',
                'prop-calculator',
                '_workers',
                'toolsWorker.ts',
            ),
            path.join(
                'lib',
                'prop-calculator',
                'advisor',
                'value',
                'ValueChain.ts',
            ),
        ]);
    });
});
