import { HandCoins } from 'lucide-react';
import { memo } from 'react';

import { EnterBalancesButton } from '~/app/(app)/prop-calculator/accounts/_components/EnterBalancesButton';
import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { sentenceOf } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { formatDisplayDate, NOT_APPLICABLE } from '~/lib/format';

import { type ReadinessBoardCardModel } from './overviewModel';
import { OverviewEmptyPanel, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum ReadinessBoardCardColumn {
    Account = 'account',
    AsOf = 'as-of',
    NetAfterSplit = 'net-after-split',
    RuleCappedWithdrawableAtTheRequest = 'rule-capped-withdrawable-at-the-request',
    Status = 'status',
    WhatUnlocksIt = 'what-unlocks-it',
}

interface ReadinessDisplayRow extends ReadinessRow {
    readonly reason: null | string;
}

type ReadinessRow = ReadinessBoardCardModel['rows'][number];

export const ReadinessBoardCard = memo(function ReadinessBoardCard({
    model,
}: {
    readonly model: ReadinessBoardCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <OverviewEmptyPanel
                action={
                    model.unavailable.length > 0 ? (
                        <EnterBalancesButton />
                    ) : undefined
                }
                description={notFundedText(model.notFundedCount)}
                icon={HandCoins}
                section={OverviewSectionId.ReadinessBoard}
                title={
                    model.unavailable.length > 0
                        ? 'Enter balances to see payout readiness'
                        : 'No funded account to check yet'
                }
            />
        );
    }
    const rows: readonly ReadinessDisplayRow[] = [
        ...model.rows.map((row) => ({ ...row, reason: null })),
        ...model.unavailable.map((row) => ({
            account: row.account,
            asOf: '',
            key: row.key,
            netAfterSplit: NOT_APPLICABLE,
            note: null,
            reason: sentenceOf(row.reason),
            requested: NOT_APPLICABLE,
            status: NOT_APPLICABLE,
            unlock: NOT_APPLICABLE,
        })),
    ];
    const notFunded = notFundedText(model.notFundedCount);
    return (
        <OverviewPanel
            info={
                notFunded === undefined ? (
                    model.disclosure
                ) : (
                    <>
                        <p>{model.disclosure}</p>
                        <p>{notFunded}</p>
                    </>
                )
            }
            section={OverviewSectionId.ReadinessBoard}
        >
            <DataTable
                columns={[
                    {
                        cell: ({ row }) => <>{row.original.account}</>,
                        header: 'Account',
                        id: ReadinessBoardCardColumn.Account,
                        meta: { isRowHeader: true },
                    },
                    {
                        cell: ({ row }) => (
                            <FigureText
                                reason={row.original.reason ?? undefined}
                                text={row.original.status}
                            />
                        ),
                        header: 'Status',
                        id: ReadinessBoardCardColumn.Status,
                    },
                    {
                        cell: ({ row }) => (
                            <FigureText text={row.original.requested} />
                        ),
                        header: 'Rule-capped withdrawable at the request',
                        id: ReadinessBoardCardColumn.RuleCappedWithdrawableAtTheRequest,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <FigureText text={row.original.netAfterSplit} />
                        ),
                        header: 'Net after split',
                        id: ReadinessBoardCardColumn.NetAfterSplit,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>
                                <FigureText text={row.original.unlock} />
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
                        cell: ({ row }) =>
                            row.original.asOf === ''
                                ? null
                                : formatDisplayDate(row.original.asOf),
                        header: 'As of',
                        id: ReadinessBoardCardColumn.AsOf,
                    },
                ]}
                data={[...rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
        </OverviewPanel>
    );
});

function notFundedText(count: number): string | undefined {
    if (count === 0) return undefined;
    return count === 1
        ? '1 account is not funded, so it has no payout readiness.'
        : `${String(count)} accounts are not funded, so they have no payout readiness.`;
}
