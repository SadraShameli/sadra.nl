import {
    type AccountEventKind,
    compareText,
    type UsdCents,
    usdCentsToDollars,
} from '~/lib/prop-accounts';
import { type Dollars } from '~/lib/prop-calculator';

import { accountEventKindLabel } from '../overview/overviewModel';

export interface SeriesEvent {
    readonly id: string;
    readonly kind: AccountEventKind;
    readonly occurredOn: string;
}

export interface SeriesSnapshot {
    readonly asOf: string;
    readonly balanceCents: UsdCents;
    readonly createdAt: Date;
    readonly id: string;
}

export interface SnapshotSeries {
    readonly markers: readonly SnapshotEventMarker[];
    readonly points: readonly SnapshotSeriesPoint[];
}

interface SnapshotEventMarker {
    readonly id: string;
    readonly kind: AccountEventKind;
    readonly label: string;
    readonly on: string;
}

interface SnapshotSeriesPoint {
    readonly asOf: string;
    readonly balance: Dollars;
    readonly id: string;
}

export function snapshotSeries(
    snapshots: readonly SeriesSnapshot[],
    events: readonly SeriesEvent[],
): SnapshotSeries {
    return {
        markers: events
            .toSorted((left, right) =>
                compareText(left.occurredOn, right.occurredOn),
            )
            .map((event) => ({
                id: event.id,
                kind: event.kind,
                label: accountEventKindLabel(event.kind),
                on: event.occurredOn,
            })),
        points: snapshots.toSorted(compareSnapshots).map((snapshot) => ({
            asOf: snapshot.asOf,
            balance: usdCentsToDollars(snapshot.balanceCents),
            id: snapshot.id,
        })),
    };
}

function compareSnapshots(left: SeriesSnapshot, right: SeriesSnapshot): number {
    return (
        compareText(left.asOf, right.asOf) ||
        left.createdAt.getTime() - right.createdAt.getTime() ||
        compareText(left.id, right.id)
    );
}
