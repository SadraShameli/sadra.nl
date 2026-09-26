import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AccountTracking,
    type FirmKey,
    firmKeyId,
    FirmKeyKind,
    firmKeyLabel,
    firmKeyOf,
    type StoredFirmId,
    trackedAccountOf,
} from '~/lib/prop-accounts';
import { findFirm, FirmId } from '~/lib/prop-calculator';

const EXTERNAL_FIRM_ID = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';
const OTHER_EXTERNAL_FIRM_ID = '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6';

const EXTERNAL_FIRMS = [
    { id: EXTERNAL_FIRM_ID, name: 'Hola Prime' },
    { id: OTHER_EXTERNAL_FIRM_ID, name: 'Funded Seat' },
] as const;

function ledgerOnlyAt(
    firm:
        | { externalFirmId: null; firmId: StoredFirmId }
        | {
              externalFirmId: string;
              firmId: null;
          },
) {
    return trackedAccountOf({
        ...firm,
        id: 'account-1',
        planLabel: '100K',
        planSerial: null,
        tracking: AccountTracking.LedgerOnly,
    });
}

describe('FirmKey', () => {
    it('is a modeled firm id or an external firm id, never both', () => {
        expectTypeOf<FirmKey>().toEqualTypeOf<
            | {
                  readonly externalFirmId: string;
                  readonly kind: FirmKeyKind.External;
              }
            | {
                  readonly firmId: StoredFirmId;
                  readonly kind: FirmKeyKind.Modeled;
              }
        >();
    });

    it('keys a modeled account by its firm id', () => {
        const modeled = trackedAccountOf({
            externalFirmId: null,
            firmId: FirmId.Lucid,
            id: 'account-1',
            planLabel: null,
            planSerial: 'lucid-flex-50000',
            tracking: AccountTracking.Modeled,
        });
        expect(firmKeyOf(modeled)).toEqual({
            firmId: FirmId.Lucid,
            kind: FirmKeyKind.Modeled,
        });
    });

    it('keys a ledger-only account at a modeled firm by that firm id', () => {
        expect(
            firmKeyOf(
                ledgerOnlyAt({ externalFirmId: null, firmId: FirmId.Lucid }),
            ),
        ).toEqual({ firmId: FirmId.Lucid, kind: FirmKeyKind.Modeled });
    });

    it('keys a ledger-only account at an external firm by the external firm id', () => {
        expect(
            firmKeyOf(
                ledgerOnlyAt({
                    externalFirmId: EXTERNAL_FIRM_ID,
                    firmId: null,
                }),
            ),
        ).toEqual({
            externalFirmId: EXTERNAL_FIRM_ID,
            kind: FirmKeyKind.External,
        });
    });

    it('gives a stable in-memory map key that never collides across kinds', () => {
        const modeled: FirmKey = {
            firmId: EXTERNAL_FIRM_ID,
            kind: FirmKeyKind.Modeled,
        };
        const external: FirmKey = {
            externalFirmId: EXTERNAL_FIRM_ID,
            kind: FirmKeyKind.External,
        };
        expect(firmKeyId(modeled)).not.toBe(firmKeyId(external));
        expect(firmKeyId(external)).toBe(
            firmKeyId({
                externalFirmId: EXTERNAL_FIRM_ID,
                kind: FirmKeyKind.External,
            }),
        );
        expect(
            firmKeyId({ firmId: FirmId.Mffu, kind: FirmKeyKind.Modeled }),
        ).toBe(firmKeyId({ firmId: FirmId.Mffu, kind: FirmKeyKind.Modeled }));
    });

    it('labels a modeled firm with its display name and an external firm with its name', () => {
        expect(
            firmKeyLabel(
                { firmId: FirmId.Mffu, kind: FirmKeyKind.Modeled },
                EXTERNAL_FIRMS,
            ),
        ).toBe(findFirm(FirmId.Mffu)?.displayName);
        expect(
            firmKeyLabel(
                {
                    externalFirmId: OTHER_EXTERNAL_FIRM_ID,
                    kind: FirmKeyKind.External,
                },
                EXTERNAL_FIRMS,
            ),
        ).toBe('Funded Seat');
    });

    it('labels a removed modeled firm by its stored id and an unknown external firm plainly', () => {
        expect(
            firmKeyLabel(
                { firmId: 'gone-firm', kind: FirmKeyKind.Modeled },
                EXTERNAL_FIRMS,
            ),
        ).toBe('gone-firm');
        expect(
            firmKeyLabel(
                { externalFirmId: 'missing', kind: FirmKeyKind.External },
                [],
            ),
        ).toBe('Unlisted firm');
    });
});
