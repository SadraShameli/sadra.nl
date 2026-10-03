import { describe, expect, it } from 'vitest';

import { TopStep } from '~/lib/prop-calculator/firms';

describe('TopStep LFA note names the strictly-below floor class everywhere (WP62c, N-94)', () => {
    const notes = new TopStep().notes.join('\n');

    it('says the LFA floor is a StrictlyBelowStaticDrawdown in the livePhase paragraph, not a StaticDrawdown', () => {
        expect(notes).toContain(
            'its $1,000 floor is a StrictlyBelowStaticDrawdown',
        );
        expect(notes).not.toContain('its $1,000 floor is a StaticDrawdown');
    });

    it('states that a drain-to-floor payout may take the balance down to exactly the floor', () => {
        expect(notes).toContain('down to exactly the $1,000 floor');
    });

    it('says surviving a drain to exactly the floor is the tool reading, not a stated minimum balance a payout may leave', () => {
        expect(notes).toContain(
            "is the tool's reading of 'drops below $1,000'",
        );
        expect(notes).toContain('states a minimum balance a payout may leave');
    });

    it('names the Payout Policy full-payout closure sentence as a conflicting data point with its article id and date', () => {
        expect(notes).toContain(
            "'Requesting a full 100% Payout closes your LFA since the balance reaches the Maximum Loss Limit' (article 8284233, dateModified 2026-09-30) is a conflicting data point",
        );
    });
});
