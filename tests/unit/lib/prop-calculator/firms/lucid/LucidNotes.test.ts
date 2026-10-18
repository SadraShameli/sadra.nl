import { describe, expect, it } from 'vitest';

import { LucidTrading } from '~/lib/prop-calculator/firms';

function liveNote(): string {
    const note = new LucidTrading().notes.find((candidate) =>
        candidate.startsWith('LucidLive (live.md)'),
    );
    if (note === undefined) throw new Error('no LucidLive note');
    return note;
}

describe('Lucid Live notes match the end-of-day contract tiers (N-68, N-5)', () => {
    it('reads the two live articles as complementary, not conflicting', () => {
        const note = liveNote();

        expect(note).not.toContain('genuinely conflict');
        expect(note).toContain('complementary');
        expect(note).toContain(
            'the maximum contract size versus the size currently available',
        );
    });

    it('states the end-of-day tier timing and the tier basis that models it', () => {
        const note = liveNote();

        expect(note).toContain('at the end of each trading day');
        expect(note).toContain('TierBasis.SessionOpenProfit');
    });

    it('says only the 50K CME column is modeled because COMEX limits are lower at every tier', () => {
        const note = liveNote();

        expect(note).toContain('only the 50K CME column');
        expect(note).toContain('COMEX');
        expect(note).toContain('lower at every tier');
    });

    it('no Lucid note says the LucidLive contract tiers set no tierBasis', () => {
        const notes = new LucidTrading().notes;

        expect(
            notes.some((note) =>
                note.includes('because these Tiered configs set no tierBasis'),
            ),
        ).toBe(false);
    });
});
