import { describe, expect, it } from 'vitest';

import { localIsoDate } from '~/lib/lifting/date-range';

describe('localIsoDate', () => {
    it('keys a local date as a zero-padded ISO calendar day', () => {
        expect(localIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('keeps a late evening on its own local day', () => {
        expect(localIsoDate(new Date(2026, 9, 18, 23, 59, 59))).toBe(
            '2026-10-18',
        );
    });

    it('starts the next day at local midnight', () => {
        expect(localIsoDate(new Date(2026, 9, 19, 0, 0, 0))).toBe('2026-10-19');
    });
});
