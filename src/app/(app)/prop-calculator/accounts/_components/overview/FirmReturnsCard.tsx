'use client';

import { Building2 } from 'lucide-react';
import { memo } from 'react';

import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { NOT_APPLICABLE } from '~/lib/format';
import { compareText } from '~/lib/prop-accounts';

import { type FirmReturnsCardModel } from './overviewModel';
import { OverviewEmptyPanel, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';
import { SampleBadge } from './SampleBadge';

enum FirmReturnsColumn {
    AccountsWithPayout = 'accounts-with-payout',
    Attempts = 'attempts',
    Firm = 'firm',
    FirstPayout = 'first-payout',
    Funded = 'funded',
    LastPayout = 'last-payout',
    Multiple = 'multiple',
    Net = 'net',
    Payouts = 'payouts',
    Spend = 'spend',
    Verdict = 'verdict',
}

type FirmReturnRow = FirmReturnsCardModel['rows'][number];

type NumericKey = keyof Pick<
    FirmReturnRow,
    | 'accounts'
    | 'attempts'
    | 'fundedAccounts'
    | 'multiple'
    | 'net'
    | 'payouts'
    | 'spend'
>;

function badgedColumn(
    id: FirmReturnsColumn,
    header: string,
    key: 'attempts' | 'fundedAccounts',
    level: (row: FirmReturnRow) => FirmReturnRow['attemptsSampleLevel'],
): DataTableColumn<FirmReturnRow> {
    return {
        ...numericColumn(id, header, key),
        cell: ({ row: { original: row } }) => (
            <span className="inline-flex items-center gap-1.5">
                {row[key]}
                <SampleBadge level={level(row)} />
            </span>
        ),
    };
}

function numericColumn(
    id: FirmReturnsColumn,
    header: string,
    key: NumericKey,
): DataTableColumn<FirmReturnRow> {
    return {
        accessorFn: (row) => numericValue(row, key),
        cell: ({ row: { original: row } }) => <FigureText text={row[key]} />,
        header,
        id,
        meta: { align: DataTableAlign.End },
    };
}

const FIRM_RETURNS_COLUMNS: DataTableColumn<FirmReturnRow>[] = [
    {
        accessorFn: (row) => row.firm,
        header: 'Firm',
        id: FirmReturnsColumn.Firm,
        meta: { isRowHeader: true },
        sortFn: (a, b) => compareText(a.original.firm, b.original.firm),
    },
    numericColumn(FirmReturnsColumn.Spend, 'Spend', 'spend'),
    numericColumn(FirmReturnsColumn.Payouts, 'Payouts', 'payouts'),
    numericColumn(FirmReturnsColumn.Net, 'Net', 'net'),
    numericColumn(FirmReturnsColumn.Multiple, 'Multiple', 'multiple'),
    badgedColumn(
        FirmReturnsColumn.Attempts,
        'Attempts',
        'attempts',
        (row) => row.attemptsSampleLevel,
    ),
    badgedColumn(
        FirmReturnsColumn.Funded,
        'Funded',
        'fundedAccounts',
        (row) => row.fundedSampleLevel,
    ),
    {
        cell: ({ row: { original: row } }) => row.accountsWithPayout,
        enableSorting: false,
        header: 'Accounts with a payout',
        id: FirmReturnsColumn.AccountsWithPayout,
        meta: { align: DataTableAlign.End },
    },
    {
        cell: ({ row: { original: row } }) => (
            <FigureText className="tabular-nums" text={row.firstPayoutOn} />
        ),
        enableSorting: false,
        header: 'First payout',
        id: FirmReturnsColumn.FirstPayout,
    },
    {
        cell: ({ row: { original: row } }) => (
            <FigureText className="tabular-nums" text={row.lastPayoutOn} />
        ),
        enableSorting: false,
        header: 'Last payout',
        id: FirmReturnsColumn.LastPayout,
    },
    {
        cell: ({ row: { original: row } }) => (
            <span className="text-muted-foreground">{row.verdict}</span>
        ),
        enableSorting: false,
        header: 'Noise verdict',
        id: FirmReturnsColumn.Verdict,
    },
];

export const FirmReturnsCard = memo(function FirmReturnsCard({
    model,
}: {
    readonly model: FirmReturnsCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <OverviewEmptyPanel
                icon={Building2}
                section={OverviewSectionId.FirmReturns}
                title="No firm with a fee or payout recorded yet"
            />
        );
    }
    const noted = model.rows.filter((row) => row.coverageNote !== null);
    return (
        <OverviewPanel section={OverviewSectionId.FirmReturns}>
            <DataTable
                columns={FIRM_RETURNS_COLUMNS}
                data={[...model.rows]}
                initialSorting={[{ desc: false, id: FirmReturnsColumn.Firm }]}
                pageSize={null}
                rowId={(row) => row.key}
            />
            {noted.length > 0 && (
                <ul
                    aria-label="Firm coverage"
                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                >
                    {noted.map((row) => (
                        <li key={row.key}>
                            {row.firm}: {row.coverageNote}
                        </li>
                    ))}
                </ul>
            )}
        </OverviewPanel>
    );
});

function numericValue(row: FirmReturnRow, key: NumericKey): number {
    const value = row[key];
    if (value === NOT_APPLICABLE) return -Infinity;
    const parsed = Number(value.replaceAll(/[^0-9.-]/gu, ''));
    return Number.isNaN(parsed) ? -Infinity : parsed;
}
