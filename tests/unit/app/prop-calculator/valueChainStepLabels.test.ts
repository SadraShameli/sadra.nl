import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    stepAssumptionsHeading,
    VALUE_CHAIN_STEP_LABEL,
} from '~/app/(app)/prop-calculator/_components/value/valueChainStepLabels';
import { ValueChainStepKind } from '~/lib/prop-calculator/advisor/value';

import { posixPath } from '../../posixPath';

const APP_ROOT = path.resolve(import.meta.dirname, '../../../../src/app');
const LABEL_LEAF =
    '(app)/prop-calculator/_components/value/valueChainStepLabels.ts';

function compareText(a: string, b: string): number {
    return a.localeCompare(b);
}

describe('the value chain step labels (PT-37b, F-V18)', () => {
    it('names every chain step kind with its own non-empty label', () => {
        const kinds: readonly string[] = Object.values(ValueChainStepKind);
        expect(
            Object.keys(VALUE_CHAIN_STEP_LABEL).toSorted(compareText),
        ).toEqual(kinds.toSorted(compareText));
        expect(new Set(Object.values(VALUE_CHAIN_STEP_LABEL)).size).toBe(
            kinds.length,
        );
        for (const label of Object.values(VALUE_CHAIN_STEP_LABEL)) {
            expect(label.trim().length).toBeGreaterThan(0);
        }
    });

    it('keeps the documented wording of each step', () => {
        expect(VALUE_CHAIN_STEP_LABEL).toEqual({
            [ValueChainStepKind.EvalStart]: 'Eval start',
            [ValueChainStepKind.FirstPayoutEligible]: 'First payout eligible',
            [ValueChainStepKind.FreshFunded]: 'Fresh funded',
            [ValueChainStepKind.PostFirstPayout]: 'Post first payout',
        });
    });

    it('is the only place under src/app that spells the step labels out', () => {
        const offenders = readdirSync(APP_ROOT, {
            recursive: true,
            withFileTypes: true,
        })
            .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
            .map((entry) => path.join(entry.parentPath, entry.name))
            .filter((file) =>
                /'(?:Eval start|First payout eligible|Fresh funded|Post first payout)'/u.test(
                    readFileSync(file, 'utf8'),
                ),
            )
            .map((file) => posixPath(path.relative(APP_ROOT, file)));
        expect(offenders).toEqual([LABEL_LEAF]);
    });

    it('builds every step assumptions heading in the label leaf only', () => {
        expect(
            stepAssumptionsHeading(ValueChainStepKind.FirstPayoutEligible),
        ).toBe('First payout eligible assumptions');
        const builders = readdirSync(APP_ROOT, {
            recursive: true,
            withFileTypes: true,
        })
            .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
            .map((entry) => path.join(entry.parentPath, entry.name))
            .filter((file) =>
                /\} assumptions`|\]\}\{' '\}\s*assumptions/u.test(
                    readFileSync(file, 'utf8'),
                ),
            )
            .map((file) => posixPath(path.relative(APP_ROOT, file)));
        expect(builders).toEqual([LABEL_LEAF]);
    });
});
