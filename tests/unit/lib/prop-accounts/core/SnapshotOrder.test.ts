import { describe, expect, it } from 'vitest';

import {
    compareSnapshots,
    latestTwoSnapshots,
    type OrderedSnapshot,
} from '~/lib/prop-accounts/core';

function snapshot(overrides: Partial<OrderedSnapshot> = {}): OrderedSnapshot {
    return {
        asOf: '2026-09-23',
        createdAt: new Date('2026-09-23T12:00:00Z'),
        id: '10000000-0000-4000-8000-000000000001',
        ...overrides,
    };
}

describe('compareSnapshots', () => {
    it('orders by asOf first', () => {
        const older = snapshot({ asOf: '2026-09-01' });
        const newer = snapshot({ asOf: '2026-09-02' });
        expect(compareSnapshots(older, newer)).toBeLessThan(0);
        expect(compareSnapshots(newer, older)).toBeGreaterThan(0);
    });

    it('breaks an asOf tie by createdAt', () => {
        const early = snapshot({ createdAt: new Date('2026-09-23T08:00:00Z') });
        const late = snapshot({ createdAt: new Date('2026-09-23T09:00:00Z') });
        expect(compareSnapshots(early, late)).toBeLessThan(0);
    });

    it('breaks an asOf and createdAt tie by id', () => {
        const low = snapshot({ id: 'a' });
        const high = snapshot({ id: 'b' });
        expect(compareSnapshots(low, high)).toBeLessThan(0);
    });

    it('is zero for an identical snapshot', () => {
        expect(compareSnapshots(snapshot(), snapshot())).toBe(0);
    });
});

describe('latestTwoSnapshots', () => {
    it('picks the latest and previous by the same ordering', () => {
        const oldest = snapshot({ asOf: '2026-09-01', id: 'a' });
        const middle = snapshot({ asOf: '2026-09-02', id: 'b' });
        const newest = snapshot({ asOf: '2026-09-03', id: 'c' });
        const { latest, previous } = latestTwoSnapshots([
            middle,
            newest,
            oldest,
        ]);
        expect(latest).toBe(newest);
        expect(previous).toBe(middle);
    });

    it('ignores undated rows', () => {
        const dated = snapshot({ asOf: '2026-09-02' });
        const undated = snapshot({ asOf: 'not-a-date', id: 'z' });
        const { latest, previous } = latestTwoSnapshots([undated, dated]);
        expect(latest).toBe(dated);
        expect(previous).toBeNull();
    });

    it('returns nulls for an empty or fully undated list', () => {
        expect(latestTwoSnapshots([])).toEqual({
            latest: null,
            previous: null,
        });
        expect(latestTwoSnapshots([snapshot({ asOf: 'nope' })])).toEqual({
            latest: null,
            previous: null,
        });
    });

    it('returns only latest for a single dated row', () => {
        const only = snapshot();
        expect(latestTwoSnapshots([only])).toEqual({
            latest: only,
            previous: null,
        });
    });
});
