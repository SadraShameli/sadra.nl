import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator/core';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { buildAlphaFuturesLivePlan } from '~/lib/prop-calculator/firms/alphafutures/AlphaFuturesLive';

function alphaLiveNote(): string {
    const note = ALL_FIRMS.find(
        (firm) => firm.id === FirmId.AlphaFutures,
    )?.notes.find((candidate) => candidate.includes('AlphaFuturesLive.ts'));
    if (note === undefined) throw new Error('no Alpha Futures live note');
    return note;
}

describe('Alpha Futures live Scaling Daily Loss Limit (N-91)', () => {
    it('keeps liveDailyLossLimit null because the page pins neither the base, the scaling nor the breach consequence', () => {
        const plan = buildAlphaFuturesLivePlan();

        expect(plan.dailyLossLimitFor(plan.initialState())).toBeNull();
        expect(
            plan.dailyLossLimitFor({
                ...plan.initialState(),
                balance: 3000,
            }),
        ).toBeNull();
    });

    it("quotes the page's wording and its article", () => {
        const note = alphaLiveNote();

        expect(note).toContain('Scaling Daily Loss Limit (30% of account)');
        expect(note).toContain('10743344');
    });

    it('says plainly which parts the firm leaves open: the base, when it scales, the floor and hard breach versus pause', () => {
        const note = alphaLiveNote();

        expect(note).toContain('what the 30% is measured on');
        expect(note).toContain('when it scales');
        expect(note).toContain(
            'hard breach or a pause until the next trading day',
        );
        expect(note).toContain('no dollar floor');
    });

    it('states that every Alpha Futures Live figure from this tool ignores the stated limit', () => {
        const note = alphaLiveNote();

        expect(note).toContain(
            'every Alpha Futures Live figure from this tool ignores the daily loss limit the firm states',
        );
    });

    it('says the pause-until-next-day sentence is scoped to the Legacy article and is not carried to the current structure', () => {
        const note = alphaLiveNote();

        expect(note).toContain('Legacy');
        expect(note).toContain('simply a pause until next trading day');
    });
});
