import { RetainedCushionBasis } from './PayoutRequestDecision';
import { fundedRetainedCushionResolution } from './PayoutRequestRule';
import {
    type DocumentedPolicySpec,
    resolveDocumentedRetainedCushion,
} from './policy';

export interface DocumentedRetainedCushionResolution {
    readonly amount: number;
    readonly basis: RetainedCushionBasis;
}

export function documentedRetainedCushionResolution(
    spec: Pick<DocumentedPolicySpec, 'enginePolicy' | 'rulebook'>,
): DocumentedRetainedCushionResolution {
    const { enginePolicy, rulebook } = spec;
    const amount = resolveDocumentedRetainedCushion(
        enginePolicy,
        rulebook.payout,
    );
    const rulebookResolution = fundedRetainedCushionResolution(rulebook);
    if (amount === rulebookResolution.amount) {
        return { amount, basis: rulebookResolution.basis };
    }
    return {
        amount,
        basis:
            enginePolicy.retainedCushionRequest === null
                ? RetainedCushionBasis.RulebookSize
                : RetainedCushionBasis.PersonalOverride,
    };
}
