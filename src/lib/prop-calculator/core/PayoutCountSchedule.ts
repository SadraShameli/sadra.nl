export interface PayoutCountIndexed {
    readonly fromPayoutIndex: number;
}

export function assertPayoutCountSchedule(
    owner: string,
    entries: readonly PayoutCountIndexed[],
): void {
    if (entries.length === 0) {
        throw new Error(`${owner}: tiers must not be empty`);
    }
    for (const entry of entries) {
        if (
            !Number.isSafeInteger(entry.fromPayoutIndex) ||
            entry.fromPayoutIndex < 0
        ) {
            throw new Error(
                `${owner}: fromPayoutIndex must be a non-negative integer, got ${entry.fromPayoutIndex}`,
            );
        }
    }
    const sorted = sortByPayoutIndex(entries);
    if (sorted[0]?.fromPayoutIndex !== 0) {
        throw new Error(
            `${owner}: the first tier must start at fromPayoutIndex 0`,
        );
    }
    const seen = new Set<number>();
    for (const entry of sorted) {
        if (seen.has(entry.fromPayoutIndex)) {
            throw new Error(
                `${owner}: duplicate fromPayoutIndex ${entry.fromPayoutIndex}`,
            );
        }
        seen.add(entry.fromPayoutIndex);
    }
}

export function resolvePayoutCountEntry<TEntry extends PayoutCountIndexed>(
    owner: string,
    entries: readonly TEntry[],
    payoutsIssued: number,
): TEntry {
    let lowest: TEntry | undefined;
    let best: TEntry | undefined;
    for (const entry of entries) {
        if (
            lowest === undefined ||
            entry.fromPayoutIndex < lowest.fromPayoutIndex
        ) {
            lowest = entry;
        }
        if (
            entry.fromPayoutIndex <= payoutsIssued &&
            (best === undefined || entry.fromPayoutIndex > best.fromPayoutIndex)
        ) {
            best = entry;
        }
    }
    const resolved = best ?? lowest;
    if (resolved === undefined) {
        throw new Error(`${owner}: no tiers configured`);
    }
    return resolved;
}

export function sortByPayoutIndex<TEntry extends PayoutCountIndexed>(
    entries: readonly TEntry[],
): TEntry[] {
    return entries.toSorted((a, b) => a.fromPayoutIndex - b.fromPayoutIndex);
}
