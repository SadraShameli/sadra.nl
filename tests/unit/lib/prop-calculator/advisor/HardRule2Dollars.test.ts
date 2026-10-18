import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
} from '~/lib/prop-calculator/advisor';
import { CENTS_PER_DOLLAR } from '~/lib/prop-calculator/core';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const DOLLARS_CONVERSION =
    /HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS\s*\/\s*CENTS_PER_DOLLAR/;
const SOURCE_FILE = /\.tsx?$/;
const RULEBOOK = path.join('lib', 'prop-calculator', 'advisor', 'Rulebook.ts');

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? full : [];
    });
}

describe('one Hard Rule 2 retained cushion in dollars', () => {
    it('is the cents minimum expressed in dollars', () => {
        expect(HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS).toBe(
            HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS / CENTS_PER_DOLLAR,
        );
    });

    it('is converted from cents only in the rulebook module', () => {
        const converters = sourceFiles(SOURCE_ROOT)
            .map((file) => path.relative(SOURCE_ROOT, file))
            .filter((relative) =>
                DOLLARS_CONVERSION.test(
                    readFileSync(path.join(SOURCE_ROOT, relative), 'utf8'),
                ),
            );
        expect(converters).toEqual([RULEBOOK]);
    });
});
