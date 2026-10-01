import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { CALCULATOR_FIELD_LABELS } from '~/app/(app)/prop-calculator/_components/calculatorFieldLabels';
import { calculatorFieldLabelOf } from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '../../../../src');

const LABEL_MODULE = 'app/(app)/prop-calculator/_components/calculatorFieldLabels.ts';

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

describe('calculator field labels (PT-67b step 5)', () => {
    it('keeps the labels the calculator inputs show', () => {
        expect(CALCULATOR_FIELD_LABELS.payoutRequestOverride).toBe(
            'Payout request size ($)',
        );
        expect(CALCULATOR_FIELD_LABELS.retainedCushionRequest).toBe(
            'Retained cushion on payout ($)',
        );
        expect(CALCULATOR_FIELD_LABELS.instrument).toBe(
            'Instrument (contract-limit enforcement)',
        );
        expect(CALCULATOR_FIELD_LABELS.stopPoints).toBe('Stop distance (points)');
    });

    it('names the funded horizon exactly as the visible input label reads', () => {
        const form = readFileSync(
            path.join(
                SOURCE_ROOT,
                'app/(app)/prop-calculator/_components/CalculatorInputsForm.tsx',
            ),
            'utf8',
        );
        const visible = /htmlFor="funded-horizon-days"\s*>\s*([^<]+?)\s*<\/label>/.exec(
            form,
        );
        expect(visible?.[1]).toBe(CALCULATOR_FIELD_LABELS.fundedHorizonDays);
    });

    it('names the calculator fields in the value refusal text from the same labels', () => {
        expect(calculatorFieldLabelOf(['payoutRequestOverride'])).toBe(
            CALCULATOR_FIELD_LABELS.payoutRequestOverride,
        );
        expect(calculatorFieldLabelOf(['retainedCushionRequest'])).toBe(
            CALCULATOR_FIELD_LABELS.retainedCushionRequest,
        );
    });

    it('spells the payout request, retained cushion and instrument labels in one source file only', () => {
        const files = sourceFiles(SOURCE_ROOT).map((file) => ({
            file: path.relative(SOURCE_ROOT, file).split(path.sep).join('/'),
            text: readFileSync(file, 'utf8'),
        }));
        for (const label of [
            CALCULATOR_FIELD_LABELS.payoutRequestOverride,
            CALCULATOR_FIELD_LABELS.retainedCushionRequest,
            CALCULATOR_FIELD_LABELS.instrument,
        ]) {
            expect(
                files.filter(({ text }) => text.includes(label)).map(({ file }) => file),
            ).toEqual([LABEL_MODULE]);
        }
    });
});
