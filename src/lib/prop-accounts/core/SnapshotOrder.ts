import { compareText, isAccountDate } from './IsoDate';

export interface LatestTwoSnapshots<T extends OrderedSnapshot> {
    readonly latest: null | T;
    readonly previous: null | T;
}

export interface OrderedSnapshot {
    readonly asOf: string;
    readonly createdAt: Date;
    readonly id: string;
}

export function compareSnapshots(
    left: OrderedSnapshot,
    right: OrderedSnapshot,
): number {
    return (
        compareText(left.asOf, right.asOf) ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        compareText(left.id, right.id)
    );
}

export function latestTwoSnapshots<T extends OrderedSnapshot>(
    snapshots: readonly T[],
): LatestTwoSnapshots<T> {
    const sorted = snapshots
        .filter((snapshot) => isAccountDate(snapshot.asOf))
        .toSorted(compareSnapshots);
    return {
        latest: sorted.at(-1) ?? null,
        previous: sorted.at(-2) ?? null,
    };
}
