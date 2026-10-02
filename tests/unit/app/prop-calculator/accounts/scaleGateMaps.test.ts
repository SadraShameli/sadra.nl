import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SCALE_GATE_STATUS_VARIANT } from '~/app/(app)/prop-calculator/accounts/_components/scaleGateBadge';
import {
    SCALE_GATE_STATUS_TEXT,
    ScaleGateStatus,
} from '~/lib/prop-accounts/bankroll';

function byName(a: string, b: string): number {
    return a.localeCompare(b);
}

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const SOURCE_FILE = /\.tsx?$/;
const TEXT_HOME = path.join('lib', 'prop-accounts', 'bankroll', 'ScaleGate.ts');
const VARIANT_HOME = path.join(
    'app',
    '(app)',
    'prop-calculator',
    'accounts',
    '_components',
    'scaleGateBadge.ts',
);

function filesMatching(pattern: RegExp): string[] {
    return sourceFiles(SOURCE_ROOT)
        .map((file) => path.relative(SOURCE_ROOT, file))
        .filter((relative) =>
            pattern.test(
                readFileSync(path.join(SOURCE_ROOT, relative), 'utf8'),
            ),
        );
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return SOURCE_FILE.test(entry.name) ? [full] : [];
    });
}

describe('one scale gate label map and one badge variant map (PT-68b)', () => {
    it('words every scale gate status once, next to the status enum', () => {
        expect(Object.keys(SCALE_GATE_STATUS_TEXT).toSorted(byName)).toEqual(
            Object.values(ScaleGateStatus).toSorted(byName),
        );
        expect(SCALE_GATE_STATUS_TEXT[ScaleGateStatus.Ready]).toBe(
            'Ready to scale',
        );
        expect(filesMatching(/'Not positive after cost'/)).toEqual([TEXT_HOME]);
    });

    it('gives every scale gate status one badge variant, in one app-level leaf', () => {
        expect(Object.keys(SCALE_GATE_STATUS_VARIANT).toSorted(byName)).toEqual(
            Object.values(ScaleGateStatus).toSorted(byName),
        );
        expect(SCALE_GATE_STATUS_VARIANT).toEqual({
            [ScaleGateStatus.NotEnoughSample]: 'warning',
            [ScaleGateStatus.NotPositiveAfterCost]: 'warning',
            [ScaleGateStatus.Ready]: 'outline',
            [ScaleGateStatus.ThresholdsNotSet]: 'secondary',
        });
        expect(
            filesMatching(
                /(?:const|function)\s+(?:SCALE_GATE_STATUS_VARIANT|scaleGateVariant)\b/,
            ),
        ).toEqual([VARIANT_HOME]);
    });
});
