import { describe, expect, it } from 'vitest';

import { FirmId, TradeifyVariant } from '~/lib/prop-calculator/core';
import { Tradeify } from '~/lib/prop-calculator/firms/tradeify/Tradeify';

const tradeify = new Tradeify();

function feesOf(variant: TradeifyVariant) {
    const plan = tradeify.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant,
    });
    if (!plan) throw new Error(`tradeify ${variant} missing`);
    return plan.fees;
}

describe('Tradeify Select 50K reset is $109 (homepage SelectData picker and Pricing Reference 14369021 "Select 50K | $165 | $109"), not the older /select-plan $99', () => {
    it.each([TradeifyVariant.SelectFlex, TradeifyVariant.SelectDaily])(
        '%s charges a 165 dollar eval and a 109 dollar reset',
        (variant) => {
            const fees = feesOf(variant);
            expect(fees.oneTimeEval).toBe(165);
            expect(fees.reset).toBe(109);
        },
    );

    it('Growth keeps its $145 eval and $95 reset', () => {
        const fees = feesOf(TradeifyVariant.Growth);
        expect(fees.oneTimeEval).toBe(145);
        expect(fees.reset).toBe(95);
    });
});
