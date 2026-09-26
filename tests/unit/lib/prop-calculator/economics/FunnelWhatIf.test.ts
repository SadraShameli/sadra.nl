import { describe, expect, it } from 'vitest';

import { dollars, fraction } from '~/lib/prop-calculator/core';
import {
    EconomicsDisclosure,
    EconomicsReason,
    funnelWhatIf,
    type FunnelWhatIfInputs,
} from '~/lib/prop-calculator/economics';

const videoHundredAttempts: FunnelWhatIfInputs = {
    attemptCost: dollars(250),
    attempts: 100,
    averagePayout: dollars(4000),
    passProbability: fraction(0.3),
    payoutProbabilityGivenFunded: fraction(0.4),
};

describe('funnelWhatIf (video 100-attempt funnel)', () => {
    it('chains 100 attempts at 30% pass and 40% payout into 30 passed and 12 paid', () => {
        const funnel = funnelWhatIf(videoHundredAttempts).value;
        expect(funnel?.attempts).toBe(100);
        expect(funnel?.passed).toBeCloseTo(30, 9);
        expect(funnel?.paid).toBeCloseTo(12, 9);
    });

    it('prices the funnel: payouts 48,000, fees 25,000, net 23,000', () => {
        const funnel = funnelWhatIf(videoHundredAttempts).value;
        expect(funnel?.payouts).toBeCloseTo(48_000, 6);
        expect(funnel?.fees).toBeCloseTo(25_000, 6);
        expect(funnel?.net).toBeCloseTo(23_000, 6);
    });

    it('gives the payout multiple (payouts / fees) 1.92', () => {
        expect(
            funnelWhatIf(videoHundredAttempts).value?.payoutMultiple.value,
        ).toBeCloseTo(1.92, 12);
    });

    it('discloses the one-payout-per-paying-account assumption', () => {
        expect(funnelWhatIf(videoHundredAttempts).disclosures).toContain(
            EconomicsDisclosure.OnePayoutPerPayingAccount,
        );
    });

    it('has no payout multiple at a zero attempt cost', () => {
        const funnel = funnelWhatIf({
            ...videoHundredAttempts,
            attemptCost: dollars(0),
        }).value;
        expect(funnel?.payoutMultiple.reason).toBe(
            EconomicsReason.ZeroAttemptCost,
        );
        expect(funnel?.net).toBeCloseTo(48_000, 6);
    });

    it('is all zero at zero attempts', () => {
        const funnel = funnelWhatIf({
            ...videoHundredAttempts,
            attempts: 0,
        }).value;
        expect(funnel).toMatchObject({ fees: 0, net: 0, paid: 0, payouts: 0 });
    });

    it.each([
        { attempts: -1 },
        { attempts: 2.5 },
        { passProbability: fraction(1.5) },
        { payoutProbabilityGivenFunded: fraction(-0.1) },
        { averagePayout: dollars(-1) },
    ])('refuses %o', (override) => {
        expect(
            funnelWhatIf({ ...videoHundredAttempts, ...override }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});
