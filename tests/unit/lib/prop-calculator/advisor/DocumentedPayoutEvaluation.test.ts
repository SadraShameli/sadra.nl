import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluateDocumentedPayout } from '~/lib/prop-calculator/advisor/PayoutReadiness';
import {
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    PayoutEvaluationKind,
    PayoutRequestPolicy,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

const ADVISOR_ROOT = path.resolve(
    import.meta.dirname,
    '../../../../../src/lib/prop-calculator/advisor',
);
const EVALUATING_FILES = [
    'PayoutReadiness.ts',
    'PayoutRequestRule.ts',
    'value/MilestoneState.ts',
];

function advisorSourceFiles(): string[] {
    return readdirSync(ADVISOR_ROOT, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) =>
            path.relative(
                ADVISOR_ROOT,
                path.join(entry.parentPath, entry.name),
            ),
        )
        .toSorted((left, right) => left.localeCompare(right));
}

function occurrences(source: string, needle: string): number {
    return source.split(needle).length - 1;
}

function sourceOf(file: string): string {
    return readFileSync(path.join(ADVISOR_ROOT, file), 'utf8');
}

describe('one documented payout evaluation (PT-67d, F-V17)', () => {
    it('names the tracker payout evaluation only in the documented evaluation and the next-payout projection, anywhere under advisor', () => {
        const named = advisorSourceFiles()
            .map((file) => ({
                count: sourceOf(file).split(/\bevaluatePayout\b/).length - 1,
                file,
            }))
            .filter((entry) => entry.count > 0);

        expect(named).toEqual([
            { count: 1, file: 'NextPayoutProjection.ts' },
            { count: 1, file: 'PayoutReadiness.ts' },
        ]);
    });

    it('spells the full-request-only policy out in exactly one place across those layers', () => {
        const spelled = EVALUATING_FILES.map((file) => ({
            count: occurrences(
                sourceOf(file),
                'PayoutRequestPolicy.FullRequestOnly',
            ),
            file,
        }));

        expect(spelled.filter((entry) => entry.count > 0)).toEqual([
            { count: 1, file: 'PayoutReadiness.ts' },
        ]);
    });

    it('is the evaluation the request rule and the milestone state both import', () => {
        for (const file of [
            'PayoutRequestRule.ts',
            'value/MilestoneState.ts',
        ]) {
            expect(sourceOf(file)).toContain('evaluateDocumentedPayout');
        }
    });
});

describe('evaluateDocumentedPayout (PT-67d)', () => {
    it('is the tracker evaluation under the full-request-only policy', () => {
        const plan = findFirm(FirmId.Mffu)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.RapidEod,
        });
        if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        const tracker = newFundedCycleTracker(state);
        const input = {
            minRetainedCushion: 0,
            payoutRequestSize: 500,
            plan,
            state,
            tracker,
        };

        expect(evaluateDocumentedPayout(input)).toEqual(
            tracker.evaluatePayout({
                minRetainedCushion: 0,
                payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                payoutRequestSize: 500,
                plan,
                state,
            }),
        );
        expect(evaluateDocumentedPayout(input).kind).toBe(
            PayoutEvaluationKind.Blocked,
        );
    });
});
