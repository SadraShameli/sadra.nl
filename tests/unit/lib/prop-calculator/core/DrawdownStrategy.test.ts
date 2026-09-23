import { describe, expect, it } from 'vitest';

import {
    dollars,
    EodTrailingDrawdown,
    IntradayTrailingDrawdown,
    StaticDrawdown,
} from '~/lib/prop-calculator/core';

describe('DrawdownStrategy.allowsWithdrawalWhileUnlocked', () => {
    it.each([
        [
            'EodTrailingDrawdown',
            new EodTrailingDrawdown({ amount: dollars(100) }),
        ],
        [
            'IntradayTrailingDrawdown',
            new IntradayTrailingDrawdown({ amount: dollars(100) }),
        ],
    ] as const)(
        '%s never has room to withdraw while unlocked once the retained cushion reaches the drawdown amount',
        (_name, drawdown) => {
            expect(drawdown.allowsWithdrawalWhileUnlocked(100)).toBe(false);
            expect(drawdown.allowsWithdrawalWhileUnlocked(150)).toBe(false);
            expect(drawdown.allowsWithdrawalWhileUnlocked(99)).toBe(true);
        },
    );

    it('a static drawdown can always build withdrawable room while unlocked', () => {
        const drawdown = new StaticDrawdown({ amount: dollars(100) });
        expect(drawdown.allowsWithdrawalWhileUnlocked(100)).toBe(true);
        expect(drawdown.allowsWithdrawalWhileUnlocked(10_000)).toBe(true);
    });
});
