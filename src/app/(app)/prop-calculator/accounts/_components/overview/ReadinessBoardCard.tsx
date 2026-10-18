import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { formatDisplayDate } from '~/lib/format';

import { type ReadinessBoardCardModel } from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum ReadinessBoardCardColumn {
    Account = 'account',
    AsOf = 'as-of',
    NetAfterSplit = 'net-after-split',
    RuleCappedWithdrawableAtTheRequest = 'rule-capped-withdrawable-at-the-request',
    Status = 'status',
    WhatUnlocksIt = 'what-unlocks-it',
}

export const ReadinessBoardCard = memo(function ReadinessBoardCard({
    model,
}: {
    readonly model: ReadinessBoardCardModel;
}) {
    return (
        <OverviewPanel
            info={model.disclosure}
            section={OverviewSectionId.ReadinessBoard}
        >
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No funded account has a usable balance snapshot yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.account}</>,
                            header: 'Account',
                            id: ReadinessBoardCardColumn.Account,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => <>{row.original.status}</>,
                            header: 'Status',
                            id: ReadinessBoardCardColumn.Status,
                        },
                        {
                            cell: ({ row }) => <>{row.original.requested}</>,
                            header: 'Rule-capped withdrawable at the request',
                            id: ReadinessBoardCardColumn.RuleCappedWithdrawableAtTheRequest,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.netAfterSplit}</>
                            ),
                            header: 'Net after split',
                            id: ReadinessBoardCardColumn.NetAfterSplit,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>
                                    {row.original.unlock}
                                    {row.original.note !== null && (
                                        <span className="block text-xs text-muted-foreground">
                                            {row.original.note}
                                        </span>
                                    )}
                                </>
                            ),
                            header: 'What unlocks it',
                            id: ReadinessBoardCardColumn.WhatUnlocksIt,
                        },
                        {
                            cell: ({ row }) => (
                                <>{formatDisplayDate(row.original.asOf)}</>
                            ),
                            header: 'As of',
                            id: ReadinessBoardCardColumn.AsOf,
                        },
                    ]}
                    data={[...model.rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.notFundedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                    {model.notFundedCount === 1
                        ? '1 account is not funded, so it has no payout readiness.'
                        : `${String(model.notFundedCount)} accounts are not funded, so they have no payout readiness.`}
                </p>
            )}
            {model.unavailable.length > 0 && (
                <ul
                    aria-label="Accounts without a payout readiness"
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground"
                >
                    {model.unavailable.map((row) => (
                        <li key={row.key}>
                            {row.account}: {row.reason}
                        </li>
                    ))}
                </ul>
            )}
        </OverviewPanel>
    );
});
