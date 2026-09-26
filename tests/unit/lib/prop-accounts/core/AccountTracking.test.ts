import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type AccountRow,
    AccountRowShapeError,
    AccountTracking,
    type LedgerOnlyAccountRow,
    type ModeledAccountRow,
    PlanKeyResolutionKind,
    resolvePlanKey,
    type StoredFirmId,
    trackedAccountOf,
    type TrackedAccountRow,
} from '~/lib/prop-accounts';
import { FirmId, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import { type PropAccountRow } from '~/server/db/schemas/prop';

const EXTERNAL_FIRM_ID = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';

type ShapeColumns = Pick<
    AccountRow,
    'externalFirmId' | 'firmId' | 'id' | 'planLabel' | 'planSerial' | 'tracking'
>;

function row(overrides: Partial<ShapeColumns> = {}): ShapeColumns {
    return {
        externalFirmId: null,
        firmId: FirmId.Mffu,
        id: 'account-1',
        planLabel: null,
        planSerial: 'mffu-rapid-50000',
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

describe('AccountTracking', () => {
    it('derives every tracked row type from the table row type', () => {
        expectTypeOf<AccountRow>().toEqualTypeOf<PropAccountRow>();
        expectTypeOf<AccountRow['tracking']>().toEqualTypeOf<AccountTracking>();
        expectTypeOf<
            AccountRow['firmId']
        >().toEqualTypeOf<null | StoredFirmId>();
        expectTypeOf<AccountRow['planSerial']>().toEqualTypeOf<null | string>();
        expectTypeOf<AccountRow['planLabel']>().toEqualTypeOf<null | string>();
        expectTypeOf<AccountRow['externalFirmId']>().toEqualTypeOf<
            null | string
        >();
        expectTypeOf<ModeledAccountRow>().toExtend<AccountRow>();
        expectTypeOf<LedgerOnlyAccountRow>().toExtend<AccountRow>();
        expectTypeOf<TrackedAccountRow>().toEqualTypeOf<
            LedgerOnlyAccountRow | ModeledAccountRow
        >();
    });

    it('narrows a modeled row to a non-null firm and plan serial', () => {
        const tracked = trackedAccountOf(row());
        expect(tracked.tracking).toBe(AccountTracking.Modeled);
        if (tracked.tracking !== AccountTracking.Modeled) {
            throw new Error('expected a modeled row');
        }
        expectTypeOf(tracked.firmId).toEqualTypeOf<StoredFirmId>();
        expectTypeOf(tracked.planSerial).toEqualTypeOf<string>();
        expectTypeOf(tracked.planLabel).toEqualTypeOf<null>();
        expectTypeOf(tracked.externalFirmId).toEqualTypeOf<null>();
        expect(tracked.planSerial).toBe('mffu-rapid-50000');
    });

    it('narrows a ledger-only row at a modeled firm to a plan label and no plan serial', () => {
        const tracked = trackedAccountOf(
            row({
                planLabel: 'Rapid 150K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            }),
        );
        if (tracked.tracking !== AccountTracking.LedgerOnly) {
            throw new Error('expected a ledger-only row');
        }
        expectTypeOf(tracked.planSerial).toEqualTypeOf<null>();
        expectTypeOf(tracked.planLabel).toEqualTypeOf<string>();
        expect(tracked.planLabel).toBe('Rapid 150K');
        expect(tracked.firmId).toBe(FirmId.Mffu);
    });

    it('narrows a ledger-only row at an external firm', () => {
        const tracked = trackedAccountOf(
            row({
                externalFirmId: EXTERNAL_FIRM_ID,
                firmId: null,
                planLabel: 'Hola Prime 100K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            }),
        );
        expect(tracked).toMatchObject({
            externalFirmId: EXTERNAL_FIRM_ID,
            firmId: null,
            tracking: AccountTracking.LedgerOnly,
        });
    });

    it.each([
        ['a modeled row without a firm', { firmId: null }],
        ['a modeled row without a plan serial', { planSerial: null }],
        ['a modeled row with a plan label', { planLabel: 'Rapid 50K' }],
        [
            'a modeled row with an external firm',
            { externalFirmId: EXTERNAL_FIRM_ID },
        ],
        [
            'a ledger-only row with a plan serial',
            {
                planLabel: 'Rapid 150K',
                tracking: AccountTracking.LedgerOnly,
            },
        ],
        [
            'a ledger-only row without a plan label',
            { planSerial: null, tracking: AccountTracking.LedgerOnly },
        ],
        [
            'a ledger-only row with both firm columns',
            {
                externalFirmId: EXTERNAL_FIRM_ID,
                planLabel: 'Rapid 150K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            },
        ],
        [
            'a ledger-only row with no firm column',
            {
                firmId: null,
                planLabel: 'Rapid 150K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            },
        ],
        [
            'a row with an unknown tracking value',
            { tracking: 'guessed' as AccountTracking },
        ],
    ] as const)('throws a typed shape error on %s', (_name, overrides) => {
        const broken = row(overrides);
        expect(() => trackedAccountOf(broken)).toThrow(AccountRowShapeError);
        expect(() => trackedAccountOf(broken)).toThrow(/account-1/);
    });

    it('resolves a ledger-only row to LedgerOnly, never to an unresolved plan', () => {
        const tracked = trackedAccountOf({
            ...row({
                planLabel: 'Rapid 150K',
                planSerial: null,
                tracking: AccountTracking.LedgerOnly,
            }),
            accountSize: 150_000,
            optIns: NO_PLAN_OPT_INS,
            readIssues: [],
        });
        expect(resolvePlanKey(tracked)).toEqual({
            kind: PlanKeyResolutionKind.LedgerOnly,
        });
    });
});
