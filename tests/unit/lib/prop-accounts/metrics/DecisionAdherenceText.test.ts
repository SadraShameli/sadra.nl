import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ADHERENCE_STEP_REASON } from '~/lib/prop-accounts/metrics';

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const RULE_FILE = path.join(
    'lib',
    'prop-accounts',
    'metrics',
    'DecisionAdherence.ts',
);

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.tsx?$/u.test(entry.name) ? full : [];
    });
}

describe('the followed rule explains its step in one place', () => {
    it('states why the step is one rounding step', () => {
        expect(ADHERENCE_STEP_REASON).toBe(
            'one rounding step, because a decision records no stop',
        );
    });

    it('writes the reason only next to the rule, for the review and the overview to share', () => {
        const writers = sourceFiles(SOURCE_ROOT)
            .filter((file) =>
                readFileSync(file, 'utf8').includes(
                    'because a decision records no stop',
                ),
            )
            .map((file) => path.relative(SOURCE_ROOT, file));
        expect(writers).toEqual([RULE_FILE]);
    });
});
