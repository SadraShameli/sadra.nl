import { describe, expect, it } from 'vitest';

import {
    assertValidFirmPolicySource,
    type FirmPolicySource,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator/core';

const CONFIRMED_QUOTE = {
    fetchedOn: '2026-09-26',
    quote: 'Accounts are capped at 5 per individual or household.',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.invalid/help/caps',
};

describe('FirmPolicySource', () => {
    it('accepts a Confirmed source with a quote, an https url and an ISO fetch date', () => {
        const source: FirmPolicySource = {
            ...CONFIRMED_QUOTE,
            verification: PolicyVerification.Confirmed,
        };
        expect(() => assertValidFirmPolicySource(source, 'test')).not.toThrow();
    });

    it('rejects a Confirmed source with a non-https url', () => {
        const source: FirmPolicySource = {
            ...CONFIRMED_QUOTE,
            url: 'ftp://example.invalid/help/caps',
            verification: PolicyVerification.Confirmed,
        };
        expect(() => assertValidFirmPolicySource(source, 'test')).toThrow();
    });

    it('rejects a Confirmed source with an empty quote', () => {
        const source: FirmPolicySource = {
            ...CONFIRMED_QUOTE,
            quote: ' '.repeat(3),
            verification: PolicyVerification.Confirmed,
        };
        expect(() => assertValidFirmPolicySource(source, 'test')).toThrow();
    });

    it('rejects a Confirmed source with a malformed fetch date', () => {
        const source: FirmPolicySource = {
            ...CONFIRMED_QUOTE,
            fetchedOn: 'not-a-date',
            verification: PolicyVerification.Confirmed,
        };
        expect(() => assertValidFirmPolicySource(source, 'test')).toThrow();
    });

    it('a Conflict source carries both sides and both must be valid quotes', () => {
        const valid: FirmPolicySource = {
            ...CONFIRMED_QUOTE,
            conflicting: {
                fetchedOn: '2026-09-25',
                quote: 'Accounts are capped at 3 per individual.',
                sourceKind: PolicySourceKind.UserPaste,
                url: 'https://example.invalid/help/caps-old',
            },
            verification: PolicyVerification.Conflict,
        };
        expect(() => assertValidFirmPolicySource(valid, 'test')).not.toThrow();

        const invalid: FirmPolicySource = {
            ...CONFIRMED_QUOTE,
            conflicting: {
                fetchedOn: '2026-09-25',
                quote: '',
                sourceKind: PolicySourceKind.UserPaste,
                url: 'https://example.invalid/help/caps-old',
            },
            verification: PolicyVerification.Conflict,
        };
        expect(() => assertValidFirmPolicySource(invalid, 'test')).toThrow();
    });

    it('NeedsPaste and NotFound require nothing further', () => {
        expect(() =>
            assertValidFirmPolicySource(
                { verification: PolicyVerification.NeedsPaste },
                'test',
            ),
        ).not.toThrow();
        expect(() =>
            assertValidFirmPolicySource(
                { verification: PolicyVerification.NotFound },
                'test',
            ),
        ).not.toThrow();
    });
});
