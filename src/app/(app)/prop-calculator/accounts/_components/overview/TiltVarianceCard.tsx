import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type TiltVarianceCardModel } from './overviewModel';

enum TiltVarianceCardColumn {
    Firm = 'firm',
    Month = 'month',
    NetCash = 'net-cash',
    NetWithoutViolations = 'net-without-violations',
    ViolationCost = 'violation-cost',
}

export const TiltVarianceCard = memo(function TiltVarianceCard({
    model,
}: {
    readonly model: TiltVarianceCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No months with net cash yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => <>{row.original.firm}</>,
                            header: 'Firm',
                            id: TiltVarianceCardColumn.Firm,
                        },
                        {
                            cell: ({ row }) => <>{row.original.month}</>,
                            header: 'Month',
                            id: TiltVarianceCardColumn.Month,
                        },
                        {
                            cell: ({ row }) => <>{row.original.netCash}</>,
                            header: 'Net cash',
                            id: TiltVarianceCardColumn.NetCash,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.violationCost}</>
                            ),
                            header: 'Violation cost',
                            id: TiltVarianceCardColumn.ViolationCost,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <>{row.original.netWithoutViolations}</>
                            ),
                            header: 'Net without violations',
                            id: TiltVarianceCardColumn.NetWithoutViolations,
                            meta: { align: DataTableAlign.End },
                        },
                    ]}
                    data={[...model.rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            <p className="text-xs text-muted-foreground">{model.disclosure}</p>
            {model.droppedNote !== null && (
                <p className="text-xs text-warning">{model.droppedNote}</p>
            )}
        </div>
    );
});
