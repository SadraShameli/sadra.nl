import { describe, expect, it } from 'vitest';

import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';

const NOTES = new MyFundedFutures().notes;

function noteContaining(marker: string): string {
    const note = NOTES.find((candidate) => candidate.includes(marker));
    if (note === undefined) throw new Error(`no MFF note contains ${marker}`);
    return note;
}

describe('MyFundedFutures notes after the MFF Pro rechecks (live-recheck.md, 2026-09-23)', () => {
    it('quotes the Pro plan page FAQ that confirms the funded MLL trails at end of day until the first payout', () => {
        const note = noteContaining("Pro's Sim Funded drawdown locks");

        expect(note).toContain(
            'Until that first payout, the MLL continues to trail each time you set a new EOD equity high',
        );
        expect(note).not.toContain('Not Confirmed');
    });

    it("explains Pro's evaluation lock as the eval config's own maxDrawdownLimit, not an undocumented pending decision", () => {
        const note = noteContaining("Pro's Sim Funded drawdown locks");

        expect(note).toContain('"maxDrawdownLimit":50100');
        expect(note).not.toContain('pending a separate decision');
    });

    it('discloses the conflicting in-buffer withdrawal statements of article 13745661 and the plan page (N-51)', () => {
        const note = noteContaining('Withdrawal While in Buffer');

        expect(note).toContain(
            'You can withdraw up to 60% of your profits before fully clearing the buffer',
        );
        expect(note).toContain(
            'Must meet the buffer target before requesting a payout',
        );
        expect(note).toContain(
            'You also need to have cleared the required buffer before a payout can be approved',
        );
    });

    it('never calls the 60% in-buffer withdrawal confirmed, and points the lifetime-cap note at the N-51 conflict instead', () => {
        const confirmedSixtyPercent = NOTES.flatMap((note) =>
            note
                .split('. ')
                .filter(
                    (sentence) =>
                        sentence.includes('60%') &&
                        sentence.includes('confirmed'),
                ),
        );

        expect(confirmedSixtyPercent).toStrictEqual([]);
        expect(noteContaining("Pro's $100,000 lifetime cap")).toContain(
            'see the N-51 note',
        );
    });

    it('states the firm-wide $250 minimum live withdrawal applied to Rapid Live (N-41)', () => {
        expect(
            noteContaining('Rapid Live (modeled in MffuRapidLive.ts'),
        ).toContain(
            'Live traders must ensure that the minimum amount that they can withdraw is $250',
        );
    });

    it('uses no em dashes', () => {
        for (const note of NOTES) {
            expect(note).not.toContain('\u{2014}');
        }
    });
});
