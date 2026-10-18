import { describe, expect, it } from 'vitest';

import {
    type FirmCountMember,
    FirmCountUnknownReason,
    FirmPayoutCountResultKind,
    firmPayoutCountResultOf,
} from '~/lib/prop-accounts/advice';
import {
    AccountEventKind,
    AccountTracking,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import { FirmId } from '~/lib/prop-calculator';

const ASOF = '2026-09-27';

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

function requestedPayout(requestedOn: string, paidOn: null | string = null) {
    return {
        grossCents: usdCents(100_000),
        netCents: null,
        paidOn,
        requestedOn,
        status: PayoutStatus.Requested,
    };
}

describe('one membership and validity rule for the firm payout count (PT-36n, F-145)', () => {
    it('counts the readable members of the firm as a known count', () => {
        const result = firmPayoutCountResultOf(
            FirmId.Mffu,
            [
                memberOf({ payouts: [requestedPayout('2026-09-20')] }),
                memberOf({ payouts: [requestedPayout('2026-09-21')] }),
            ],
            ASOF,
        );
        expect(result).toMatchObject({
            count: {
                asOf: ASOF,
                firmId: FirmId.Mffu,
                requestedPayoutsSinceLastLiveAccount: 2,
            },
            kind: FirmPayoutCountResultKind.Known,
        });
    });

    it('is unknown while a member of the firm cannot be read', () => {
        const unreadable = memberOf({
            account: {
                externalFirmId: null,
                firmId: FirmId.Mffu,
                id: 'broken',
                planLabel: null,
                planSerial: null,
                tracking: AccountTracking.Modeled,
            },
        });
        expect(
            firmPayoutCountResultOf(
                FirmId.Mffu,
                [memberOf(), unreadable],
                ASOF,
            ),
        ).toEqual({
            kind: FirmPayoutCountResultKind.Unknown,
            reason: FirmCountUnknownReason.UnreadableAccount,
        });
    });

    it('ignores an unreadable account that belongs to no firm or to another firm', () => {
        const noFirm = memberOf({
            account: {
                externalFirmId: null,
                firmId: null,
                id: 'no-firm',
                planLabel: null,
                planSerial: null,
                tracking: AccountTracking.Modeled,
            },
        });
        const otherFirm = memberOf({
            account: {
                externalFirmId: null,
                firmId: FirmId.TopStep,
                id: 'other',
                planLabel: null,
                planSerial: null,
                tracking: AccountTracking.Modeled,
            },
        });
        expect(
            firmPayoutCountResultOf(
                FirmId.Mffu,
                [memberOf(), noFirm, otherFirm],
                ASOF,
            ).kind,
        ).toBe(FirmPayoutCountResultKind.Known);
    });

    it.each([
        ['requested date', requestedPayout('not a date')],
        ['paid date', requestedPayout('2026-09-20', 'also not a date')],
    ])('is unknown while a payout has a malformed %s', (_label, payout) => {
        expect(
            firmPayoutCountResultOf(
                FirmId.Mffu,
                [memberOf({ payouts: [payout] })],
                ASOF,
            ),
        ).toEqual({
            kind: FirmPayoutCountResultKind.Unknown,
            reason: FirmCountUnknownReason.InvalidDate,
        });
    });

    it('is unknown while a paid payout has no paid date', () => {
        const undatedPaid = {
            ...requestedPayout('2026-09-20'),
            status: PayoutStatus.Paid,
        };
        expect(
            firmPayoutCountResultOf(
                FirmId.Mffu,
                [memberOf({ payouts: [undatedPaid] })],
                ASOF,
            ),
        ).toEqual({
            kind: FirmPayoutCountResultKind.Unknown,
            reason: FirmCountUnknownReason.InvalidDate,
        });
    });

    it.each([PayoutStatus.Denied, PayoutStatus.Cancelled])(
        'does not count a %s payout as requested at an earlier date because no closing date is stored',
        (status) => {
            const result = firmPayoutCountResultOf(
                FirmId.Mffu,
                [
                    memberOf({
                        payouts: [{ ...requestedPayout('2026-09-10'), status }],
                    }),
                ],
                '2026-09-15',
            );
            expect(result).toMatchObject({
                count: { requestedPayoutsSinceLastLiveAccount: 0 },
                kind: FirmPayoutCountResultKind.Known,
            });
        },
    );

    it('is unknown while a live move has a malformed date', () => {
        expect(
            firmPayoutCountResultOf(
                FirmId.Mffu,
                [
                    memberOf({
                        events: [
                            {
                                kind: AccountEventKind.MovedLive,
                                occurredOn: 'soon',
                            },
                        ],
                    }),
                ],
                ASOF,
            ),
        ).toEqual({
            kind: FirmPayoutCountResultKind.Unknown,
            reason: FirmCountUnknownReason.InvalidDate,
        });
    });

    it('does not read the dates of a member at another firm', () => {
        const otherFirm = memberOf({
            account: {
                externalFirmId: null,
                firmId: FirmId.TopStep,
                id: 'other',
                planLabel: null,
                planSerial: 'topstep-50000',
                tracking: AccountTracking.Modeled,
            },
            payouts: [requestedPayout('not a date')],
        });
        expect(
            firmPayoutCountResultOf(FirmId.Mffu, [memberOf(), otherFirm], ASOF)
                .kind,
        ).toBe(FirmPayoutCountResultKind.Known);
    });
});
