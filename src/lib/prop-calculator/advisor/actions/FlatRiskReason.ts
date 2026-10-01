import {
    DifferenceReason,
    type DifferenceReasonDetail,
} from '~/lib/prop-calculator/advisor/DifferenceReason';
import { type Dollars, dollars } from '~/lib/prop-calculator/core';
import {
    isBeyondNoise,
    type UncertainValue,
} from '~/lib/prop-calculator/stats';

export function flatRiskIgnoresStateReason(
    documentedFlatRisk: Dollars,
    fromStateOptimum: UncertainValue,
): DifferenceReasonDetail | null {
    const documented: UncertainValue = {
        standardError: 0,
        value: documentedFlatRisk,
    };
    if (!isBeyondNoise(documented, fromStateOptimum, { sharedSeed: false })) {
        return null;
    }
    const combinedSE = Math.hypot(
        documented.standardError ?? 0,
        fromStateOptimum.standardError ?? 0,
    );
    const gap = Math.abs(fromStateOptimum.value - documentedFlatRisk);
    return {
        documentedFlatRisk,
        fromStateOptimum: dollars(fromStateOptimum.value),
        gapInCombinedSEs: combinedSE === 0 ? null : gap / combinedSE,
        kind: DifferenceReason.FlatRiskIgnoresState,
    };
}
