import { describe, expect, it } from 'vitest';

import {
    type SeriesEvent,
    type SeriesSnapshot,
    snapshotSeries,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/snapshotSeries';
import { accountEventKindLabel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    AccountEventKind,
    usdCents,
    usdCentsToDollars,
} from '~/lib/prop-accounts';

function event(
    id: string,
    kind: AccountEventKind,
    occurredOn: string,
): SeriesEvent {
    return { id, kind, occurredOn };
}

function snapshot(
    id: string,
    asOf: string,
    balanceCents: number,
    createdAt = `${asOf}T12:00:00Z`,
): SeriesSnapshot {
    return {
        asOf,
        balanceCents: usdCents(balanceCents),
        createdAt: new Date(createdAt),
        id,
    };
}

describe('snapshotSeries', () => {
    it('returns an empty series for no snapshots and no events', () => {
        expect(snapshotSeries([], [])).toEqual({ markers: [], points: [] });
    });

    it('orders points by as-of date, then creation time, then id, like the latest-snapshot order', () => {
        const series = snapshotSeries(
            [
                snapshot('c', '2026-09-03', 5_010_000),
                snapshot('b', '2026-09-01', 5_000_000, '2026-09-02T08:00:00Z'),
                snapshot('z', '2026-09-01', 4_990_000, '2026-09-01T08:00:00Z'),
                snapshot('a', '2026-09-01', 4_980_000, '2026-09-02T08:00:00Z'),
            ],
            [],
        );
        expect(series.points.map((point) => point.id)).toEqual([
            'z',
            'a',
            'b',
            'c',
        ]);
    });

    it('converts cents to dollars exactly through usdCentsToDollars', () => {
        const cents = [5_000_001, 4_999_999, 1, -250_050];
        const series = snapshotSeries(
            cents.map((value, index) =>
                snapshot(
                    `s${String(index)}`,
                    `2026-09-1${String(index)}`,
                    value,
                ),
            ),
            [],
        );
        expect(series.points.map((point) => point.balance)).toEqual(
            cents.map((value) => usdCentsToDollars(usdCents(value))),
        );
        expect(series.points[0]?.balance).toBe(50_000.01);
        expect(series.points[3]?.balance).toBe(-2500.5);
    });

    it('keeps every snapshot, including two on the same day', () => {
        const series = snapshotSeries(
            [
                snapshot('first', '2026-09-01', 5_000_000),
                snapshot('second', '2026-09-01', 5_010_000),
            ],
            [],
        );
        expect(series.points).toHaveLength(2);
        expect(series.points.map((point) => point.asOf)).toEqual([
            '2026-09-01',
            '2026-09-01',
        ]);
    });

    it('marks every event on its own date with its kind and readable label, even with no snapshot that day', () => {
        const series = snapshotSeries(
            [snapshot('s1', '2026-09-02', 5_000_000)],
            [
                event('e2', AccountEventKind.EvalPassed, '2026-09-05'),
                event('e1', AccountEventKind.Purchased, '2026-09-01'),
                event('e3', AccountEventKind.Busted, '2026-09-05'),
            ],
        );
        expect(series.markers).toEqual([
            {
                id: 'e1',
                kind: AccountEventKind.Purchased,
                label: accountEventKindLabel(AccountEventKind.Purchased),
                on: '2026-09-01',
            },
            {
                id: 'e2',
                kind: AccountEventKind.EvalPassed,
                label: accountEventKindLabel(AccountEventKind.EvalPassed),
                on: '2026-09-05',
            },
            {
                id: 'e3',
                kind: AccountEventKind.Busted,
                label: accountEventKindLabel(AccountEventKind.Busted),
                on: '2026-09-05',
            },
        ]);
        expect(series.points).toHaveLength(1);
    });

    it('does not reorder or change its inputs', () => {
        const snapshots = [
            snapshot('b', '2026-09-02', 5_000_000),
            snapshot('a', '2026-09-01', 4_990_000),
        ];
        const copy = structuredClone(snapshots);
        snapshotSeries(snapshots, []);
        expect(snapshots).toEqual(copy);
    });
});
