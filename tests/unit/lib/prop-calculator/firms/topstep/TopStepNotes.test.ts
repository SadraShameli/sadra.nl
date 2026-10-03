import { describe, expect, it } from 'vitest';

import {
    FirmId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

const topStep = new TopStep();
const COMBINE_TARGET = 3000;
const ACCOUNT_SIZE = 50_000;

function noteContaining(fragment: string): string {
    const found = topStep.notes.find((note) => note.includes(fragment));
    if (!found) throw new Error(`no TopStep note contains ${fragment}`);
    return found;
}

function plan(variant: TopStepVariant) {
    const found = topStep.findPlan({
        accountSize: ACCOUNT_SIZE,
        firm: FirmId.TopStep,
        variant,
    });
    if (!found) throw new Error(`topstep ${variant} missing`);
    return found;
}

describe('TopStep Combine 55% consistency: what the engine does at the tie and above it (DOCS-R7 triage T-36, question U32)', () => {
    const combineVariants = [
        TopStepVariant.StandardStandard,
        TopStepVariant.StandardConsistencyDll,
        TopStepVariant.NoFeeStandard,
        TopStepVariant.NoFeeConsistencyDll,
    ];

    function evalState(
        variant: TopStepVariant,
        profit: number,
        bestDayProfit: number,
    ) {
        const state = plan(variant).initialState();
        state.balance = ACCOUNT_SIZE + profit;
        state.bestDayProfit = bestDayProfit;
        state.tradingDays = 2;
        return state;
    }

    it.each(combineVariants)(
        '%s passes at exactly 55% (a $1,650 best day on $3,000), the tie reading the notes disclose',
        (variant) => {
            expect(
                plan(variant).isPassed(
                    evalState(variant, COMBINE_TARGET, 1650),
                ),
            ).toBe(true);
        },
    );

    it.each(combineVariants)(
        '%s does not pass one cent over 55% at the target and is not busted: the pass waits for Best Day / 0.55',
        (variant) => {
            const above = evalState(variant, COMBINE_TARGET, 1650.01);
            expect(plan(variant).isPassed(above)).toBe(false);
            expect(plan(variant).isBust(above, TradingPhase.Eval)).toBe(false);
        },
    );

    it.each(combineVariants)(
        '%s needs $4,000 after a $2,200 best day (the firm worked example) and passes exactly there',
        (variant) => {
            expect(
                plan(variant).isPassed(evalState(variant, 3999.99, 2200)),
            ).toBe(false);
            expect(plan(variant).isPassed(evalState(variant, 4000, 2200))).toBe(
                true,
            );
        },
    );

    it('the first note states the tie reading, the raised target and the page conflict as the tool reading', () => {
        const note = noteContaining('COMBINE_CONSISTENCY');
        for (const fragment of [
            'so exactly 55% passes',
            'Best Day / 0.55',
            "'at or below 55%'",
            "'below 55%'",
            '8284208',
            '8284197',
            '8284099',
            "the tool's reading",
            'question U32',
        ]) {
            expect(note).toContain(fragment);
        }
    });

    it('the note says exceeding 55% raises the target instead of failing the Combine', () => {
        const note = noteContaining('COMBINE_CONSISTENCY');
        expect(note).toContain('not a fail');
    });
});

describe('TopStep Pro Account payout share and minimum: disclosed as the tool reading (DOCS-R7 triage T-38, question U33)', () => {
    const pro = plan(TopStepVariant.ProAccount);

    it('the engine carries the $2,000 dollar cap of the 50K row, no share cap and no minimum request', () => {
        expect(pro.payoutRequestCap).toBe(2000);
        expect(pro.payoutBalanceShareCap).toBeNull();
        expect(pro.minPayoutRequest).toBe(0);
    });

    it('the Pro note quotes the 50% and $5,000 sentence and places the $5,000 on the 150K row', () => {
        const note = noteContaining('Pro Account (pro-account.md)');
        for (const fragment of [
            '14645398',
            'Payout up to 50% of the account and up to $5,000',
            'the 150K row',
            'payoutRequestCap',
        ]) {
            expect(note).toContain(fragment);
        }
    });

    it('the Pro note says no page states what the 50% is a share of, so the engine models no share cap, and why it never binds on the balance reading', () => {
        const note = noteContaining('Pro Account (pro-account.md)');
        for (const fragment of [
            'No page says what the 50% is a share of',
            'the engine sets no payoutBalanceShareCap',
            'never binds below the $2,000 cap',
            'question U33',
        ]) {
            expect(note).toContain(fragment);
        }
    });

    it('the Pro note says the $125 minimum reaches Pro only through the same-as-a-standard-XFA cross-reference and the engine sets none', () => {
        const note = noteContaining('Pro Account (pro-account.md)');
        for (const fragment of [
            "'same as a standard Express Funded Account'",
            'the engine sets no minimum',
            "the tool's reading",
        ]) {
            expect(note).toContain(fragment);
        }
    });
});
