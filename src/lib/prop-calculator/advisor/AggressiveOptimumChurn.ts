import {
    type FirmAccountPolicy,
    isAggressiveSizingConcern,
    type Plan,
    PolicyVerification,
} from '~/lib/prop-calculator/core';

import {
    DifferenceReason,
    type DifferenceReasonDetail,
} from './DifferenceReason';
import { type DocumentedSizing } from './DocumentedSizing';

export interface AggressiveOptimumChurnInput {
    readonly accountPolicy: FirmAccountPolicy | undefined;
    readonly documentedPeakRisk: null | number;
    readonly optimumPeakRisk: null | number;
    readonly plan: Plan;
}

export function aggressiveOptimumChurnReasons(
    input: AggressiveOptimumChurnInput,
): readonly DifferenceReasonDetail[] {
    const { accountPolicy, documentedPeakRisk, optimumPeakRisk, plan } = input;
    const isOptimumRiskier =
        documentedPeakRisk !== null &&
        optimumPeakRisk !== null &&
        optimumPeakRisk > documentedPeakRisk;
    return isOptimumRiskier
        ? (accountPolicy?.conductPatterns(plan) ?? []).flatMap((pattern) =>
              isAggressiveSizingConcern(pattern) &&
              pattern.source.verification === PolicyVerification.Confirmed
                  ? [{ kind: DifferenceReason.AggressiveOptimumChurn, pattern }]
                  : [],
          )
        : [];
}

export function documentedPeakRiskOf(
    documented: DocumentedSizing | null,
): null | number {
    return peakRiskOf(documented?.rungs.map((rung) => rung.risk) ?? []);
}

export function peakRiskOf(risks: readonly number[]): null | number {
    return risks.length === 0 ? null : Math.max(...risks);
}
