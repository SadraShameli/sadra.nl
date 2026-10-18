import { ShieldAlert } from 'lucide-react';
import { memo } from 'react';

import { EnterBalancesButton } from '~/app/(app)/prop-calculator/accounts/_components/EnterBalancesButton';
import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { sentenceOf } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { NOT_APPLICABLE } from '~/lib/format';

import {
    type ExposureCardModel,
    isAwaitingOnlySnapshots,
} from './overviewModel';
import {
    infoLinesOf,
    OverviewEmptyPanel,
    OverviewPanel,
} from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

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

type ExposureAccountRow = ExposureCardModel['accounts'][number];

interface ExposureDisplayRow extends ExposureAccountRow {
    readonly reason: null | string;
}

export const ExposureCard = memo(function ExposureCard({
    model,
}: {
    readonly model: ExposureCardModel;
}) {
    if (
        model.accounts.length === 0 &&
        model.groups.length === 0 &&
        isAwaitingOnlySnapshots(model.unavailable)
    ) {
        return (
            <OverviewEmptyPanel
                action={<EnterBalancesButton />}
                description="Exposure compares each account's risk with its cushion."
                icon={ShieldAlert}
                section={OverviewSectionId.Exposure}
                title="Enter balances to see your exposure"
            />
        );
    }
    const accountRows: readonly ExposureDisplayRow[] = [
        ...model.accounts.map((row) => ({ ...row, reason: null })),
        ...model.unavailable.map((row) => ({
            account: row.account,
            basis: NOT_APPLICABLE,
            cushion: NOT_APPLICABLE,
            firstTradeRisk: NOT_APPLICABLE,
            key: row.key,
            maxDailyLoss: NOT_APPLICABLE,
            reason: sentenceOf(row.reason),
            shareOfCushionAtRisk: NOT_APPLICABLE,
        })),
    ];
    return (
        <OverviewPanel
            info={infoLinesOf(model.disclosures)}
            section={OverviewSectionId.Exposure}
        >
            {accountRows.length > 0 && (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.account}</>,
                            header: 'Account',
                            id: AccountExposureColumn.Account,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    reason={row.original.reason ?? undefined}
                                    text={row.original.firstTradeRisk}
                                />
                            ),
                            header: 'First-trade risk',
                            id: AccountExposureColumn.FirstTradeRisk,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.maxDailyLoss} />
                            ),
                            header: 'Maximum daily loss',
                            id: AccountExposureColumn.MaximumDailyLoss,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.cushion} />
                            ),
                            header: 'Cushion',
                            id: AccountExposureColumn.Cushion,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    text={row.original.shareOfCushionAtRisk}
                                />
                            ),
                            header: 'Share of cushion at risk',
                            id: AccountExposureColumn.ShareOfCushionAtRisk,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.basis} />
                            ),
                            header: 'Basis',
                            id: AccountExposureColumn.Basis,
                        },
                    ]}
                    data={[...accountRows]}
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
                            meta: { isRowHeader: true },
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
        </OverviewPanel>
    );
});
