import { describe, expect, it } from 'vitest';

import {
    dollars,
    PolicySourceKind,
    PolicyVerification,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator';
import {
    combinedProfitCeiling,
    LIVE_TRIGGER_CEILING_MARGIN_DOLLARS,
    liveTriggerCeilingFor,
} from '~/lib/prop-calculator/advisor';

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed as const,
};

const CONFLICTED_SOURCE = {
    conflicting: CONFIRMED_SOURCE,
    fetchedOn: '2026-09-01',
    quote: 'a synthetic conflicting quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Conflict as const,
};

describe('liveTriggerCeilingFor', () => {
    it('is null with no trigger', () => {
        expect(liveTriggerCeilingFor(null)).toBeNull();
    });

    it('is null for an unconfirmed trigger', () => {
        const trigger = new SingleDayProfitTrigger(
            dollars(10_000),
            true,
            false,
            CONFLICTED_SOURCE,
        );
        expect(liveTriggerCeilingFor(trigger)).toBeNull();
    });

    it('subtracts the default margin from a confirmed trigger amount', () => {
        const trigger = new SingleDayProfitTrigger(
            dollars(10_000),
            true,
            false,
            CONFIRMED_SOURCE,
        );
        expect(liveTriggerCeilingFor(trigger)).toBe(
            10_000 - LIVE_TRIGGER_CEILING_MARGIN_DOLLARS,
        );
    });

    it('accepts a custom margin and never goes below zero', () => {
        const trigger = new SingleDayProfitTrigger(
            dollars(30),
            true,
            false,
            CONFIRMED_SOURCE,
        );
        expect(liveTriggerCeilingFor(trigger, 50)).toBe(0);
    });
});

describe('combinedProfitCeiling', () => {
    it('is the live-trigger ceiling when there is no other ceiling', () => {
        expect(combinedProfitCeiling(null, dollars(500))).toBe(500);
    });

    it('is the existing ceiling when there is no live-trigger ceiling', () => {
        expect(combinedProfitCeiling(dollars(500), null)).toBe(500);
    });

    it('is null when neither ceiling applies', () => {
        expect(combinedProfitCeiling(null, null)).toBeNull();
    });

    it('takes the tighter of the two ceilings', () => {
        expect(combinedProfitCeiling(dollars(500), dollars(9950))).toBe(500);
        expect(combinedProfitCeiling(dollars(9950), dollars(500))).toBe(500);
    });
});
