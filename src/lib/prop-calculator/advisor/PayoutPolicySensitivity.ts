import { type PayoutRequestPolicy } from '~/lib/prop-calculator/core';

import { type LifetimePayoutCapBasis } from './policy';
import { type StartBasis } from './StartBasis';

export const OPTIMUM_MISSING_DISCLOSURE =
    'The payout-size optimum is missing for some plans, so the comparison of the two orders is withheld.';
export const PAYOUT_POLICY_SENSITIVE_NOTE =
    'Payout-policy sensitive: the plan order changes under the payout-size optimum.';

export interface PayoutPolicySensitivityFigure {
    readonly monthlyNet: number;
    readonly standardError: null | number;
}

export interface PayoutPolicySensitivityLabels {
    readonly lifetimeCapBasis: LifetimePayoutCapBasis;
    readonly payoutPolicy: PayoutRequestPolicy;
    readonly retainedCushion: number;
    readonly startBasis: StartBasis;
    readonly trials: number;
}

export interface PayoutPolicySensitivityPlanEntry {
    readonly documented: PayoutPolicySensitivityFigure;
    readonly labels: PayoutPolicySensitivityLabels;
    readonly optimum: null | PayoutPolicySensitivityFigure;
    readonly planKey: string;
}

export interface PayoutPolicySensitivityRankedEntry extends PayoutPolicySensitivityPlanEntry {
    readonly documentedRank: number;
    readonly optimumRank: null | number;
    readonly payoutPolicySensitive: boolean;
}

export function payoutPolicySensitivity(
    entries: readonly PayoutPolicySensitivityPlanEntry[],
): readonly PayoutPolicySensitivityRankedEntry[] {
    const documentedOrder = rankKeysBy(
        entries,
        (entry) => entry.documented.monthlyNet,
    );
    const optimumEntries = entries.filter(
        (
            entry,
        ): entry is PayoutPolicySensitivityPlanEntry & {
            optimum: PayoutPolicySensitivityFigure;
        } => entry.optimum !== null,
    );
    const optimumOrder = rankKeysBy(
        optimumEntries,
        (entry) => entry.optimum.monthlyNet,
    );
    const comparableDocumentedOrder = rankKeysBy(
        optimumEntries,
        (entry) => entry.documented.monthlyNet,
    );

    return entries.map((entry) => {
        const documentedRank = documentedOrder.get(entry.planKey);
        if (documentedRank === undefined) {
            throw new Error(
                `payoutPolicySensitivity: no documented rank computed for plan key ${entry.planKey}`,
            );
        }
        const optimumRank = optimumOrder.get(entry.planKey) ?? null;
        return {
            ...entry,
            documentedRank,
            optimumRank,
            payoutPolicySensitive:
                optimumRank !== null &&
                optimumRank !== comparableDocumentedOrder.get(entry.planKey),
        };
    });
}

function rankKeysBy<T extends { planKey: string }>(
    entries: readonly T[],
    valueOf: (entry: T) => number,
): Map<string, number> {
    const ranked = entries
        .toSorted((a, b) => {
            const diff = valueOf(b) - valueOf(a);
            return diff === 0 ? a.planKey.localeCompare(b.planKey) : diff;
        })
        .map((entry, index) => [entry.planKey, index + 1] as const);
    return new Map(ranked);
}
