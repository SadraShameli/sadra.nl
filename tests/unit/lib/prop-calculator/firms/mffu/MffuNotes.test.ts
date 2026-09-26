import { describe, expect, it } from 'vitest';

import { FirmId, MffuVariant } from '~/lib/prop-calculator/core';
import {
    FundedDpModelGapKind,
    fundedDpModelGaps,
} from '~/lib/prop-calculator/core/FundedDpModelGaps';
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

    it('states the in-buffer rule and its one-time exception from both help articles, and the plan page sentence on regular payouts (N-51)', () => {
        const note = noteContaining('One-time withdrawal');

        expect(note).toContain(
            'trader cannot request first withdrawal until the account balance is above the starting balance plus the buffer amount',
        );
        expect(note).toContain(
            'Up to 60% of profits can be withdrawn, with a minimum of $1,000. Remaining 40% remains for continued trading.',
        );
        expect(note).toContain(
            'Withdrawal While in Buffer: You can withdraw up to 60% of your profits before fully clearing the buffer.',
        );
        expect(note).toContain(
            'You also need to have cleared the required buffer before a payout can be approved',
        );
        expect(note).not.toContain('conflict');
    });

    it('discloses the opt-in model of the one-time early withdrawal and its assumed MLL treatment (N-64, T30)', () => {
        const note = noteContaining('One-time withdrawal');

        expect(note).toContain('--early-withdrawal');
        expect(note).toContain('off by default');
        expect(note).toContain(
            'After your first approved payout, the MLL locks permanently at your starting balance plus $100',
        );
        expect(note).toContain('assumption');
    });

    it('points the lifetime-cap note at the in-buffer note instead of calling the 60% withdrawal contested', () => {
        const note = noteContaining("Pro's $100,000 lifetime cap");

        expect(note).toContain('see the N-51 note');
        expect(note).not.toContain('contested');
    });

    it('states the Pro payout day gate as 14 calendar days from the first sim-funded trade, modeled as 10 sessions including idle ones (N-7)', () => {
        const note = noteContaining('initialWithdrawalDays:14');

        expect(note).toContain(
            'The 14-day window runs from your first trade on the sim funded account',
        );
        expect(note).toContain('10 sessions');
        expect(note).toContain('idle');
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

describe('MyFundedFutures notes match the current engine (WP26 notes audit)', () => {
    const firm = new MyFundedFutures();

    function mffPlan(variant: MffuVariant) {
        const plan = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant,
        });
        if (plan === undefined) throw new Error(`no MFF 50K ${variant}`);
        return plan;
    }

    it("says Builder's unset minPayoutRequest would default to $0, not inherit minPayoutProfit", () => {
        const note = noteContaining("Builder's minPayoutRequest");
        expect(note).not.toContain("inherit minPayoutProfit's");
        expect(note).toContain('it would default to $0 (the Plan default)');
        const builder = mffPlan(MffuVariant.Builder);
        expect(builder.minPayoutRequest).toBe(
            builder.payoutLadder?.minRequestAmount,
        );
    });

    it('says the $100,000 lifetime cap stops new payouts only in the simulator and the funded DP ignores it', () => {
        const note = noteContaining("Pro's $100,000 lifetime cap");
        expect(note).not.toContain('payouts simply stop at the cap');
        expect(note).toContain(
            'the payout that crosses the cap left untrimmed',
        );
        expect(note).toContain('LifetimeDollarCapIgnored');
        expect(
            fundedDpModelGaps(mffPlan(MffuVariant.Pro)).map((gap) => gap.kind),
        ).toContain(FundedDpModelGapKind.LifetimeDollarCapIgnored);
    });
});
