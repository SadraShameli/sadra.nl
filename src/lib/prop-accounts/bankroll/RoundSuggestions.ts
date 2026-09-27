import {
    compareText,
    type FirmKey,
    groupByFirmKey,
    isoDaysBetween,
} from '~/lib/prop-accounts/core';

export interface RoundSuggestion {
    readonly earliestPurchase: string;
    readonly firmKey: FirmKey;
    readonly latestPurchase: string;
    readonly memberAccountIds: readonly string[];
}

export interface RoundSuggestionCandidate {
    readonly accountId: string;
    readonly firmKey: FirmKey;
    readonly purchasedOn: string;
}

export function roundSuggestions(
    candidates: readonly RoundSuggestionCandidate[],
    roundGapDays: number,
): readonly RoundSuggestion[] {
    return groupByFirmKey(candidates, (candidate) => candidate.firmKey)
        .flatMap(({ firmKey, items }) => suggestionsForFirm(firmKey, items, roundGapDays))
        .toSorted((a, b) => compareText(a.earliestPurchase, b.earliestPurchase));
}

function suggestionsForFirm(
    firmKey: FirmKey,
    candidates: readonly RoundSuggestionCandidate[],
    roundGapDays: number,
): readonly RoundSuggestion[] {
    const sorted = candidates.toSorted(
        (a, b) =>
            compareText(a.purchasedOn, b.purchasedOn) ||
            compareText(a.accountId, b.accountId),
    );
    const groups: RoundSuggestionCandidate[][] = [];
    for (const candidate of sorted) {
        const currentGroup = groups.at(-1);
        const last = currentGroup?.at(-1);
        if (
            last !== undefined &&
            isoDaysBetween(last.purchasedOn, candidate.purchasedOn) <=
                roundGapDays
        ) {
            currentGroup?.push(candidate);
        } else {
            groups.push([candidate]);
        }
    }
    return groups
        .filter((group) => group.length >= 2)
        .map((group) => ({
            earliestPurchase: group[0]?.purchasedOn ?? '',
            firmKey,
            latestPurchase: group.at(-1)?.purchasedOn ?? '',
            memberAccountIds: group.map((candidate) => candidate.accountId),
        }));
}
