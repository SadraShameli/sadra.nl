import { describe, expect, it, vi } from 'vitest';

import {
    PR_FILTER_DEFAULTS,
    PR_KIND_ALL,
    type PrFilterCriteria,
    PrFilters,
    PrRangePreset,
} from '~/lib/lifting/pr-filters';

const NOW = new Date(2026, 9, 15, 12, 0, 0);

const ROWS = [
    {
        achievedAt: new Date(2026, 9, 14, 9, 0, 0),
        id: 'a',
        kind: 'estimated_1rm',
    },
    {
        achievedAt: new Date(2026, 9, 5, 23, 30, 0),
        id: 'b',
        kind: 'heaviest_weight',
    },
    {
        achievedAt: new Date(2026, 9, 1, 0, 0, 0),
        id: 'c',
        kind: 'estimated_1rm',
    },
    {
        achievedAt: new Date(2026, 6, 1, 8, 0, 0).toISOString(),
        id: 'd',
        kind: 'reps_at_weight',
    },
    {
        achievedAt: new Date(2024, 0, 1, 8, 0, 0),
        id: 'e',
        kind: 'heaviest_weight',
    },
];

function ids(criteria: Partial<PrFilterCriteria>): string[] {
    return PrFilters.filter(
        ROWS,
        { ...PR_FILTER_DEFAULTS, ...criteria },
        () => NOW,
    ).map((row) => row.id);
}

describe('PrFilters.filter', () => {
    it('reads the clock only when a day-count preset is chosen, so a prerender with all time never reads it', () => {
        const clock = vi.fn(() => NOW);
        PrFilters.filter(ROWS, PR_FILTER_DEFAULTS, clock);
        expect(clock).not.toHaveBeenCalled();
    });

    it('keeps every row with the default criteria', () => {
        expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('filters by kind', () => {
        expect(ids({ kind: 'heaviest_weight' })).toEqual(['b', 'e']);
    });

    it.each([
        [PrRangePreset.Days7, ['a']],
        [PrRangePreset.Days30, ['a', 'b', 'c']],
        [PrRangePreset.Days90, ['a', 'b', 'c']],
        [PrRangePreset.Days365, ['a', 'b', 'c', 'd']],
    ])('limits the %s day preset to recent rows', (range, expected) => {
        expect(ids({ range })).toEqual(expected);
    });

    it('treats a custom range as whole local days', () => {
        expect(
            ids({
                customRange: {
                    from: new Date(2026, 9, 1, 15, 0, 0),
                    to: new Date(2026, 9, 5, 1, 0, 0),
                },
            }),
        ).toEqual(['b', 'c']);
    });

    it('uses the start day as the end of an open custom range', () => {
        expect(
            ids({ customRange: { from: new Date(2026, 9, 14, 20, 0, 0) } }),
        ).toEqual(['a']);
    });

    it('lets a custom range override the preset', () => {
        expect(
            ids({
                customRange: { from: new Date(2024, 0, 1) },
                range: PrRangePreset.Days7,
            }),
        ).toEqual(['e']);
    });

    it('ignores a custom range without a start', () => {
        expect(
            ids({
                customRange: { from: undefined, to: new Date(2024, 0, 1) },
                range: PrRangePreset.Days7,
            }),
        ).toEqual(['a']);
    });

    it('combines kind with the date filter', () => {
        expect(
            ids({ kind: 'estimated_1rm', range: PrRangePreset.Days7 }),
        ).toEqual(['a']);
    });
});

describe('PrFilters.isActive', () => {
    it('is inactive for the defaults', () => {
        expect(PrFilters.isActive(PR_FILTER_DEFAULTS)).toBe(false);
    });

    it.each<Partial<PrFilterCriteria>>([
        { kind: 'best_volume_set' },
        { range: PrRangePreset.Days30 },
        { customRange: { from: NOW } },
    ])('is active for %o', (criteria) => {
        expect(PrFilters.isActive({ ...PR_FILTER_DEFAULTS, ...criteria })).toBe(
            true,
        );
    });

    it('stays inactive for a custom range without a start', () => {
        expect(
            PrFilters.isActive({
                ...PR_FILTER_DEFAULTS,
                customRange: { from: undefined, to: NOW },
            }),
        ).toBe(false);
    });
});

describe('PrFilters parsing', () => {
    it('maps a select value to a PR kind or all kinds', () => {
        expect(PrFilters.kindFor('reps_at_weight')).toBe('reps_at_weight');
        expect(PrFilters.kindFor(undefined)).toBe(PR_KIND_ALL);
        expect(PrFilters.kindFor('nope')).toBe(PR_KIND_ALL);
    });

    it('maps a select value to a preset or all time', () => {
        expect(PrFilters.presetFor('90')).toBe(PrRangePreset.Days90);
        expect(PrFilters.presetFor(undefined)).toBe(PrRangePreset.All);
        expect(PrFilters.presetFor('14')).toBe(PrRangePreset.All);
    });

    it('labels every preset', () => {
        expect(PrFilters.preset(PrRangePreset.All)).toEqual({
            days: null,
            label: 'All time',
        });
        expect(PrFilters.preset(PrRangePreset.Days365).days).toBe(365);
    });
});
