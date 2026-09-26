import { describe, expect, it } from 'vitest';

import { SnapshotSource } from '~/lib/prop-accounts';
import {
    csvCommitPayload,
    CsvFailureKind,
    CsvIssueKind,
    csvIssues,
    CsvTableKind,
    previewSnapshotCsv,
    REQUIRED_SNAPSHOT_CSV_COLUMNS,
    type SnapshotCsvAccount,
    SnapshotCsvColumn,
    type SnapshotCsvStored,
} from '~/lib/prop-accounts/csv';

const ALPHA_ID = '11111111-1111-4111-8111-111111111111';
const BRAVO_ID = '22222222-2222-4222-8222-222222222222';
const OLD_ID = '33333333-3333-4333-8333-333333333333';

const ACCOUNTS: readonly SnapshotCsvAccount[] = [
    { archivedAt: null, id: ALPHA_ID, label: 'Alpha' },
    { archivedAt: null, id: BRAVO_ID, label: 'Bravo' },
    { archivedAt: new Date('2026-01-01'), id: OLD_ID, label: 'Retired' },
];

const NO_STORED_SNAPSHOTS: readonly SnapshotCsvStored[] = [];

describe('previewSnapshotCsv', () => {
    it('resolves the account label and reads every money column as exact cents', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance,highestEodBalance,highestIntradayBalance,dashboardFloor,payoutsTaken,tradingDays,qualifyingDaysSinceLastPayout,balanceAtLastPayout,floorAtLastPayout,lastPayoutOn,cycleBestDayProfit,evalBestDayProfit,cumulativePayout,lastTradedOn',
                'Alpha,2026-09-25,52340.12,52500,52610.5,50100,2,14,3,51800,50100,2026-09-15,420.25,0,1350.75,2026-09-25',
            ].join('\r\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([]);
        expect(csvCommitPayload(preview)).toEqual([
            {
                accountId: ALPHA_ID,
                asOf: '2026-09-25',
                balanceAtLastPayoutCents: 5_180_000,
                balanceCents: 5_234_012,
                cumulativePayoutCents: 135_075,
                cycleBestDayProfitCents: 42_025,
                dashboardFloorCents: 5_010_000,
                evalBestDayProfitCents: 0,
                floorAtLastPayoutCents: 5_010_000,
                highestEodBalanceCents: 5_250_000,
                highestIntradayBalanceCents: 5_261_050,
                lastPayoutOn: '2026-09-15',
                lastTradedOn: '2026-09-25',
                payoutsTaken: 2,
                qualifyingDaysSinceLastPayout: 3,
                source: SnapshotSource.Import,
                tradingDays: 14,
            },
        ]);
    });

    it('leaves optional columns null when absent or empty', () => {
        const preview = previewSnapshotCsv(
            'account,asOf,balance,tradingDays\nBravo,2026-09-25,49000,',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvCommitPayload(preview)).toEqual([
            expect.objectContaining({
                accountId: BRAVO_ID,
                balanceCents: 4_900_000,
                highestEodBalanceCents: null,
                payoutsTaken: null,
                tradingDays: null,
            }),
        ]);
    });

    it('flags an unknown label and a label that only matches an archived account', () => {
        const preview = previewSnapshotCsv(
            'account,asOf,balance\nGhost,2026-09-25,1\nRetired,2026-09-25,1\nalpha,2026-09-25,1',
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([
            {
                column: SnapshotCsvColumn.Account,
                kind: CsvIssueKind.Cell,
                message: 'no active account is labeled "Ghost"',
                rowNumber: 2,
            },
            {
                column: SnapshotCsvColumn.Account,
                kind: CsvIssueKind.Cell,
                message: 'no active account is labeled "Retired"',
                rowNumber: 3,
            },
            {
                column: SnapshotCsvColumn.Account,
                kind: CsvIssueKind.Cell,
                message: 'no active account is labeled "alpha"',
                rowNumber: 4,
            },
        ]);
    });

    it('reports schema errors per row with the row number and the column', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance,payoutsTaken,cumulativePayout,tradingDays',
                'Alpha,2026-09-25,50000,1001,,1',
                'Bravo,2026-09-25,50000,1,-5,1',
                'Alpha,1999-12-31,50000,1,,1',
            ].join('\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(
            csvIssues(preview).map((issue) => [
                issue.rowNumber,
                issue.column,
                issue.kind,
            ]),
        ).toEqual([
            [2, SnapshotCsvColumn.PayoutsTaken, CsvIssueKind.Schema],
            [3, SnapshotCsvColumn.CumulativePayout, CsvIssueKind.Schema],
            [4, SnapshotCsvColumn.AsOf, CsvIssueKind.Cell],
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('rejects two rows for one account and date as a batch issue on the later row', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance',
                'Alpha,2026-09-25,50000',
                'Bravo,2026-09-25,50000',
                'Alpha,2026-09-24,50000',
                'Alpha,2026-09-25,50100',
            ].join('\n'),
            ACCOUNTS,
            NO_STORED_SNAPSHOTS,
        );

        expect(csvIssues(preview)).toEqual([
            {
                column: SnapshotCsvColumn.AsOf,
                kind: CsvIssueKind.Batch,
                message:
                    'one batch holds only one snapshot per account and date',
                rowNumber: 5,
            },
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('rejects a row whose account and date already have a stored snapshot as a batch issue', () => {
        const preview = previewSnapshotCsv(
            [
                'account,asOf,balance',
                'Alpha,2026-09-25,50000',
                'Alpha,2026-09-24,50000',
                'Bravo,2026-09-25,50000',
            ].join('\n'),
            ACCOUNTS,
            [
                { accountId: ALPHA_ID, asOf: '2026-09-25' },
                { accountId: OLD_ID, asOf: '2026-09-25' },
            ],
        );

        expect(csvIssues(preview)).toEqual([
            {
                column: SnapshotCsvColumn.AsOf,
                kind: CsvIssueKind.Batch,
                message:
                    'a snapshot for this account and date is already stored; remove it first or use another date',
                rowNumber: 2,
            },
        ]);
        expect(csvCommitPayload(preview)).toBeNull();
    });

    it('needs the account, date and balance columns and fails over 200 rows', () => {
        expect(REQUIRED_SNAPSHOT_CSV_COLUMNS).toEqual([
            SnapshotCsvColumn.Account,
            SnapshotCsvColumn.AsOf,
            SnapshotCsvColumn.Balance,
        ]);
        expect(
            previewSnapshotCsv(
                'account,balance\nAlpha,1',
                ACCOUNTS,
                NO_STORED_SNAPSHOTS,
            ),
        ).toEqual({
            failure: {
                columns: [SnapshotCsvColumn.AsOf],
                kind: CsvFailureKind.MissingColumns,
            },
            kind: CsvTableKind.Failed,
        });
        const rows = Array.from(
            { length: 201 },
            (_, index) =>
                `Alpha,2026-0${1 + Math.floor(index / 28)}-${String(1 + (index % 28)).padStart(2, '0')},1`,
        );
        expect(
            previewSnapshotCsv(
                ['account,asOf,balance', ...rows].join('\n'),
                ACCOUNTS,
                NO_STORED_SNAPSHOTS,
            ),
        ).toEqual({
            failure: {
                actual: 201,
                kind: CsvFailureKind.TooManyRows,
                limit: 200,
            },
            kind: CsvTableKind.Failed,
        });
        const atLimit = ['account,asOf,balance', ...rows.slice(0, 200)].join(
            '\n',
        );
        expect(
            csvCommitPayload(
                previewSnapshotCsv(atLimit, ACCOUNTS, NO_STORED_SNAPSHOTS),
            ),
        ).toHaveLength(200);
    });
});
