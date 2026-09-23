import { describe, expect, it } from 'vitest';

import {
    FirmId,
    initialEvalFee,
    LucidVariant,
    percent,
} from '~/lib/prop-calculator/core';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';

const lucid = new LucidTrading();

function feesOf(variant: LucidVariant) {
    const plan = lucid.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant,
    });
    if (!plan) throw new Error(`lucid ${variant} missing`);
    return plan.fees;
}

describe('Lucid 50K fees are the no-code checkout price (T4): list price minus the automatic DLL-ON promo with the DLL on, list price plus the no-DLL add-on with it off (lucidtrading.com LucidPricingConfig, 2026-09-21)', () => {
    it.each([
        [LucidVariant.Pro, 167, 115],
        [LucidVariant.ProNoDll, 192, 140],
        [LucidVariant.FlexDll, 131, 90],
        [LucidVariant.Flex, 146, 105],
        [LucidVariant.DailyEodDll, 160, 110],
        [LucidVariant.DailyEod, 185, 135],
        [LucidVariant.DailyIntradayDll, 131, 90],
        [LucidVariant.DailyIntraday, 156, 115],
    ])('%s charges eval $%d and reset $%d', (variant, evalFee, resetFee) => {
        const fees = feesOf(variant);
        expect(fees.oneTimeEval).toBe(evalFee);
        expect(fees.reset).toBe(resetFee);
        expect(fees.activation).toBe(0);
        expect(fees.monthlySubscription).toBe(0);
    });

    it('LucidDirect has no DLL toggle, promo or reset product, so it stays a $515 re-buy', () => {
        const fees = feesOf(LucidVariant.Direct);
        expect(fees.oneTimeEval).toBe(515);
        expect(fees.reset).toBe(515);
    });

    it('LucidMaxx keeps its Tier 1 $180 eval and reset (support article 14316866: no discounts)', () => {
        const fees = feesOf(LucidVariant.Maxx);
        expect(fees.oneTimeEval).toBe(180);
        expect(fees.reset).toBe(180);
    });
});

describe('Lucid --eval-discount gap: the engine scales the whole checkout price, the site discounts the plan price only', () => {
    it.each([
        [LucidVariant.ProNoDll, 30, 134.4, 140.4],
        [LucidVariant.DailyEod, 40, 111, 119],
        [LucidVariant.Pro, 30, 116.9, 115.4],
    ])(
        '%s at %s%% costs $%s in the engine against $%s on the site',
        (variant, evalPercent, engineFee, siteFee) => {
            const fee = initialEvalFee(feesOf(variant), {
                activationPercent: percent(0),
                evalPercent: percent(evalPercent),
            });
            expect(fee).toBeCloseTo(engineFee, 6);
            expect(Math.abs(fee - siteFee)).toBeGreaterThan(1);
        },
    );
});
