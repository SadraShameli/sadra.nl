import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const REFUSAL_FILE = path.join(
    'lib',
    'prop-calculator',
    'advisor',
    'EngineOptimumRunner.ts',
);
const ASSUMPTION_FILE = path.join(
    'lib',
    'prop-calculator',
    'advisor',
    'Assumption.ts',
);
const SOURCE_FILE = /\.tsx?$/;
const SHARED_WORDING: readonly (readonly [RegExp, readonly string[]])[] = [
    [/ladder search not run/, [REFUSAL_FILE]],
    [/grid too large/, [REFUSAL_FILE]],
    [/The grid step is/, [ASSUMPTION_FILE]],
    [/It searched in/, []],
    [/coarser risk step/, [ASSUMPTION_FILE]],
    [/ladderStepOf/, []],
];

function filesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

describe('the ladder wording and the step reader have one copy (PT-24d review)', () => {
    const sources = filesUnder(SOURCE_ROOT).map((file) => ({
        relative: path.relative(SOURCE_ROOT, file),
        text: readFileSync(file, 'utf8'),
    }));

    it.each(
        SHARED_WORDING.map(([pattern, expected]) => [
            String(pattern),
            pattern,
            expected,
        ]),
    )('only the shared advisor module holds %s', (_name, pattern, expected) => {
        const holders = sources
            .filter(({ text }) => pattern.test(text))
            .map(({ relative }) => relative);

        expect(holders).toStrictEqual(expected);
    });
});
