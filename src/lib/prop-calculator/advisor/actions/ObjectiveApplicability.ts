import { SizingObjective } from '~/lib/prop-calculator/advisor/SizingObjective';

export enum ObjectiveApplicabilityVerdict {
    Applicable = 'applicable',
    NotApplicable = 'not-applicable',
}

export enum RankingSurface {
    Advice = 'advice',
    Compare = 'compare',
    DocumentedRules = 'documented-rules',
    Dp = 'dp',
    FundedRiskSweep = 'funded-risk-sweep',
    Ladder = 'ladder',
    NextSlot = 'next-slot',
}

export interface ObjectiveApplicabilityResult {
    readonly effectiveObjective: SizingObjective;
    readonly reason: null | string;
    readonly verdict: ObjectiveApplicabilityVerdict;
}

export const RUIN_FIRST_NOT_APPLICABLE_REASON =
    'RuinFirst only ranks which plan to buy next (Hard Rule 3: on evals, risk the max the constraints allow, speed to funded, not pass rate; Hard Rule 5: funded risk is a fixed amount, not chosen by an objective); Mistake 10 was recommending conservative eval sizing this way, so eval rungs, funded risk and documented rules keep ranking by MonthlyNet.';

const RUIN_FIRST_SURFACES: ReadonlySet<RankingSurface> = new Set([
    RankingSurface.Compare,
    RankingSurface.NextSlot,
]);

export function objectiveApplicability(
    objective: SizingObjective,
    surface: RankingSurface,
): ObjectiveApplicabilityResult {
    if (
        objective !== SizingObjective.RuinFirst ||
        RUIN_FIRST_SURFACES.has(surface)
    ) {
        return {
            effectiveObjective: objective,
            reason: null,
            verdict: ObjectiveApplicabilityVerdict.Applicable,
        };
    }
    return {
        effectiveObjective: SizingObjective.MonthlyNet,
        reason: RUIN_FIRST_NOT_APPLICABLE_REASON,
        verdict: ObjectiveApplicabilityVerdict.NotApplicable,
    };
}
