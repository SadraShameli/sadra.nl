import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    adviceReportLines,
    type AdviseArguments,
    adviseArguments,
    readAdviseInputs,
} from '~/cli/commands/prop/advise/command';
import {
    AccountReconstruction,
    createSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
} from '~/lib/prop-calculator/advisor';

const LIVE_APEX_EOD = [
    '--firm',
    'apex',
    '--variant',
    'eod',
    '--stage',
    'live',
    '--balance',
    '50000',
    '--highest-eod',
    '50000',
    '--trading-days',
    '5',
    '--payouts',
    '0',
    '--trials',
    '10',
];

const NQ_AT_300_POINTS = ['--instrument', 'NQ', '--stop-points', '300'];
const MNQ_AT_1_POINT = ['--instrument', 'MNQ', '--stop-points', '1'];

function parseAdvise(argv: string[]): AdviseArguments {
    return parseArgs<typeof adviseArguments>(argv, adviseArguments);
}

function reportLinesFor(argv: string[]): string[] {
    const { options, plan, snapshot } = readAdviseInputs(parseAdvise(argv));
    const advisor = createSizingAdvisor(
        AccountReconstruction.rebuild(
            snapshot,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        ),
        options,
    );
    return adviceReportLines(
        advisor.assemble([]),
        options.positionSizing?.stopPoints ?? null,
        options.positionSizing?.instrument ?? null,
    );
}

describe('prop advise places a live rung at the entered instrument and stop (PT-73c addendum B, N-94)', () => {
    it('says a live rung cannot be placed when one contract at the entered stop risks more than the rung', () => {
        const lines = reportLinesFor([...LIVE_APEX_EOD, ...NQ_AT_300_POINTS]);
        const rungLines = lines.filter((line) => line.startsWith('rung '));

        expect(rungLines.length).toBeGreaterThan(0);
        for (const line of rungLines) {
            expect(line).toContain('cannot be placed');
        }
    });

    it('says nothing when one live contract fits inside the rung', () => {
        const lines = reportLinesFor([...LIVE_APEX_EOD, ...MNQ_AT_1_POINT]);

        expect(lines.some((line) => line.startsWith('rung '))).toBe(true);
        expect(lines.join('\n')).not.toContain('cannot be placed');
    });

    it('says nothing while no stop is entered on a live account', () => {
        const lines = reportLinesFor(LIVE_APEX_EOD);

        expect(lines.join('\n')).not.toContain('cannot be placed');
    });
});
