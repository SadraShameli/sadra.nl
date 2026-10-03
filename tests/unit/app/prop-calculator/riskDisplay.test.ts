import { describe, expect, it } from 'vitest';

import { formatRiskDisplay } from '~/app/(app)/prop-calculator/_components/riskDisplay';
import { NOT_APPLICABLE } from '~/lib/format';
import { RiskDisplayUnit } from '~/lib/prop-calculator/advisor';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    EconomicsDisclosure,
} from '~/lib/prop-calculator/economics';

const NEAR_FRESH_EVAL_TEXT =
    ECONOMICS_DISCLOSURE_TEXT[EconomicsDisclosure.NearFreshEvalApproximation];

describe('formatRiskDisplay (F-V16, PT-61)', () => {
    it('shows the raw account dollars for AccountDollars', () => {
        const formatted = formatRiskDisplay(RiskDisplayUnit.AccountDollars, {
            accountDollars: 1234,
            evAtStake: null,
            feeEquivalent: 500,
        });
        expect(formatted).toEqual({
            disclosure: null,
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
            disclosure: NEAR_FRESH_EVAL_TEXT,
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
        expect(formatted.disclosure).toBeNull();
    });

    it('shows the EV-at-stake value for EvAtStake when one is given', () => {
        const formatted = formatRiskDisplay(RiskDisplayUnit.EvAtStake, {
            accountDollars: 1234,
            evAtStake: 210,
            feeEquivalent: 500,
        });
        expect(formatted).toEqual({
            disclosure: null,
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
            disclosure: NEAR_FRESH_EVAL_TEXT,
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
        expect(formatted.disclosure).toBeNull();
    });

    it('says the fee equivalent is an approximation valid near a fresh eval wherever its figure shows', () => {
        const values = {
            accountDollars: 1234,
            evAtStake: null,
            feeEquivalent: 500,
        };
        expect(NEAR_FRESH_EVAL_TEXT).toBe(
            'approximation, valid near a fresh eval',
        );
        expect(
            formatRiskDisplay(RiskDisplayUnit.FeeEquivalent, values).disclosure,
        ).toBe(NEAR_FRESH_EVAL_TEXT);
        expect(
            formatRiskDisplay(RiskDisplayUnit.EvAtStake, values).disclosure,
        ).toBe(NEAR_FRESH_EVAL_TEXT);
        expect(
            formatRiskDisplay(RiskDisplayUnit.AccountDollars, values)
                .disclosure,
        ).toBeNull();
    });

    it('carries no disclosure when the figure shown is an EV at stake', () => {
        expect(
            formatRiskDisplay(RiskDisplayUnit.EvAtStake, {
                accountDollars: 1234,
                evAtStake: 210,
                feeEquivalent: 500,
            }).disclosure,
        ).toBeNull();
    });
});
