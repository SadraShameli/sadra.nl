'use client';

import { useMemo, useState } from 'react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { NOT_APPLICABLE } from '~/lib/format';
import { compareText } from '~/lib/prop-accounts';

import { type FirmReturnsCardModel } from './overviewModel';
import { SampleBadge } from './SampleBadge';

type FirmReturnRow = FirmReturnsCardModel['rows'][number];

type SortKey = keyof Pick<
    FirmReturnRow,
    | 'accounts'
    | 'attempts'
    | 'firm'
    | 'fundedAccounts'
    | 'multiple'
    | 'net'
    | 'payouts'
    | 'spend'
>;

const DEFAULT_SORT: SortKey = 'firm';

export function FirmReturnsCard({
    model,
}: {
    readonly model: FirmReturnsCardModel;
}) {
    const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT);
    const rows = useMemo(
        () => sortedRows(model.rows, sortKey),
        [model.rows, sortKey],
    );
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No firm with a fee or payout recorded yet.
            </p>
        );
    }
    const noted = rows.filter((row) => row.coverageNote !== null);
    return (
        <div className="flex flex-col gap-3">
            <Table>
                <TableHeader>
                    <TableRow>
                        <SortableHead
                            activeKey={sortKey}
                            onSort={setSortKey}
                            sortKey="firm"
                        >
                            Firm
                        </SortableHead>
                        <SortableHead
                            activeKey={sortKey}
                            align="right"
                            onSort={setSortKey}
                            sortKey="spend"
                        >
                            Spend
                        </SortableHead>
                        <SortableHead
                            activeKey={sortKey}
                            align="right"
                            onSort={setSortKey}
                            sortKey="payouts"
                        >
                            Payouts
                        </SortableHead>
                        <SortableHead
                            activeKey={sortKey}
                            align="right"
                            onSort={setSortKey}
                            sortKey="net"
                        >
                            Net
                        </SortableHead>
                        <SortableHead
                            activeKey={sortKey}
                            align="right"
                            onSort={setSortKey}
                            sortKey="multiple"
                        >
                            Multiple
                        </SortableHead>
                        <SortableHead
                            activeKey={sortKey}
                            align="right"
                            onSort={setSortKey}
                            sortKey="attempts"
                        >
                            Attempts
                        </SortableHead>
                        <SortableHead
                            activeKey={sortKey}
                            align="right"
                            onSort={setSortKey}
                            sortKey="fundedAccounts"
                        >
                            Funded
                        </SortableHead>
                        <TableHead className="text-right">
                            Accounts with a payout
                        </TableHead>
                        <TableHead>First payout</TableHead>
                        <TableHead>Last payout</TableHead>
                        <TableHead>Noise verdict</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell>{row.firm}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.spend}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.payouts}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.net}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.multiple}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                <span className="inline-flex items-center gap-1.5">
                                    {row.attempts}
                                    <SampleBadge
                                        level={row.attemptsSampleLevel}
                                    />
                                </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                <span className="inline-flex items-center gap-1.5">
                                    {row.fundedAccounts}
                                    <SampleBadge
                                        level={row.fundedSampleLevel}
                                    />
                                </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.accountsWithPayout}
                            </TableCell>
                            <TableCell className="tabular-nums">
                                {row.firstPayoutOn}
                            </TableCell>
                            <TableCell className="tabular-nums">
                                {row.lastPayoutOn}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {row.verdict}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
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
        </div>
    );
}

function numericValue(row: FirmReturnRow, key: SortKey): number {
    const value = row[key];
    if (value === NOT_APPLICABLE) return -Infinity;
    const parsed = Number(value.replaceAll(/[^0-9.-]/gu, ''));
    return Number.isNaN(parsed) ? -Infinity : parsed;
}

function SortableHead({
    activeKey,
    align,
    children,
    onSort,
    sortKey,
}: {
    readonly activeKey: SortKey;
    readonly align?: 'right';
    readonly children: string;
    readonly onSort: (key: SortKey) => void;
    readonly sortKey: SortKey;
}) {
    return (
        <TableHead className={align === 'right' ? 'text-right' : undefined}>
            <button
                aria-pressed={activeKey === sortKey}
                className="font-medium hover:underline"
                onClick={() => {
                    onSort(sortKey);
                }}
                type="button"
            >
                {children}
            </button>
        </TableHead>
    );
}

function sortedRows(
    rows: FirmReturnsCardModel['rows'],
    sortKey: SortKey,
): FirmReturnsCardModel['rows'] {
    return sortKey === 'firm'
        ? rows.toSorted((a, b) => compareText(a.firm, b.firm))
        : rows.toSorted(
              (a, b) => numericValue(b, sortKey) - numericValue(a, sortKey),
          );
}
