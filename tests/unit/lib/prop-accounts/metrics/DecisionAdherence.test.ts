import { describe, expect, it } from 'vitest';

import { usdCents } from '~/lib/prop-accounts/core';
import {
    type AdherenceDecision,
    decisionAdherenceOf,
    isDecisionFollowed,
} from '~/lib/prop-accounts/metrics';

const STEP_CENTS = 5000;

function decision(
    acceptedRiskCents: number,
    actualRiskCents: null | number,
    overrides: Partial<AdherenceDecision> = {},
): AdherenceDecision {
    return {
        acceptedRiskCents: usdCents(acceptedRiskCents),
        accountId: 'account-1',
        actualRiskCents:
            actualRiskCents === null ? null : usdCents(actualRiskCents),
        decidedOn: '2026-09-23',
        ...overrides,
    };
}

describe('isDecisionFollowed', () => {
    it('counts an actual risk equal to the accepted risk as followed', () => {
        expect(isDecisionFollowed(decision(40_000, 40_000), STEP_CENTS)).toBe(
            true,
        );
    });

    it('counts a difference of exactly one step as followed in either direction', () => {
        expect(isDecisionFollowed(decision(40_000, 45_000), STEP_CENTS)).toBe(
            true,
        );
        expect(isDecisionFollowed(decision(40_000, 35_000), STEP_CENTS)).toBe(
            true,
        );
    });

    it('counts a difference of one cent over a step as not followed', () => {
        expect(isDecisionFollowed(decision(40_000, 45_001), STEP_CENTS)).toBe(
            false,
        );
        expect(isDecisionFollowed(decision(40_000, 34_999), STEP_CENTS)).toBe(
            false,
        );
    });

    it('is null for a decision with no actual risk entered', () => {
        expect(
            isDecisionFollowed(decision(40_000, null), STEP_CENTS),
        ).toBeNull();
    });

    it('refuses a step that is negative or not a finite number', () => {
        expect(() => isDecisionFollowed(decision(1, 1), -1)).toThrow(
            RangeError,
        );
        expect(() => isDecisionFollowed(decision(1, 1), NaN)).toThrow(
            RangeError,
        );
    });
});

describe('decisionAdherenceOf', () => {
    it('returns no rate and zero counts for no decisions', () => {
        expect(decisionAdherenceOf([], STEP_CENTS)).toEqual({
            followed: 0,
            measured: 0,
            notRecorded: 0,
            rate: null,
            total: 0,
        });
    });

    it('measures only decisions with an actual risk and keeps the rest as not recorded', () => {
        const result = decisionAdherenceOf(
            [
                decision(40_000, 40_000),
                decision(40_000, 60_000),
                decision(40_000, null),
                decision(40_000, 42_000),
            ],
            STEP_CENTS,
        );
        expect(result).toEqual({
            followed: 2,
            measured: 3,
            notRecorded: 1,
            rate: 2 / 3,
            total: 4,
        });
    });

    it('has no rate when every decision is missing its actual risk, never zero', () => {
        const result = decisionAdherenceOf(
            [decision(40_000, null), decision(30_000, null)],
            STEP_CENTS,
        );
        expect(result.rate).toBeNull();
        expect(result.measured).toBe(0);
        expect(result.notRecorded).toBe(2);
    });

    it('does not count a decision with an actual risk of zero as followed when the accepted risk is a full step away', () => {
        const result = decisionAdherenceOf([decision(40_000, 0)], STEP_CENTS);
        expect(result.followed).toBe(0);
        expect(result.measured).toBe(1);
        expect(result.rate).toBe(0);
    });
});
