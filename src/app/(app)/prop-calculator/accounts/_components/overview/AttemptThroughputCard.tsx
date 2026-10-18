import { memo } from 'react';

import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';

import { type AttemptThroughputCardModel } from './overviewModel';

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
            <p className="text-sm text-muted-foreground">
                No purchase or retry recorded yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">
                    Attempts per month
                </h3>
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
                                    {row.original.month}
                                </span>
                            ),
                            header: 'Month',
                            id: AttemptsByMonthColumn.Month,
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
                    <h3 className="text-sm font-medium text-foreground">
                        Attempts per month by firm
                    </h3>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row: { original: month } }) => (
                                    <span className="tabular-nums">
                                        {month.month}
                                    </span>
                                ),
                                header: 'Month',
                                id: FirmMonthColumn.Month,
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
                        rowId={(month) => month.key}
                    />
                </div>
            )}
            {model.perFirm.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                        Mean attempts per month by firm
                    </h3>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => <>{row.original.firm}</>,
                                header: 'Firm',
                                id: AttemptsByFirmColumn.Firm,
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
            <p className="text-xs text-muted-foreground">
                {model.countingNote}
            </p>
        </div>
    );
});
