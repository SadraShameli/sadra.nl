import { describe, expect, it } from 'vitest';

import {
    FirmId,
    initialEvalFee,
    LucidVariant,
    percent,
    rebuyFee,
    resetFee,
    retryFee,
    RetryKind,
    retryPath,
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

describe('Lucid --eval-discount cuts the plan price only, as the typed VAULT code does on the site (N-52)', () => {
    it.each([
        [LucidVariant.ProNoDll, 30, 172 * 0.7 + 20],
        [LucidVariant.DailyEod, 40, 165 * 0.6 + 20],
        [LucidVariant.Pro, 30, 172 * 0.7 - 5],
        [LucidVariant.Flex, 40, 136 * 0.6 + 10],
        [LucidVariant.FlexDll, 40, 136 * 0.6 - 5],
    ])(
        '%s at %s percent off costs the site price $%s',
        (variant, evalPercent, siteFee) => {
            const discounts = {
                activationPercent: percent(0),
                evalPercent: percent(evalPercent),
            };
            expect(initialEvalFee(feesOf(variant), discounts)).toBeCloseTo(
                siteFee,
                9,
            );
            expect(rebuyFee(feesOf(variant), discounts)).toBeCloseTo(
                siteFee,
                9,
            );
        },
    );

    it('retries Pro no-DLL at 30% with the $140 reset, which the eval coupon never cuts, since the re-buy with its full add-on costs $140.40', () => {
        const fees = feesOf(LucidVariant.ProNoDll);
        const discounts = {
            activationPercent: percent(0),
            evalPercent: percent(30),
        };
        expect(retryPath(fees, discounts)).toBe(RetryKind.Reset);
        expect(retryFee(fees, discounts)).toBe(140);
    });

    it('marks the no-DLL add-on and the DLL-ON promo as undiscountable, and nothing on LucidDirect or LucidMaxx', () => {
        expect(feesOf(LucidVariant.ProNoDll).undiscountableEval).toBe(20);
        expect(feesOf(LucidVariant.Pro).undiscountableEval).toBe(-5);
        expect(feesOf(LucidVariant.Direct).undiscountableEval).toBeUndefined();
        expect(feesOf(LucidVariant.Maxx).undiscountableEval).toBeUndefined();
    });
});

describe('Lucid reset discounts and 100% codes follow the site formula (N-52 review)', () => {
    it.each([
        [LucidVariant.ProNoDll, 120 * 0.7 + 20],
        [LucidVariant.Pro, 120 * 0.7 - 5],
        [LucidVariant.Flex, 95 * 0.7 + 10],
        [LucidVariant.FlexDll, 95 * 0.7 - 5],
        [LucidVariant.DailyEod, 115 * 0.7 + 20],
    ])(
        '%s at 30 percent off the reset costs the site price $%s: the reset list price is discounted, the add-on or promo is not',
        (variant, siteFee) => {
            expect(
                resetFee(feesOf(variant), {
                    activationPercent: percent(0),
                    evalPercent: percent(0),
                    resetPercent: percent(30),
                }),
            ).toBeCloseTo(siteFee, 9);
        },
    );

    it('marks the reset add-on and promo as undiscountable, and nothing on LucidDirect or LucidMaxx', () => {
        expect(feesOf(LucidVariant.ProNoDll).undiscountableReset).toBe(20);
        expect(feesOf(LucidVariant.Pro).undiscountableReset).toBe(-5);
        expect(feesOf(LucidVariant.Direct).undiscountableReset).toBeUndefined();
        expect(feesOf(LucidVariant.Maxx).undiscountableReset).toBeUndefined();
    });

    it.each([LucidVariant.Pro, LucidVariant.FlexDll, LucidVariant.DailyEodDll])(
        '%s at 100 percent off charges nothing for an eval, a re-buy or a reset, never a negative fee',
        (variant) => {
            const fees = feesOf(variant);
            const discounts = {
                activationPercent: percent(0),
                evalPercent: percent(100),
                resetPercent: percent(100),
            };
            expect(initialEvalFee(fees, discounts)).toBe(0);
            expect(rebuyFee(fees, discounts)).toBe(0);
            expect(resetFee(fees, discounts)).toBe(0);
            expect(retryFee(fees, discounts)).toBe(0);
        },
    );
});

describe('the Lucid fee note describes the VAULT pricing the engine now models (N-52)', () => {
    const feeNote = lucid.notes.find((note) => note.startsWith('Fee basis'));

    it('says the add-on and promo are an undiscountable component and drops the old gap caveat', () => {
        expect(feeNote).toBeDefined();
        expect(feeNote).toContain('undiscountableEval');
        expect(feeNote).toContain('172 x 0.7 + 20 = $140.40');
        expect(feeNote).toContain('undiscountableReset');
        expect(feeNote).toContain('never below $0');
        expect(feeNote).not.toContain('FeeSchedule has no undiscountable');
        expect(feeNote).not.toContain('off by the discount');
        expect(feeNote).not.toContain(String.fromCodePoint(0x20_14));
    });
});
