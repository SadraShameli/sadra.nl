import { parseArgs } from 'citty';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    AdviceDisplayKind,
    adviceViewModel,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import {
    adviceReportLines,
    adviseArguments,
    readAdviseInputs,
} from '~/cli/commands/prop/advise/command';
import {
    AccountReconstruction,
    type Advice,
    CONSISTENCY_CEILING_NOTE_TEXT,
    ConsistencyCeilingNote,
    createSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
} from '~/lib/prop-calculator/advisor';

const FUNDED_APEX_EOD = [
    '--firm',
    'apex',
    '--variant',
    'eod',
    '--stage',
    'funded',
    '--balance',
    '52000',
    '--highest-eod',
    '52000',
    '--trading-days',
    '5',
    '--payouts',
    '0',
    '--trials',
    '10',
];

const REPO_ROOT = process.cwd();

const CONSUMER_FILES = [
    'src/cli/commands/prop/advise/command.ts',
    'src/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel.ts',
    'src/app/(app)/prop-calculator/accounts/_components/advice/DailyPlanCardView.tsx',
];

function adviceWithNote(note: ConsistencyCeilingNote): Advice {
    const { options, plan, snapshot } = readAdviseInputs(
        parseArgs<typeof adviseArguments>(
            [...FUNDED_APEX_EOD],
            adviseArguments,
        ),
    );
    const advice = createSizingAdvisor(
        AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        ),
        options,
    ).assemble([]);
    if (advice.dailyPlanCard === null) throw new Error('expected a card');
    return {
        ...advice,
        dailyPlanCard: { ...advice.dailyPlanCard, consistencyNote: note },
    };
}

describe('one consistency ceiling note text for every surface (PT-109b step 4, F-146)', () => {
    it.each(Object.values(ConsistencyCeilingNote))(
        'has a sentence for %s',
        (note) => {
            expect(CONSISTENCY_CEILING_NOTE_TEXT[note].length).toBeGreaterThan(
                0,
            );
        },
    );

    it.each(Object.values(ConsistencyCeilingNote))(
        'is printed by the CLI report as is for %s',
        (note) => {
            expect(adviceReportLines(adviceWithNote(note))).toContain(
                CONSISTENCY_CEILING_NOTE_TEXT[note],
            );
        },
    );

    it.each(Object.values(ConsistencyCeilingNote))(
        'is the daily card text of the web view for %s',
        (note) => {
            const view = adviceViewModel(adviceWithNote(note), {
                caps: NO_PERSONAL_CAPS,
                dailyLossLimit: null,
            });
            if (view.kind !== AdviceDisplayKind.Ready) {
                throw new Error('expected ready advice');
            }
            expect(view.dailyPlanCard?.consistencyNoteText).toBe(
                CONSISTENCY_CEILING_NOTE_TEXT[note],
            );
        },
    );

    it('is defined in no consumer: no local note table and none of the sentences', () => {
        for (const file of CONSUMER_FILES) {
            const source = readFileSync(path.join(REPO_ROOT, file), 'utf8');
            expect(source, file).not.toContain('Record<ConsistencyCeilingNote');
            for (const text of Object.values(CONSISTENCY_CEILING_NOTE_TEXT)) {
                expect(source, file).not.toContain(text);
            }
        }
    });
});
