import { memo } from 'react';

import { PanelSubheading } from '~/components/PanelSubheading';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
    DataTablePhoneLayout,
} from '~/components/ui/data-table';
import { formatDisplayMonth } from '~/lib/format';

import { type AttemptThroughputCardModel } from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum AttemptsByFirmColumn {
    Firm = 'firm',
    MeanPerMonth = 'mean-per-month',
}

enum AttemptsByMonthColumn {
    Attempts = 'attempts',
    Month = 'month',
}

enum FirmMonthColumn {
    Month = 'month',
}

type AttemptMonth = AttemptThroughputCardModel['months'][number];

export const AttemptThroughputCard = memo(function AttemptThroughputCard({
    model,
}: {
    readonly model: AttemptThroughputCardModel;
}) {
    if (model.months.length === 0) {
        return (
            <OverviewPanel section={OverviewSectionId.AttemptThroughput}>
                <p className="text-sm text-muted-foreground">
                    No purchase or retry recorded yet.
                </p>
            </OverviewPanel>
        );
    }
    return (
        <OverviewPanel
            contentClassName="gap-6"
            info={model.countingNote}
            section={OverviewSectionId.AttemptThroughput}
        >
            <div className="flex flex-col gap-2">
                <PanelSubheading>Attempts per month</PanelSubheading>
                <p className="text-sm text-muted-foreground">
                    Mean {model.meanPerMonth} attempts per month
                    {model.meanPerActiveFirmPerMonth === null
                        ? ''
                        : `, ${model.meanPerActiveFirmPerMonth} per active firm per month`}
                    .
                </p>
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => (
                                <span className="tabular-nums">
                                    {formatDisplayMonth(row.original.month)}
                                </span>
                            ),
                            header: 'Month',
                            id: AttemptsByMonthColumn.Month,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => <>{row.original.attempts}</>,
                            header: 'Attempts',
                            id: AttemptsByMonthColumn.Attempts,
                            meta: { align: DataTableAlign.End },
                        },
                    ]}
                    data={[...model.months]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            </div>
            {model.perFirm.length > 0 && (
                <div className="flex flex-col gap-2">
                    <PanelSubheading>
                        Attempts per month by firm
                    </PanelSubheading>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row: { original: month } }) => (
                                    <span className="tabular-nums">
                                        {formatDisplayMonth(month.month)}
                                    </span>
                                ),
                                header: 'Month',
                                id: FirmMonthColumn.Month,
                                meta: { isRowHeader: true },
                            },
                            ...model.perFirm.map(
                                (firm): DataTableColumn<AttemptMonth> => ({
                                    cell: ({ row: { original: month } }) =>
                                        firm.months.find(
                                            (entry) =>
                                                entry.month === month.month,
                                        )?.attempts ?? '0',
                                    header: firm.firm,
                                    id: firm.key,
                                    meta: { align: DataTableAlign.End },
                                }),
                            ),
                        ]}
                        data={[...model.months]}
                        isSortable={false}
                        pageSize={null}
                        phoneLayout={DataTablePhoneLayout.Scroll}
                        rowId={(month) => month.key}
                    />
                </div>
            )}
            {model.perFirm.length > 0 && (
                <div className="flex flex-col gap-2">
                    <PanelSubheading>
                        Mean attempts per month by firm
                    </PanelSubheading>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => <>{row.original.firm}</>,
                                header: 'Firm',
                                id: AttemptsByFirmColumn.Firm,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.meanPerMonth}</>
                                ),
                                header: 'Mean per month',
                                id: AttemptsByFirmColumn.MeanPerMonth,
                                meta: { align: DataTableAlign.End },
                            },
                        ]}
                        data={[...model.perFirm]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
                </div>
            )}
        </OverviewPanel>
    );
});
