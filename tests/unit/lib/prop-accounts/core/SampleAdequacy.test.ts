import { describe, expect, it } from 'vitest';

import {
    sampleAdequacy,
    SampleKind,
    SampleLevel,
} from '~/lib/prop-accounts/core/SampleAdequacy';
import {
    DEFAULT_RULEBOOK,
    type SampleThresholds,
} from '~/lib/prop-calculator/advisor';

const thresholds = (overrides: Partial<SampleThresholds> = {}): SampleThresholds => ({
    ...DEFAULT_RULEBOOK.samples,
    ...overrides,
});

describe('sampleAdequacy', () => {
    it('is null when the threshold for that kind is not set', () => {
        expect(sampleAdequacy(SampleKind.EvalAttempts, 50, thresholds())).toBe(
            null,
        );
    });

    it('is None at n = 0 even with a threshold set', () => {
        expect(
            sampleAdequacy(
                SampleKind.EvalAttempts,
                0,
                thresholds({ minEvalAttempts: 10 }),
            ),
        ).toBe(SampleLevel.None);
    });

    it('is Low below the threshold', () => {
        expect(
            sampleAdequacy(
                SampleKind.EvalAttempts,
                9,
                thresholds({ minEvalAttempts: 10 }),
            ),
        ).toBe(SampleLevel.Low);
    });

    it('is Adequate at or above the threshold', () => {
        expect(
            sampleAdequacy(
                SampleKind.EvalAttempts,
                10,
                thresholds({ minEvalAttempts: 10 }),
            ),
        ).toBe(SampleLevel.Adequate);
        expect(
            sampleAdequacy(
                SampleKind.EvalAttempts,
                11,
                thresholds({ minEvalAttempts: 10 }),
            ),
        ).toBe(SampleLevel.Adequate);
    });

    it('reads the matching threshold field per SampleKind', () => {
        const all = thresholds({
            minClosedRounds: 4,
            minEvalAttempts: 10,
            minFundedAccounts: 5,
            minTrades: 20,
        });
        expect(sampleAdequacy(SampleKind.FundedAccounts, 5, all)).toBe(
            SampleLevel.Adequate,
        );
        expect(sampleAdequacy(SampleKind.Trades, 19, all)).toBe(
            SampleLevel.Low,
        );
        expect(sampleAdequacy(SampleKind.ClosedRounds, 0, all)).toBe(
            SampleLevel.None,
        );
    });

    it('falls back to the funded-accounts threshold for EndedAccounts when its own threshold is unset, since ended accounts are a subset of ever-funded accounts', () => {
        expect(
            sampleAdequacy(
                SampleKind.EndedAccounts,
                3,
                thresholds({ minFundedAccounts: 5 }),
            ),
        ).toBe(SampleLevel.Low);
        expect(
            sampleAdequacy(
                SampleKind.EndedAccounts,
                5,
                thresholds({ minFundedAccounts: 5 }),
            ),
        ).toBe(SampleLevel.Adequate);
        expect(
            sampleAdequacy(SampleKind.EndedAccounts, 3, thresholds()),
        ).toBe(null);
    });

    it('reads EndedAccounts against its own threshold when set, instead of the funded-accounts fallback', () => {
        expect(
            sampleAdequacy(
                SampleKind.EndedAccounts,
                3,
                thresholds({ minEndedAccounts: 2, minFundedAccounts: 5 }),
            ),
        ).toBe(SampleLevel.Adequate);
        expect(
            sampleAdequacy(
                SampleKind.EndedAccounts,
                1,
                thresholds({ minEndedAccounts: 2, minFundedAccounts: 5 }),
            ),
        ).toBe(SampleLevel.Low);
    });
});
