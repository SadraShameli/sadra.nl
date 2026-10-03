import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    AccountStatus,
    AccountTracking,
    dailyCapacityUnitsOf,
    isActiveAccountRow,
} from '~/lib/prop-accounts/core';
import { isActiveAccount } from '~/lib/prop-accounts/metrics';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');

const GROUP_A = '30000000-0000-4000-8000-00000000000a';
const GROUP_B = '30000000-0000-4000-8000-00000000000b';

type CapacityRow = Parameters<typeof dailyCapacityUnitsOf>[0][number] & {
    readonly tracking: AccountTracking;
};

function row(overrides: Partial<CapacityRow> = {}): CapacityRow {
    return {
        archivedAt: null,
        copyGroupId: null,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

describe('dailyCapacityUnitsOf', () => {
    it('is zero for no accounts', () => {
        expect(dailyCapacityUnitsOf([])).toBe(0);
    });

    it('counts every active standalone account once', () => {
        expect(dailyCapacityUnitsOf([row(), row(), row()])).toBe(3);
    });

    it('counts a copy group once however many accounts it holds', () => {
        expect(
            dailyCapacityUnitsOf([
                row({ copyGroupId: GROUP_A }),
                row({ copyGroupId: GROUP_A }),
                row({ copyGroupId: GROUP_A }),
            ]),
        ).toBe(1);
    });

    it('counts two copy groups and a standalone account as three units', () => {
        expect(
            dailyCapacityUnitsOf([
                row({ copyGroupId: GROUP_A }),
                row({ copyGroupId: GROUP_A }),
                row({ copyGroupId: GROUP_B }),
                row(),
            ]),
        ).toBe(3);
    });

    it('counts an active ledger-only account because it still has to be managed', () => {
        expect(
            dailyCapacityUnitsOf([
                row(),
                row(),
                row({ tracking: AccountTracking.LedgerOnly }),
            ]),
        ).toBe(3);
    });

    it('leaves ended and archived accounts out', () => {
        const archivedAt = new Date('2026-09-01');
        const rows = [
            row(),
            row({ status: AccountStatus.Busted }),
            row({ status: AccountStatus.Closed }),
            row({ archivedAt }),
            row({ archivedAt, copyGroupId: GROUP_A }),
        ];
        expect(dailyCapacityUnitsOf(rows)).toBe(1);
    });

    it('does not count a copy group whose every account has ended', () => {
        const rows = [
            row({ copyGroupId: GROUP_A, status: AccountStatus.Busted }),
            row({ copyGroupId: GROUP_A, status: AccountStatus.Closed }),
        ];
        expect(dailyCapacityUnitsOf(rows)).toBe(0);
    });
});

describe('isActiveAccountRow', () => {
    const archivedAt = new Date('2026-09-01');

    it.each(Object.values(AccountStatus))(
        'counts a %s account only while it is not archived and active',
        (status) => {
            expect(isActiveAccountRow(row({ status }))).toBe(
                status === AccountStatus.Active,
            );
            expect(isActiveAccountRow(row({ archivedAt, status }))).toBe(false);
        },
    );

    it.each(Object.values(AccountStatus))(
        'agrees with the ledger predicate for a %s account',
        (status) => {
            for (const candidate of [
                row({ status }),
                row({ archivedAt, status }),
            ]) {
                expect(isActiveAccountRow(candidate)).toBe(
                    isActiveAccount(candidate),
                );
            }
        },
    );
});

describe('one capacity definition (PT-84, F-V27)', () => {
    it.each([
        'src/lib/prop-accounts/alerts/CapacityExceededRule.ts',
        'src/lib/prop-accounts/planning/NextSlotAllocation.ts',
    ])('%s counts its units through dailyCapacityUnitsOf', (file) => {
        const source = readFileSync(path.resolve(ROOT, file), 'utf8');
        expect(source).toContain('dailyCapacityUnitsOf(');
        expect(source).toContain('isActiveAccountRow(');
        expect(source).not.toContain('AccountStatus.Active');
        expect(source).not.toContain('copyGroups');
        expect(source).not.toMatch(/new Set<string>\(\)/u);
    });

    it('is defined in exactly one source file', () => {
        const files = [
            'src/lib/prop-accounts/core/DailyCapacityUnits.ts',
            'src/lib/prop-accounts/alerts/CapacityExceededRule.ts',
            'src/lib/prop-accounts/planning/NextSlotAllocation.ts',
        ];
        const definitions = files.filter((file) => {
            const source = readFileSync(path.resolve(ROOT, file), 'utf8');
            return source.includes('function dailyCapacityUnitsOf(');
        });
        expect(definitions).toEqual([
            'src/lib/prop-accounts/core/DailyCapacityUnits.ts',
        ]);
    });

    it('defines the active-row predicate once among the capacity files', () => {
        const files = [
            'src/lib/prop-accounts/core/DailyCapacityUnits.ts',
            'src/lib/prop-accounts/alerts/CapacityExceededRule.ts',
            'src/lib/prop-accounts/planning/NextSlotAllocation.ts',
        ];
        const definitions = files.filter((file) => {
            const source = readFileSync(path.resolve(ROOT, file), 'utf8');
            return source.includes('function isActiveAccountRow(');
        });
        expect(definitions).toEqual([
            'src/lib/prop-accounts/core/DailyCapacityUnits.ts',
        ]);
    });
});

describe('one active-account rule (PT-75b, F-V25)', () => {
    it('has a single body that tests status Active together with the archived date across the accounts code', () => {
        const sourceFiles = [
            'src/lib/prop-accounts',
            'src/app/(app)/prop-calculator',
            'src/server/api/routers/propAccounts',
        ].flatMap((folder) =>
            readdirSync(path.resolve(ROOT, folder), {
                recursive: true,
                withFileTypes: true,
            })
                .filter(
                    (entry) =>
                        entry.isFile() &&
                        (entry.name.endsWith('.ts') ||
                            entry.name.endsWith('.tsx')),
                )
                .map((entry) => path.join(entry.parentPath, entry.name)),
        );
        const bodies = sourceFiles
            .filter((file) =>
                /status\s*===\s*AccountStatus\.Active[\s\S]{0,40}archivedAt\s*===\s*null/u.test(
                    readFileSync(file, 'utf8'),
                ),
            )
            .map((file) => path.relative(ROOT, file).replaceAll('\\', '/'));
        expect(bodies).toEqual([
            'src/lib/prop-accounts/core/DailyCapacityUnits.ts',
        ]);
    });
});
