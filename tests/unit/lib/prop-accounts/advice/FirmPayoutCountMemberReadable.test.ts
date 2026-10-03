import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    type FirmCountMember,
    isFirmCountMemberReadable,
} from '~/lib/prop-accounts/advice';
import {
    AccountEventKind,
    AccountTracking,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import { FirmId } from '~/lib/prop-calculator';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '../../../../../src');

function memberOf(overrides: Partial<FirmCountMember> = {}): FirmCountMember {
    return {
        account: {
            externalFirmId: null,
            firmId: FirmId.Mffu,
            id: 'a',
            planLabel: null,
            planSerial: 'mffu-pro-50000',
            tracking: AccountTracking.Modeled,
        },
        events: [],
        payouts: [],
        ...overrides,
    };
}

function payoutOf(overrides: Record<string, unknown> = {}) {
    return {
        grossCents: usdCents(100_000),
        netCents: null,
        paidOn: null,
        requestedOn: '2026-09-20',
        status: PayoutStatus.Requested,
        ...overrides,
    };
}

describe('one account own readability predicate for the firm payout count (PT-36p, F-145)', () => {
    it('reads an account with dated payouts and a dated live move', () => {
        const member = memberOf({
            events: [
                { kind: AccountEventKind.MovedLive, occurredOn: '2026-09-01' },
            ],
            payouts: [payoutOf()],
        });
        expect(isFirmCountMemberReadable(member)).toBe(true);
    });

    it('reads an account with no payouts and no events', () => {
        expect(isFirmCountMemberReadable(memberOf())).toBe(true);
    });

    it('cannot read an account whose plan shape is unreadable', () => {
        expect(
            isFirmCountMemberReadable(
                memberOf({
                    account: {
                        externalFirmId: null,
                        firmId: FirmId.Mffu,
                        id: 'broken',
                        planLabel: null,
                        planSerial: null,
                        tracking: AccountTracking.Modeled,
                    },
                }),
            ),
        ).toBe(false);
    });

    it.each([
        ['a malformed requested date', payoutOf({ requestedOn: 'someday' })],
        ['a malformed paid date', payoutOf({ paidOn: 'sometime' })],
        [
            'a paid payout with no paid date',
            payoutOf({ paidOn: null, status: PayoutStatus.Paid }),
        ],
    ])('cannot read an account with %s', (_label, payout) => {
        expect(isFirmCountMemberReadable(memberOf({ payouts: [payout] }))).toBe(
            false,
        );
    });

    it('cannot read an account with a malformed live move date', () => {
        expect(
            isFirmCountMemberReadable(
                memberOf({
                    events: [
                        {
                            kind: AccountEventKind.MovedLive,
                            occurredOn: 'soon',
                        },
                    ],
                }),
            ),
        ).toBe(false);
    });

    it('ignores the date of an event that is not a live move', () => {
        expect(
            isFirmCountMemberReadable(
                memberOf({
                    events: [
                        {
                            kind: AccountEventKind.Purchased,
                            occurredOn: 'whenever',
                        },
                    ],
                }),
            ),
        ).toBe(true);
    });

    it('is the check the per-account live proximity row uses, not the whole firm count', () => {
        const source = readFileSync(
            path.join(
                SOURCE_ROOT,
                'lib/prop-accounts/metrics/LiveTransitionProximity.ts',
            ),
            'utf8',
        );
        expect(source).toContain('isFirmCountMemberReadable');
        expect(source).not.toContain('firmPayoutCountResultOf');
    });
});
