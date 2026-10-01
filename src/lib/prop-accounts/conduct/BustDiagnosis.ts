import {
    BustCause,
    bustCauseLabel,
    type RuleViolationKind,
    ruleViolationKindLabel,
    type UsdCents,
} from '~/lib/prop-accounts/core';

export enum BustDiagnosisKind {
    Structural = 'structural',
    Unknown = 'unknown',
    WithinPlan = 'within-plan',
}

export enum BustEvidenceKind {
    BustCause = 'bust-cause',
    RiskAboveAccepted = 'risk-above-accepted',
    Violation = 'violation',
}

export interface BustDiagnosis {
    readonly evidence: readonly BustEvidenceItem[];
    readonly kind: BustDiagnosisKind;
}

export interface BustDiagnosisDecision {
    readonly acceptedRiskCents: UsdCents;
    readonly actualRiskCents: null | UsdCents;
}

export interface BustDiagnosisInput {
    readonly bustCause: BustCause;
    readonly decisions: readonly BustDiagnosisDecision[];
    readonly violations: readonly BustDiagnosisViolation[];
}

export interface BustDiagnosisViolation {
    readonly kind: RuleViolationKind;
    readonly occurredOn: string;
}

export interface BustEvidenceItem {
    readonly detail: string;
    readonly kind: BustEvidenceKind;
}

const STRUCTURAL_BUST_CAUSES: ReadonlySet<BustCause> = new Set([
    BustCause.ConsistencyBreach,
    BustCause.DailyLossLimit,
    BustCause.FirmRuleViolation,
    BustCause.Inactivity,
]);

export function bustDiagnosisOf(input: BustDiagnosisInput): BustDiagnosis {
    const evidence: BustEvidenceItem[] = [];
    if (STRUCTURAL_BUST_CAUSES.has(input.bustCause)) {
        evidence.push({
            detail: `The bust cause "${bustCauseLabel(input.bustCause)}" is a rule breach, not a drawdown reached while trading within the plan`,
            kind: BustEvidenceKind.BustCause,
        });
    }
    for (const violation of input.violations) {
        evidence.push({
            detail: `A ${ruleViolationKindLabel(violation.kind)} violation was recorded on ${violation.occurredOn}, inside the attempt window`,
            kind: BustEvidenceKind.Violation,
        });
    }
    for (const decision of input.decisions) {
        if (
            decision.actualRiskCents !== null &&
            decision.actualRiskCents > decision.acceptedRiskCents
        ) {
            evidence.push({
                detail: `Actual risk ${String(decision.actualRiskCents)}c exceeded the accepted risk ${String(decision.acceptedRiskCents)}c`,
                kind: BustEvidenceKind.RiskAboveAccepted,
            });
        }
    }
    if (evidence.length > 0) {
        return { evidence, kind: BustDiagnosisKind.Structural };
    }
    const isDecisionsFollowed = input.decisions.every(
        (decision) =>
            decision.actualRiskCents === null ||
            decision.actualRiskCents <= decision.acceptedRiskCents,
    );
    const isWithinPlan =
        input.decisions.length > 0 &&
        input.bustCause === BustCause.MaxDrawdown &&
        isDecisionsFollowed;
    return isWithinPlan
        ? { evidence: [], kind: BustDiagnosisKind.WithinPlan }
        : { evidence: [], kind: BustDiagnosisKind.Unknown };
}
