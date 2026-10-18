import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type ProfitConcentrationCardModel } from './overviewModel';
import { infoLinesOf, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum ProfitConcentrationCardColumn {
    Firm = 'firm',
    FundedAccountsInProfit = 'funded-accounts-in-profit',
    RecentPayouts = 'recent-payouts',
    ShareOfYourWithdrawable = 'share-of-your-withdrawable',
    SinceTheLastMoveLive = 'since-the-last-move-live',
    WithdrawableAboveTheRetainedCushion = 'withdrawable-above-the-retained-cushion',
}

export const ProfitConcentrationCard = memo(function ProfitConcentrationCard({
    model,
}: {
    readonly model: ProfitConcentrationCardModel;
}) {
    return (
        <OverviewPanel
            description={model.thresholdNote}
            info={infoLinesOf(model.disclosures)}
            section={OverviewSectionId.ProfitConcentration}
        >
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No account at a modeled firm yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.firm}</>,
                            header: 'Firm',
                            id: ProfitConcentrationCardColumn.Firm,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <>
                                    {row.original.inProfit} of{' '}
                                    {row.original.fundedAccounts}
                                </>
                            ),
                            header: 'Funded accounts in profit',
                            id: ProfitConcentrationCardColumn.FundedAccountsInProfit,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => <>{row.original.withdrawable}</>,
                            header: 'Withdrawable above the retained cushion',
                            id: ProfitConcentrationCardColumn.WithdrawableAboveTheRetainedCushion,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.withdrawableShare}</>
                            ),
                            header: 'Share of your withdrawable',
                            id: ProfitConcentrationCardColumn.ShareOfYourWithdrawable,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.recentPayouts}</>
                            ),
                            header: 'Recent payouts',
                            id: ProfitConcentrationCardColumn.RecentPayouts,
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.sinceMovedLive}</>
                            ),
                            header: 'Since the last move live',
                            id: ProfitConcentrationCardColumn.SinceTheLastMoveLive,
                        },
                    ]}
                    data={[...model.rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.caveats.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-warning">
                    {model.caveats.map((caveat) => (
                        <li key={caveat}>{caveat}</li>
                    ))}
                </ul>
            )}
        </OverviewPanel>
    );
});
