import {
    BustCause,
    bustCauseLabel,
    CentsDisplay,
    formatUsdCents,
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
    DecisionsFollowed = 'decisions-followed',
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
        if (isActualRiskAboveAccepted(decision)) {
            evidence.push({
                detail: `Actual risk ${formatUsdCents(decision.actualRiskCents, CentsDisplay.Always)} exceeded the accepted risk ${formatUsdCents(decision.acceptedRiskCents, CentsDisplay.Always)}`,
                kind: BustEvidenceKind.RiskAboveAccepted,
            });
        }
    }
    if (evidence.length > 0) {
        return { evidence, kind: BustDiagnosisKind.Structural };
    }
    const isDecisionsFollowed = input.decisions.every(
        (decision) => !isActualRiskAboveAccepted(decision),
    );
    const isWithinPlan =
        input.decisions.length > 0 &&
        input.bustCause === BustCause.MaxDrawdown &&
        isDecisionsFollowed;
    if (!isWithinPlan) return { evidence: [], kind: BustDiagnosisKind.Unknown };
    return {
        evidence: [
            {
                detail: `${String(input.decisions.length)} recorded ${input.decisions.length === 1 ? 'decision' : 'decisions'}, none above the accepted risk; the bust cause is max drawdown`,
                kind: BustEvidenceKind.DecisionsFollowed,
            },
        ],
        kind: BustDiagnosisKind.WithinPlan,
    };
}

export function isActualRiskAboveAccepted(
    decision: BustDiagnosisDecision,
): decision is BustDiagnosisDecision & { readonly actualRiskCents: UsdCents } {
    return (
        decision.actualRiskCents !== null &&
        decision.actualRiskCents > decision.acceptedRiskCents
    );
}
