import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { compareText } from '~/lib/prop-accounts/core';

const SOURCE_ROOT = path.join(import.meta.dirname, '../../../../../src');

const DIAGNOSIS_CALL_OWNERS: readonly string[] = [
    'lib/prop-accounts/conduct/BustDiagnosis.ts',
    'lib/prop-accounts/metrics/StageFunnel.ts',
];

function filesMatching(pattern: RegExp): string[] {
    return sourceFiles(SOURCE_ROOT)
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => path.relative(SOURCE_ROOT, file))
        .toSorted(compareText);
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(child);
        return /\.tsx?$/.test(entry.name) ? [child] : [];
    });
}

describe('the per-account bust diagnosis', () => {
    it('is called only by the rule itself and the funnel module, so the detail page uses the funnel helper', () => {
        expect(filesMatching(/\bbustDiagnosisOf\(/)).toEqual(
            DIAGNOSIS_CALL_OWNERS,
        );
    });

    it('is defined once for the funnel and once per firm aggregation', () => {
        expect(filesMatching(/function bustDiagnosisOfAttempt\(/)).toEqual([
            'lib/prop-accounts/metrics/StageFunnel.ts',
        ]);
        expect(filesMatching(/function bustSplitByFirm\(/)).toEqual([
            'lib/prop-accounts/metrics/StageFunnel.ts',
        ]);
        expect(filesMatching(/function bustDiagnosisKindOf\(/)).toEqual([]);
    });
});
