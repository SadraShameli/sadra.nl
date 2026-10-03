import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { compareText } from '~/lib/prop-accounts/core';

import { posixPath } from '../../../posixPath';

const SOURCE_ROOT = path.join(import.meta.dirname, '../../../../../src');

const DIAGNOSIS_CALL_OWNERS: readonly string[] = [
    'lib/prop-accounts/conduct/BustDiagnosis.ts',
    'lib/prop-accounts/metrics/StageFunnel.ts',
];

const sources = new Map<string, string>();

function filesMatching(pattern: RegExp): string[] {
    return [...sources]
        .filter(([, text]) => pattern.test(text))
        .map(([file]) => file)
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
    beforeAll(async () => {
        await Promise.all(
            sourceFiles(SOURCE_ROOT).map(async (file) => {
                sources.set(
                    posixPath(path.relative(SOURCE_ROOT, file)),
                    await readFile(file, 'utf8'),
                );
            }),
        );
    });

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
