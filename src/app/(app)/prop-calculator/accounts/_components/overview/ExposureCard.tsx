import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type ExposureCardModel } from './overviewModel';

enum AccountExposureColumn {
    Account = 'account',
    Basis = 'basis',
    Cushion = 'cushion',
    FirstTradeRisk = 'first-trade-risk',
    MaximumDailyLoss = 'maximum-daily-loss',
    ShareOfCushionAtRisk = 'share-of-cushion-at-risk',
}

enum CopyGroupExposureColumn {
    Accounts = 'accounts',
    CombinedCushion = 'combined-cushion',
    CopyGroup = 'copy-group',
    MaximumDailyLoss = 'maximum-daily-loss',
    ShareOfCushionAtRisk = 'share-of-cushion-at-risk',
}

export const ExposureCard = memo(function ExposureCard({
    model,
}: {
    readonly model: ExposureCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No active account has a usable balance snapshot yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.account}</>,
                            header: 'Account',
                            id: AccountExposureColumn.Account,
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.firstTradeRisk}</>
                            ),
                            header: 'First-trade risk',
                            id: AccountExposureColumn.FirstTradeRisk,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.maxDailyLoss}</>,
                            header: 'Maximum daily loss',
                            id: AccountExposureColumn.MaximumDailyLoss,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.cushion}</>,
                            header: 'Cushion',
                            id: AccountExposureColumn.Cushion,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.shareOfCushionAtRisk}</>
                            ),
                            header: 'Share of cushion at risk',
                            id: AccountExposureColumn.ShareOfCushionAtRisk,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.basis}</>,
                            header: 'Basis',
                            id: AccountExposureColumn.Basis,
                        },
                    ]}
                    data={[...model.accounts]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.groups.length > 0 && (
                <DataTable
                    aria-label="Exposure per copy group"
                    columns={[
                        {
                            cell: ({ row }) => (
                                <>
                                    {row.original.group}
                                    <span className="block text-xs text-muted-foreground">
                                        {row.original.note}
                                    </span>
                                </>
                            ),
                            header: 'Copy group',
                            id: CopyGroupExposureColumn.CopyGroup,
                        },
                        {
                            cell: ({ row }) => <>{row.original.accounts}</>,
                            header: 'Accounts',
                            id: CopyGroupExposureColumn.Accounts,
                        },
                        {
                            cell: ({ row }) => <>{row.original.maxDailyLoss}</>,
                            header: 'Maximum daily loss',
                            id: CopyGroupExposureColumn.MaximumDailyLoss,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.totalCushion}</>,
                            header: 'Combined cushion',
                            id: CopyGroupExposureColumn.CombinedCushion,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.shareOfCushionAtRisk}</>
                            ),
                            header: 'Share of cushion at risk',
                            id: CopyGroupExposureColumn.ShareOfCushionAtRisk,
                            meta: { align: DataTableAlign.End },
                        },
                    ]}
                    data={[...model.groups]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
            {model.unavailable.length > 0 && (
                <ul
                    aria-label="Accounts without an exposure"
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground"
                >
                    {model.unavailable.map((row) => (
                        <li key={row.key}>
                            {row.account}: {row.reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
});
