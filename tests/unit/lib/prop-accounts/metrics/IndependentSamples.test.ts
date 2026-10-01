import { describe, expect, it } from 'vitest';

import {
    independentSampleCount,
    independentSamples,
} from '~/lib/prop-accounts/metrics/IndependentSamples';

interface Item {
    readonly copyGroupId: null | string;
    readonly id: string;
    readonly purchasedOn: string;
}

function item(
    id: string,
    copyGroupId: null | string,
    purchasedOn: string,
): Item {
    return { copyGroupId, id, purchasedOn };
}

describe('independentSamples', () => {
    it('merges a copy group bought together into one sample', () => {
        const groups = independentSamples([
            item('a', 'group-1', '2026-09-01'),
            item('b', 'group-1', '2026-09-01'),
            item('c', 'group-1', '2026-09-01'),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
        expect(independentSampleCount(groups.flat())).toBe(1);
    });

    it('counts ungrouped accounts one each', () => {
        const items = [
            item('a', null, '2026-09-01'),
            item('b', null, '2026-09-02'),
            item('c', null, '2026-09-02'),
        ];
        expect(independentSampleCount(items)).toBe(3);
        expect(independentSamples(items)).toHaveLength(3);
    });

    it('does not merge the same copy group bought on different dates', () => {
        const items = [
            item('a', 'group-1', '2026-09-01'),
            item('b', 'group-1', '2026-09-08'),
        ];
        expect(independentSampleCount(items)).toBe(2);
    });

    it('keeps different copy groups apart', () => {
        const items = [
            item('a', 'group-1', '2026-09-01'),
            item('b', 'group-2', '2026-09-01'),
        ];
        expect(independentSampleCount(items)).toBe(2);
    });

    it('is 0 for an empty list', () => {
        expect(independentSampleCount([])).toBe(0);
        expect(independentSamples([])).toEqual([]);
    });
});
