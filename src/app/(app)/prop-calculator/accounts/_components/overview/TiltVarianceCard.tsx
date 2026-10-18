import { Scale } from 'lucide-react';
import { memo } from 'react';

import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { WarningNote } from '~/components/WarningNote';
import { formatDisplayMonth } from '~/lib/format';

import { type TiltVarianceCardModel } from './overviewModel';
import { OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

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
        <OverviewPanel
            info={model.disclosure}
            section={OverviewSectionId.TiltVariance}
        >
            {model.rows.length === 0 ? (
                <EmptyState
                    icon={Scale}
                    size={EmptyStateSize.Compact}
                    title="No months with net cash yet"
                />
            ) : (
                <DataTable
                    columns={[
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.firm} />
                            ),
                            header: 'Firm',
                            id: TiltVarianceCardColumn.Firm,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <>{formatDisplayMonth(row.original.month)}</>
                            ),
                            header: 'Month',
                            id: TiltVarianceCardColumn.Month,
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.netCash} />
                            ),
                            header: 'Net cash',
                            id: TiltVarianceCardColumn.NetCash,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.violationCost} />
                            ),
                            header: 'Violation cost',
                            id: TiltVarianceCardColumn.ViolationCost,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    text={row.original.netWithoutViolations}
                                />
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
            {model.droppedNote !== null && (
                <WarningNote className="text-xs">
                    {model.droppedNote}
                </WarningNote>
            )}
        </OverviewPanel>
    );
});
