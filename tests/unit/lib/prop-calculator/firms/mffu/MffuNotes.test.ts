import { describe, expect, it } from 'vitest';

import {
    FirmId,
    LifetimeCapScope,
    MffuVariant,
} from '~/lib/prop-calculator/core';
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

    it('marks the $100,000 cap per user and says the accounts alert pools the Pro accounts', () => {
        const note = noteContaining("Pro's $100,000 lifetime cap");
        expect(mffPlan(MffuVariant.Pro).lifetimeConclusion.dollarCapScope).toBe(
            LifetimeCapScope.PerUserAcrossVariant,
        );
        expect(note).toContain(
            "re-read 2026-09-26: the table row 'Maximum Payout (per user)' shows $100,000 for the 50K, 100K and 150K Pro accounts",
        );
        expect(note).toContain(
            'the accounts alert LifetimeDollarCapNear pools your Pro accounts',
        );
    });

    it('names which multi-account projections now pool the per-user cap and which still do not (PT-12h, PT-12l)', () => {
        const note = noteContaining("Pro's $100,000 lifetime cap");
        expect(note).not.toContain(
            'a single-account simulation cannot pool payouts across accounts',
        );
        for (const consumer of [
            'simulatePortfolioTimeline',
            'cash-flow page',
            'simulatePortfolio',
            'strategy lab',
            'copyAccounts',
            'prop sim',
            'prop compare',
            'prop optimize funded',
        ]) {
            expect(note).toContain(consumer);
        }
        expect(note).toContain('now pools one shared $100,000 budget');
        expect(note).toContain(
            'prop sim and prop compare read simulate() directly',
        );
        expect(note).toContain(
            "prop optimize funded's own DP-solved objective values",
        );
        expect(note).toContain('still do not apply the cap at all');
    });

    it('keeps the per-cycle versus lifetime reading of the $100,000 per-user maximum open', () => {
        const note = noteContaining("Pro's $100,000 lifetime cap");
        expect(note).toContain(
            "the row reads 'Maximum Payout (per user)' and does not itself say lifetime",
        );
        expect(note).toContain(
            'whether the cap also counts payouts on your other MFF plans is not stated',
        );
    });
});

describe('MyFundedFutures notes disclose the PT-71c findings (N-84, U24, U26)', () => {
    it('cites the Rapid plan page FAQ for the re-buy retry and says a reset coupon does not apply', () => {
        const note = noteContaining('There is no reset');

        expect(note).toContain('myfundedfutures.com/plans/rapid');
        expect(note).toContain(
            "If you breach the max drawdown on a Rapid account, the account ends and you'll need to start a new evaluation. There is no reset",
        );
        expect(note).toContain('RetryKind.Rebuy');
        expect(note).toContain('--eval-discount');
        expect(note).toContain('--reset-discount');
    });

    it('discloses the Rapid 50K "start off with 2 contracts" scaling statement and its unknown schedule (U26)', () => {
        const note = noteContaining('start off with 2 contracts');

        expect(note).toContain(
            'if you are trading a Rapid 50k sim funded plan, you start off with 2 contracts (2 minis OR 20 micros) due to the scaling plan',
        );
        expect(note).toContain('10244682');
        expect(note).toContain('flat 5 mini / 50 micro');
        expect(note).toContain('schedule');
        expect(note).toContain('U26');
    });

    it('discloses the Pro and Rapid EOD reset prices as modeling defaults pending a dashboard answer (U24)', () => {
        const note = noteContaining('modeling default');

        expect(note).toContain('Pro 50K');
        expect(note).toContain('$265');
        expect(note).toContain('Rapid EOD 50K');
        expect(note).toContain('$209');
        expect(note).toContain(
            'Resets will continue to work the same way for all accounts',
        );
        expect(note).toContain('U24');
    });

    it('discloses that no public page gives a Rapid Live daily loss limit, so the engine keeps none (U24)', () => {
        const note = noteContaining('Rapid Live daily loss limit');

        expect(note).toContain('13134718');
        expect(note).toContain(
            'Customizable Daily Loss Limit: You can set a daily loss limit tailored to your risk tolerance and trading style.',
        );
        expect(note).toContain(
            'all Live accounts have different limits to both their position size and Daily Loss Limits (DLL)',
        );
        expect(note).toContain('liveDailyLossLimit null');
        expect(note).toContain('U24');
    });
});
