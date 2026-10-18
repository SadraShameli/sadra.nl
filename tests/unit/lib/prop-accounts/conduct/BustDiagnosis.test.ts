import { describe, expect, it } from 'vitest';

import {
    BustDiagnosisKind,
    bustDiagnosisOf,
    BustEvidenceKind,
} from '~/lib/prop-accounts/conduct';
import {
    BustCause,
    RuleViolationKind,
    ruleViolationKindLabel,
    usdCents,
} from '~/lib/prop-accounts/core';

const NO_DECISIONS: never[] = [];
const NO_VIOLATIONS: never[] = [];

describe('bustDiagnosisOf', () => {
    it('is Structural when the bust cause is a rule-driven cause, even with no violations or decisions', () => {
        for (const cause of [
            BustCause.DailyLossLimit,
            BustCause.ConsistencyBreach,
            BustCause.Inactivity,
            BustCause.FirmRuleViolation,
        ]) {
            const diagnosis = bustDiagnosisOf({
                bustCause: cause,
                decisions: NO_DECISIONS,
                violations: NO_VIOLATIONS,
            });
            expect(diagnosis.kind).toBe(BustDiagnosisKind.Structural);
            expect(diagnosis.evidence).toEqual([
                {
                    detail: expect.any(String) as string,
                    kind: BustEvidenceKind.BustCause,
                },
            ]);
        }
    });

    it('is Structural when a violation falls in the attempt window even under MaxDrawdown', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.MaxDrawdown,
            decisions: NO_DECISIONS,
            violations: [
                {
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-09-01',
                },
            ],
        });
        expect(diagnosis.kind).toBe(BustDiagnosisKind.Structural);
        expect(diagnosis.evidence).toContainEqual(
            expect.objectContaining({ kind: BustEvidenceKind.Violation }),
        );
    });

    it('describes a violation in its evidence using the human-readable kind label, not the raw enum value', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.MaxDrawdown,
            decisions: NO_DECISIONS,
            violations: [
                {
                    kind: RuleViolationKind.ForcedRecovery,
                    occurredOn: '2026-09-01',
                },
            ],
        });
        const violationEvidence = diagnosis.evidence.find(
            (item) => item.kind === BustEvidenceKind.Violation,
        );
        expect(violationEvidence?.detail).toContain(
            ruleViolationKindLabel(RuleViolationKind.ForcedRecovery),
        );
        expect(violationEvidence?.detail).not.toContain(
            RuleViolationKind.ForcedRecovery,
        );
    });

    it('is Structural when actual risk in a decision exceeded the accepted risk', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.MaxDrawdown,
            decisions: [
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: usdCents(40_000),
                },
            ],
            violations: NO_VIOLATIONS,
        });
        expect(diagnosis.kind).toBe(BustDiagnosisKind.Structural);
        expect(diagnosis.evidence).toContainEqual(
            expect.objectContaining({
                kind: BustEvidenceKind.RiskAboveAccepted,
            }),
        );
    });

    it('is WithinPlan when MaxDrawdown, decisions were followed and no violation exists', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.MaxDrawdown,
            decisions: [
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: usdCents(25_000),
                },
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: null,
                },
            ],
            violations: NO_VIOLATIONS,
        });
        expect(diagnosis).toEqual({
            evidence: [
                {
                    detail: '2 recorded decisions, none above the accepted risk; the bust cause is max drawdown',
                    kind: BustEvidenceKind.DecisionsFollowed,
                },
            ],
            kind: BustDiagnosisKind.WithinPlan,
        });
    });

    it('words a single followed decision in the singular', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.MaxDrawdown,
            decisions: [
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: usdCents(25_000),
                },
            ],
            violations: NO_VIOLATIONS,
        });
        expect(diagnosis.evidence[0]?.detail).toBe(
            '1 recorded decision, none above the accepted risk; the bust cause is max drawdown',
        );
    });

    it('speaks dollars, not cents, when the actual risk exceeded the accepted risk', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.MaxDrawdown,
            decisions: [
                {
                    acceptedRiskCents: usdCents(10_000),
                    actualRiskCents: usdCents(12_500),
                },
            ],
            violations: NO_VIOLATIONS,
        });
        const risk = diagnosis.evidence.find(
            (item) => item.kind === BustEvidenceKind.RiskAboveAccepted,
        );
        expect(risk?.detail).toBe(
            'Actual risk $125.00 exceeded the accepted risk $100.00',
        );
    });

    it('does not list the decisions-followed evidence for a Structural or Unknown diagnosis', () => {
        const structural = bustDiagnosisOf({
            bustCause: BustCause.DailyLossLimit,
            decisions: [
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: usdCents(25_000),
                },
            ],
            violations: NO_VIOLATIONS,
        });
        const unknown = bustDiagnosisOf({
            bustCause: BustCause.Unknown,
            decisions: [
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: usdCents(25_000),
                },
            ],
            violations: NO_VIOLATIONS,
        });
        expect(
            [...structural.evidence, ...unknown.evidence].some(
                (item) => item.kind === BustEvidenceKind.DecisionsFollowed,
            ),
        ).toBe(false);
    });

    it('is Unknown for a MaxDrawdown bust with no decisions and no violations recorded', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.MaxDrawdown,
            decisions: NO_DECISIONS,
            violations: NO_VIOLATIONS,
        });
        expect(diagnosis).toEqual({
            evidence: [],
            kind: BustDiagnosisKind.Unknown,
        });
    });

    it('is Unknown when the bust cause itself is unknown, decisions followed and no violation exists', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.Unknown,
            decisions: [
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: usdCents(25_000),
                },
            ],
            violations: NO_VIOLATIONS,
        });
        expect(diagnosis.kind).toBe(BustDiagnosisKind.Unknown);
    });
});
