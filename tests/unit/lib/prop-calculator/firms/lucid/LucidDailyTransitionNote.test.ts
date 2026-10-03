import { describe, expect, it } from 'vitest';

import { dollars, type LivePlan } from '~/lib/prop-calculator/core';
import {
    buildLucidDailyLivePlan,
    LucidTrading,
} from '~/lib/prop-calculator/firms';

function dailyTransitionNote(): string {
    const note = new LucidTrading().notes.find((candidate) =>
        candidate.startsWith("LucidDaily's confirmed live-transition"),
    );
    if (note === undefined) throw new Error('no LucidDaily transition note');
    return note;
}

describe('LucidDaily live transition payout disclosure (N-92)', () => {
    it('says the LucidDaily Live page states no split for the transition payout', () => {
        const note = dailyTransitionNote();

        expect(note).toContain(
            'the LucidDaily Live page states no split for this transition payout',
        );
    });

    it("quotes the page's conditional wording: it 'may' be paid once KYC and sub account approval are complete", () => {
        const note = dailyTransitionNote();

        expect(note).toContain('may be paid out to the trader once their KYC');
        expect(note).toContain('sub accounts have been approved');
    });

    it('says the 90/10 split is the tool own reading, taken from the LucidDaily Payouts article, and that the engine assumes the KYC condition is met', () => {
        const note = dailyTransitionNote();

        expect(note).toContain("this tool's own reading");
        expect(note).toContain(
            'All LucidDaily funded account payouts are split 90% to the trader and 10% to Lucid Trading',
        );
        expect(note).toContain('assumes the KYC condition is met');
    });

    it('still pays the transition credit net of the 90/10 split, capped at $15,000', () => {
        const plan: LivePlan = buildLucidDailyLivePlan(
            undefined,
            dollars(20_000),
        );

        expect(plan.transitionPayout).toBe(dollars(15_000));
        expect(plan.payoutFromProfit(plan.transitionPayout)).toBeCloseTo(
            13_500,
            6,
        );
    });
});
