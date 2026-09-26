import { describe, expect, it } from 'vitest';

import {
    FirmKeyKind,
    UNLISTED_FIRM_LABEL,
    UpgradeChangeKind,
    upgradeChanges,
    upgradeChangeText,
} from '~/lib/prop-accounts';
import { findFirm, FirmId } from '~/lib/prop-calculator';

const OWN_FIRM = {
    id: '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6',
    name: 'Hola Prime',
};

function displayName(firmId: FirmId): string {
    const firm = findFirm(firmId);
    if (firm === undefined) throw new Error(`no firm ${firmId}`);
    return firm.displayName;
}

function listed(firmId: FirmId) {
    return { firmId, kind: FirmKeyKind.Modeled } as const;
}

function stored(accountSize: number, firmId: FirmId) {
    return { accountSize, externalFirmId: null, firmId } as const;
}

describe('upgradeChanges', () => {
    it('finds nothing to confirm when the plan keeps the stored size and listed firm', () => {
        expect(
            upgradeChanges(stored(50_000, FirmId.Mffu), {
                accountSize: 50_000,
                firmId: FirmId.Mffu,
            }),
        ).toEqual([]);
    });

    it('names a size change', () => {
        expect(
            upgradeChanges(stored(150_000, FirmId.Mffu), {
                accountSize: 50_000,
                firmId: FirmId.Mffu,
            }),
        ).toEqual([
            { from: 150_000, kind: UpgradeChangeKind.Size, to: 50_000 },
        ]);
    });

    it('names a move to another listed firm', () => {
        expect(
            upgradeChanges(stored(50_000, FirmId.Apex), {
                accountSize: 50_000,
                firmId: FirmId.Mffu,
            }),
        ).toEqual([
            {
                from: listed(FirmId.Apex),
                kind: UpgradeChangeKind.Firm,
                to: FirmId.Mffu,
            },
        ]);
    });

    it('names the size change before the firm move when both change', () => {
        expect(
            upgradeChanges(stored(123_457, FirmId.Apex), {
                accountSize: 50_000,
                firmId: FirmId.Mffu,
            }).map((change) => change.kind),
        ).toEqual([UpgradeChangeKind.Size, UpgradeChangeKind.Firm]);
    });

    it('names a move from one of your own firms to a listed firm, since every listed firm is a different firm', () => {
        expect(
            upgradeChanges(
                {
                    accountSize: 50_000,
                    externalFirmId: OWN_FIRM.id,
                    firmId: null,
                },
                { accountSize: 50_000, firmId: FirmId.Mffu },
            ),
        ).toEqual([
            {
                from: {
                    externalFirmId: OWN_FIRM.id,
                    kind: FirmKeyKind.External,
                },
                kind: UpgradeChangeKind.Firm,
                to: FirmId.Mffu,
            },
        ]);
    });
});

describe('upgradeChangeText', () => {
    it('words a size change in whole dollars', () => {
        expect(
            upgradeChangeText(
                { from: 150_000, kind: UpgradeChangeKind.Size, to: 50_000 },
                [],
            ),
        ).toBe('the account size from $150,000 to $50,000');
    });

    it('words a firm move with the firm display names', () => {
        expect(
            upgradeChangeText(
                {
                    from: listed(FirmId.Apex),
                    kind: UpgradeChangeKind.Firm,
                    to: FirmId.Mffu,
                },
                [],
            ),
        ).toBe(
            `the firm from ${displayName(FirmId.Apex)} to ${displayName(FirmId.Mffu)}`,
        );
    });

    it('names the firm of your own that the account moves away from', () => {
        expect(
            upgradeChangeText(
                {
                    from: {
                        externalFirmId: OWN_FIRM.id,
                        kind: FirmKeyKind.External,
                    },
                    kind: UpgradeChangeKind.Firm,
                    to: FirmId.Mffu,
                },
                [OWN_FIRM],
            ),
        ).toBe(`the firm from Hola Prime to ${displayName(FirmId.Mffu)}`);
    });

    it('still words a move from a firm of your own whose name is not loaded', () => {
        expect(
            upgradeChangeText(
                {
                    from: {
                        externalFirmId: OWN_FIRM.id,
                        kind: FirmKeyKind.External,
                    },
                    kind: UpgradeChangeKind.Firm,
                    to: FirmId.Mffu,
                },
                [],
            ),
        ).toBe(
            `the firm from ${UNLISTED_FIRM_LABEL} to ${displayName(FirmId.Mffu)}`,
        );
    });

    it('keeps an unknown stored firm id readable instead of failing', () => {
        expect(
            upgradeChangeText(
                {
                    from: { firmId: 'retired-firm', kind: FirmKeyKind.Modeled },
                    kind: UpgradeChangeKind.Firm,
                    to: FirmId.Mffu,
                },
                [],
            ),
        ).toBe(`the firm from retired-firm to ${displayName(FirmId.Mffu)}`);
    });

    it('words the largest ledger-only size without failing', () => {
        expect(
            upgradeChangeText(
                {
                    from: 2_147_483_647,
                    kind: UpgradeChangeKind.Size,
                    to: 50_000,
                },
                [],
            ),
        ).toBe('the account size from $2,147,483,647 to $50,000');
    });
});
