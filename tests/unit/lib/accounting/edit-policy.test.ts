import { describe, expect, it } from 'vitest';

import { canEditBooking } from '~/lib/accounting/runs/edit-policy';

describe('canEditBooking', () => {
    it('allows editing any booking on a planned run', () => {
        expect(canEditBooking({ outcomes: {}, status: 'planned' }, 't-1')).toBe(
            true,
        );
    });

    it('blocks editing while a run is actively posting', () => {
        expect(canEditBooking({ outcomes: {}, status: 'posting' }, 't-1')).toBe(
            false,
        );
    });

    it('blocks editing on a fully posted run', () => {
        expect(
            canEditBooking(
                { outcomes: { 't-1': { status: 'posted' } }, status: 'posted' },
                't-1',
            ),
        ).toBe(false);
    });

    it('allows editing a not-yet-posted booking on a partial run', () => {
        expect(
            canEditBooking(
                {
                    outcomes: { 't-1': { status: 'posted' } },
                    status: 'partial',
                },
                't-2',
            ),
        ).toBe(true);
    });

    it('blocks editing a booking that already posted on a partial run', () => {
        expect(
            canEditBooking(
                {
                    outcomes: { 't-1': { status: 'posted' } },
                    status: 'partial',
                },
                't-1',
            ),
        ).toBe(false);
    });

    it('allows editing a previously failed booking so it can be fixed and retried', () => {
        expect(
            canEditBooking(
                {
                    outcomes: { 't-1': { error: 'boom', status: 'failed' } },
                    status: 'failed',
                },
                't-1',
            ),
        ).toBe(true);
    });
});
