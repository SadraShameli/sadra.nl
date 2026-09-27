import { describe, expect, it } from 'vitest';

import { formatRiskDisplay } from '~/app/(app)/prop-calculator/_components/riskDisplay';
import { NOT_APPLICABLE } from '~/lib/format';
import { RiskDisplayUnit } from '~/lib/prop-calculator/advisor';

describe('formatRiskDisplay (F-V16, PT-61)', () => {
    it('shows the raw account dollars for AccountDollars', () => {
        const formatted = formatRiskDisplay(RiskDisplayUnit.AccountDollars, {
            accountDollars: 1234,
            evAtStake: null,
            feeEquivalent: 500,
        });
        expect(formatted).toEqual({
            isFallback: false,
            label: 'Account dollars',
            text: '$1,234',
        });
    });

    it('shows the fee-equivalent value for FeeEquivalent', () => {
        const formatted = formatRiskDisplay(RiskDisplayUnit.FeeEquivalent, {
            accountDollars: 1234,
            evAtStake: null,
            feeEquivalent: 500,
        });
        expect(formatted).toEqual({
            isFallback: false,
            label: 'Fee equivalent',
            text: '$500',
        });
    });

    it('shows n/a for FeeEquivalent when no fee-equivalent value is given', () => {
        const formatted = formatRiskDisplay(RiskDisplayUnit.FeeEquivalent, {
            accountDollars: 1234,
            evAtStake: null,
            feeEquivalent: null,
        });
        expect(formatted.text).toBe(NOT_APPLICABLE);
        expect(formatted.isFallback).toBe(false);
    });

    it('shows the EV-at-stake value for EvAtStake when one is given', () => {
        const formatted = formatRiskDisplay(RiskDisplayUnit.EvAtStake, {
            accountDollars: 1234,
            evAtStake: 210,
            feeEquivalent: 500,
        });
        expect(formatted).toEqual({
            isFallback: false,
            label: 'EV at stake',
            text: '$210',
        });
    });

    it('falls back to the fee-equivalent value, labelled, when EvAtStake has no from-state value', () => {
        const formatted = formatRiskDisplay(RiskDisplayUnit.EvAtStake, {
            accountDollars: 1234,
            evAtStake: null,
            feeEquivalent: 500,
        });
        expect(formatted).toEqual({
            isFallback: true,
            label: 'Fee equivalent (EV at stake unavailable)',
            text: '$500',
        });
    });

    it('falls back to n/a when EvAtStake and the fee equivalent are both unavailable', () => {
        const formatted = formatRiskDisplay(RiskDisplayUnit.EvAtStake, {
            accountDollars: 1234,
            evAtStake: null,
            feeEquivalent: null,
        });
        expect(formatted.isFallback).toBe(true);
        expect(formatted.text).toBe(NOT_APPLICABLE);
    });
});
