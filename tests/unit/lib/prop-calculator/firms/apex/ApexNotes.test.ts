import { describe, expect, it } from 'vitest';

import { ApexTraderFunding } from '~/lib/prop-calculator/firms/apex/ApexTraderFunding';

const notes = new ApexTraderFunding().notes;

const FEE_NOTE_MARKER = 'Apex 50K fees are the no-code';
const COUPON_NOTE_MARKER = 'SAVENOW';
const PACK_NOTE_MARKER = '5-Pack';
const LIVE_NOTE_MARKER = 'Apex Live Levels';

function noteContaining(marker: string) {
    const note = notes.find((candidate) => candidate.includes(marker));
    if (note === undefined) {
        throw new Error(`no Apex note contains "${marker}"`);
    }
    return note;
}

describe('Apex fee note (homepage product picker, dateModified 2026-08-25, user-pasted 2026-09-23)', () => {
    it('cites the product picker prices for both 50K evals', () => {
        const note = noteContaining(FEE_NOTE_MARKER);
        expect(note).toContain('window.productPickerConfig');
        expect(note).toContain('2026-08-25');
        expect(note).toContain('EOD $590 eval and $90 PA activation');
        expect(note).toContain('Intraday $249 eval and $59 PA activation');
    });

    it('says the re-buy follows the eval price because there are no reset fees', () => {
        const note = noteContaining(FEE_NOTE_MARKER);
        expect(note).toContain('There are no reset fees');
        expect(note).toContain('re-buy');
    });
});

describe('Apex SAVENOW note (N-33)', () => {
    it('says SAVENOW covers the current EOD and Intraday evals and is a typed code modeled with --eval-discount', () => {
        const note = noteContaining(COUPON_NOTE_MARKER);
        expect(note).toContain('promoData');
        expect(note).toContain('EndOfDay');
        expect(note).toContain('RealTime');
        expect(note).toContain('typed code');
        expect(note).toContain('--eval-discount');
    });

    it('drops the stale claim that SAVENOW only covers the Legacy line', () => {
        for (const note of notes) {
            expect(note).not.toContain(
                "applies to Apex's revived Legacy subscription product line, not the current one-time-fee flagship",
            );
            expect(note).not.toContain(
                'a user should not apply a 90% discount',
            );
        }
    });
});

describe('Apex 5-Pack note (N-33)', () => {
    it('lists the current 5-Pack prices from the product picker', () => {
        const note = noteContaining(PACK_NOTE_MARKER);
        expect(note).toContain('25K $2,250');
        expect(note).toContain('50K $2,450');
        expect(note).toContain('100K $4,950');
        expect(note).toContain('150K $9,950');
    });

    it('drops the stale 5-Pack prices', () => {
        for (const note of notes) {
            expect(note).not.toContain('25K $1,950');
            expect(note).not.toContain('100K $4,450/150K $8,950');
        }
    });
});

describe('Apex Live note (WP12b handoff, pasted Live Prop Trading Program FAQ, dateModified 2026-06-30)', () => {
    it('lists Levels 1 to 3 with their contract caps and daily loss limits, set from the prior close', () => {
        const note = noteContaining(LIVE_NOTE_MARKER);
        expect(note).toContain('Level 1');
        expect(note).toContain('10 mini / 100 micro');
        expect(note).toContain('no DLL');
        expect(note).toContain('25 mini / 250 micro');
        expect(note).toContain('$5,000 DLL');
        expect(note).toContain('30 mini / 300 micro');
        expect(note).toContain('$10,000 DLL');
        expect(note).toContain('prior close');
        expect(note).toContain('TierBasis.SessionOpenProfit');
    });

    it('keeps Level 4 on Level 3 limits as a custom review', () => {
        const note = noteContaining(LIVE_NOTE_MARKER);
        expect(note).toContain('Level 4');
        expect(note).toContain('Custom review');
        expect(note).toContain('Level 3 limits');
    });

    it('states the $500 live minimum payout request', () => {
        expect(noteContaining(LIVE_NOTE_MARKER)).toContain(
            'The minimum live payout request amount is $500.',
        );
    });

    it('discloses the unmodeled Bonus Vault and 90-day safety-net exception (T25)', () => {
        const note = noteContaining(LIVE_NOTE_MARKER);
        expect(note).toContain('Bonus Vault');
        expect(note).toContain('90 days');
        expect(note).toContain('not modeled');
    });
});
