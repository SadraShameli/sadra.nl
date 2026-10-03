import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    inputAssumption,
    labelledAssumptionLines,
    type LiveTransferHazardAssumption,
} from '~/lib/prop-calculator/advisor';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

const LIVE_TRANSFER: LiveTransferHazardAssumption = {
    bias: AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    hazard: 0.3,
    kind: AssumptionKind.LiveTransferHazard,
    notes: ['A plan note.'],
    sentLiveShare: 0.41,
};

const SRC = path.join(process.cwd(), 'src');
const APP = path.join(SRC, 'app', '(app)', 'prop-calculator');
const CALLERS: readonly string[] = [
    path.join(APP, 'accounts', '_components', 'overview', 'overviewModel.ts'),
    path.join(
        APP,
        'accounts',
        '_components',
        'overview',
        'accountFromStateModel.ts',
    ),
    path.join(APP, 'accounts', 'next-slot', 'nextSlotModel.ts'),
    path.join(APP, 'accounts', '_components', 'detail', 'fromStateDetail.ts'),
];
const LABEL_THEN_TEXT = /\.\s\$\{assumptionText\(/;

describe('labelledAssumptionLines (PT-73g step 5)', () => {
    it('is the label, a full stop, a space and the assumption text', () => {
        expect(
            labelledAssumptionLines('Documented policy', LIVE_TRANSFER),
        ).toStrictEqual([
            `Documented policy. ${assumptionText(LIVE_TRANSFER)}`,
        ]);
    });

    it('is empty for an absent assumption', () => {
        expect(
            labelledAssumptionLines('Documented policy', undefined),
        ).toStrictEqual([]);
    });

    it('labels any assumption kind, not only the live-transfer one', () => {
        const input = inputAssumption(
            AssumptionKind.NoHolidayCalendar,
            AssumptionBias.Neutral,
        );

        expect(labelledAssumptionLines('Note', input)).toStrictEqual([
            `Note. ${assumptionText(input)}`,
        ]);
    });
});

describe('one labelled-assumption line construction (PT-73g step 5)', () => {
    it.each(CALLERS.map((file) => ({ file, name: path.basename(file) })))(
        '$name builds its labelled lines through the helper',
        ({ file }) => {
            const source = readFileSync(file, 'utf8');

            expect(source).toContain('labelledAssumptionLines');
            expect(source).not.toMatch(LABEL_THEN_TEXT);
        },
    );

    it('keeps the label-then-text template in Assumption.ts only', () => {
        const home = readFileSync(
            path.join(
                SRC,
                'lib',
                'prop-calculator',
                'advisor',
                'Assumption.ts',
            ),
            'utf8',
        );

        expect(home).toMatch(LABEL_THEN_TEXT);
    });
});
