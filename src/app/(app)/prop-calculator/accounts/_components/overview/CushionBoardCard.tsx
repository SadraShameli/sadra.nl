import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { formatDisplayDate } from '~/lib/format';

import { type CushionBoardCardModel } from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum CushionBoardCardColumn {
    Account = 'account',
    AsOf = 'as-of',
    Cushion = 'cushion',
    CushionInRiskUnits = 'cushion-in-risk-units',
    Floor = 'floor',
    Rank = 'rank',
    Stage = 'stage',
}

export const CushionBoardCard = memo(function CushionBoardCard({
    model,
}: {
    readonly model: CushionBoardCardModel;
}) {
    return (
        <OverviewPanel
            info={model.disclosure}
            section={OverviewSectionId.CushionBoard}
        >
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No account has a usable balance snapshot yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.rank}</>,
                            header: 'Rank',
                            id: CushionBoardCardColumn.Rank,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.account}</>,
                            header: 'Account',
                            id: CushionBoardCardColumn.Account,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => <>{row.original.basis}</>,
                            header: 'Stage',
                            id: CushionBoardCardColumn.Stage,
                        },
                        {
                            cell: ({ row }) => <>{row.original.floor}</>,
                            header: 'Floor',
                            id: CushionBoardCardColumn.Floor,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.cushion}</>,
                            header: 'Cushion',
                            id: CushionBoardCardColumn.Cushion,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.ratio}</>,
                            header: 'Cushion in risk units',
                            id: CushionBoardCardColumn.CushionInRiskUnits,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{formatDisplayDate(row.original.asOf)}</>
                            ),
                            header: 'As of',
                            id: CushionBoardCardColumn.AsOf,
                        },
                    ]}
                    data={[...model.rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.unavailable.length > 0 && (
                <ul
                    aria-label="Accounts without a cushion"
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
