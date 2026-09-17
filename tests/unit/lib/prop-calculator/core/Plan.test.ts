import { describe, expect, it } from 'vitest';

import { FirmId } from '~/lib/prop-calculator/core';
import {
    E8FuturesVariant,
    LucidVariant,
} from '~/lib/prop-calculator/core/PlanId';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';

const lucidDirect = new LucidTrading().findPlan({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Direct,
});
if (!lucidDirect) throw new Error('LucidDirect 50K plan not found');

describe('Plan.withMaxLifetimePayouts', () => {
    it(
        "LucidDirect's own payoutLadder has exactly 5 steps and no capsAtLastStep -- " +
            'confirms the real trap this method exists to close: clearing only ' +
            'maxLifetimePayouts is NOT enough to uncap the plan',
        () => {
            expect(lucidDirect.maxLifetimePayouts).toBe(5);
            expect(lucidDirect.payoutLadder?.steps.length).toBe(5);
            expect(lucidDirect.payoutLadder?.capsAtLastStep).toBeUndefined();

            const halfFixed = lucidDirect.withOverrides({
                maxLifetimePayouts: undefined,
            });
            expect(halfFixed.maxLifetimePayouts).toBeNull();
            expect(halfFixed.isAccountConcluded(50)).toBe(true);
        },
    );

    it('withMaxLifetimePayouts(null) genuinely removes both caps at once', () => {
        const uncapped = lucidDirect.withMaxLifetimePayouts(null);
        expect(uncapped.maxLifetimePayouts).toBeNull();
        expect(uncapped.payoutLadder?.capsAtLastStep).toBe(true);
        expect(uncapped.isAccountConcluded(5)).toBe(false);
        expect(uncapped.isAccountConcluded(50)).toBe(false);
        expect(uncapped.isAccountConcluded(1000)).toBe(false);
    });

    it(
        'withMaxLifetimePayouts(N) caps at exactly N even when N exceeds the ' +
            "ladder's own step count, by also forcing capsAtLastStep so the " +
            'ladder repeats its last step instead of silently exhausting early',
        () => {
            const extended = lucidDirect.withMaxLifetimePayouts(8);
            expect(extended.maxLifetimePayouts).toBe(8);
            expect(extended.isAccountConcluded(7)).toBe(false);
            expect(extended.isAccountConcluded(8)).toBe(true);
            expect(extended.payoutLadder?.capsAtLastStep).toBe(true);
        },
    );

    it('withMaxLifetimePayouts(N) below the ladder length still concludes at N', () => {
        const shortened = lucidDirect.withMaxLifetimePayouts(2);
        expect(shortened.isAccountConcluded(1)).toBe(false);
        expect(shortened.isAccountConcluded(2)).toBe(true);
    });

    it('a plan with no payoutLadder at all is unaffected by the ladder-fix side effect', () => {
        const signature = new E8Futures().findPlan({
            accountSize: 50_000,
            firm: FirmId.E8Futures,
            variant: E8FuturesVariant.Signature,
        });
        if (!signature) throw new Error('E8 Signature 50K plan not found');
        expect(signature.payoutLadder).toBeNull();

        const uncapped = signature.withMaxLifetimePayouts(null);
        expect(uncapped.payoutLadder).toBeNull();
        expect(uncapped.maxLifetimePayouts).toBeNull();
        expect(uncapped.isAccountConcluded(9999)).toBe(false);
    });
});

describe('Plan constructor: minTradingDays invariant', () => {
    it('rejects a negative minTradingDays at construction', () => {
        expect(() => lucidDirect.withOverrides({ minTradingDays: -1 })).toThrow(
            /minTradingDays/,
        );
    });

    it(
        'rejects NaN and fractional minTradingDays values too, matching ' +
            'the error message\'s own "integer" promise',
        () => {
            expect(() =>
                lucidDirect.withOverrides({ minTradingDays: NaN }),
            ).toThrow(/minTradingDays/);
            expect(() =>
                lucidDirect.withOverrides({ minTradingDays: 2.5 }),
            ).toThrow(/minTradingDays/);
        },
    );

    it('accepts zero, the "no minimum trading days" sentinel', () => {
        expect(
            lucidDirect.withOverrides({ minTradingDays: 0 }).minTradingDays,
        ).toBe(0);
    });
});
