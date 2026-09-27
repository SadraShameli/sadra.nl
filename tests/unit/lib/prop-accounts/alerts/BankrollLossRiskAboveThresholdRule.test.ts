import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    BankrollLossRiskAboveThresholdRule,
} from '~/lib/prop-accounts/alerts';
import { type RealizedLossRisk } from '~/lib/prop-accounts/bankroll';
import { dollars } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { EconomicsReason } from '~/lib/prop-calculator/economics';

import { alertsOf } from './alertFixtures';

const rule = new BankrollLossRiskAboveThresholdRule();

const RULEBOOK_WITH_THRESHOLD = {
    ...DEFAULT_RULEBOOK,
    bankroll: { ...DEFAULT_RULEBOOK.bankroll, lossRiskThreshold: 0.05 },
    samples: { ...DEFAULT_RULEBOOK.samples, minEvalAttempts: 5 },
};

function riskOf(overrides: Partial<RealizedLossRisk> = {}): RealizedLossRisk {
    return {
        attemptPaysRate: null,
        attempts: 10,
        batchLossProbability: { standardError: 0.02, value: 0.1 },
        meanNetPerAttemptCents: 5000,
        minimumBudget: { disclosures: [], reason: null, value: dollars(0) },
        noPayoutProbability: null,
        reason: null,
        sampleCount: 20,
        toFirstPayoutDays: 30,
        toFirstPayoutMeasured: true,
        ...overrides,
    };
}

describe('BankrollLossRiskAboveThresholdRule', () => {
    it('is silent with no threshold set', () => {
        expect(
            alertsOf(rule, {
                realizedLossRisk: riskOf(),
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toEqual([]);
    });

    it('is silent with no realized figure', () => {
        expect(
            alertsOf(rule, {
                realizedLossRisk: null,
                rulebook: RULEBOOK_WITH_THRESHOLD,
            }),
        ).toEqual([]);
    });

    it('is silent below the threshold', () => {
        expect(
            alertsOf(rule, {
                realizedLossRisk: riskOf({
                    batchLossProbability: { standardError: 0.01, value: 0.03 },
                }),
                rulebook: RULEBOOK_WITH_THRESHOLD,
            }),
        ).toEqual([]);
    });

    it('is silent when the eval-attempts sample level is None (n = 0) even with a threshold set', () => {
        expect(
            alertsOf(rule, {
                realizedLossRisk: riskOf({ sampleCount: 0 }),
                rulebook: RULEBOOK_WITH_THRESHOLD,
            }),
        ).toEqual([]);
    });

    it('is silent when the sample threshold itself is not set (unrated)', () => {
        expect(
            alertsOf(rule, {
                realizedLossRisk: riskOf(),
                rulebook: {
                    ...RULEBOOK_WITH_THRESHOLD,
                    samples: {
                        ...RULEBOOK_WITH_THRESHOLD.samples,
                        minEvalAttempts: null,
                    },
                },
            }),
        ).toEqual([]);
    });

    it('is silent with NoPositiveEdge, which the bankroll card shows instead', () => {
        expect(
            alertsOf(rule, {
                realizedLossRisk: riskOf({
                    batchLossProbability: null,
                    reason: EconomicsReason.NoPositiveEdge,
                }),
                rulebook: RULEBOOK_WITH_THRESHOLD,
            }),
        ).toEqual([]);
    });

    it('fires a Warning above the threshold, naming the realized figure and the sample', () => {
        const alerts = alertsOf(rule, {
            realizedLossRisk: riskOf(),
            rulebook: RULEBOOK_WITH_THRESHOLD,
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(
            AlertKind.BankrollLossRiskAboveThreshold,
        );
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.subject.kind).toBe(AlertSubjectKind.Portfolio);
        expect(alerts[0]?.message).toContain('10.0%');
        expect(alerts[0]?.message).toContain('5.0%');
    });
});
