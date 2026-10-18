import { ShieldCheck } from 'lucide-react';
import { memo } from 'react';

import { hasFigure } from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import { StatStrip } from '~/components/StatStrip';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatCount, NOT_APPLICABLE } from '~/lib/format';
import { ruleViolationKindLabel } from '~/lib/prop-accounts';

import { type ViolationsCardModel } from './overviewModel';
import { infoLinesOf, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum ViolationKindColumn {
    Cost = 'cost',
    Count = 'count',
    Kind = 'kind',
}

type ViolationKindRow = ViolationsCardModel['byKind'][number];

const VIOLATION_KIND_COLUMNS: DataTableColumn<ViolationKindRow>[] = [
    {
        accessorFn: (row) => ruleViolationKindLabel(row.kind),
        header: 'Kind',
        id: ViolationKindColumn.Kind,
        meta: { isRowHeader: true },
    },
    {
        accessorFn: (row) => row.count,
        header: 'Count',
        id: ViolationKindColumn.Count,
        meta: { align: DataTableAlign.End },
    },
    {
        accessorFn: (row) => row.cost,
        header: 'Cost',
        id: ViolationKindColumn.Cost,
        meta: { align: DataTableAlign.End },
    },
];

export const ViolationsCard = memo(function ViolationsCard({
    model,
}: {
    readonly model: ViolationsCardModel;
}) {
    return (
        <OverviewPanel
            info={infoLinesOf(model.disclosures)}
            section={OverviewSectionId.Violations}
        >
            {model.byKind.length === 0 ? (
                <EmptyState
                    icon={ShieldCheck}
                    size={EmptyStateSize.Compact}
                    title="No rule violations recorded yet"
                />
            ) : (
                <>
                    <StatStrip
                        items={[
                            {
                                id: 'total-cost',
                                label: 'Total cost',
                                value: model.netCost,
                            },
                            {
                                id: 'share-of-net-cash',
                                label: 'Share of net cash',
                                value:
                                    model.netCostShareOfNetCash ??
                                    NOT_APPLICABLE,
                            },
                            {
                                id: 'logged-by-you',
                                label: 'Logged by you',
                                value: formatCount(model.manualCount),
                            },
                            {
                                id: 'detected-from-journal',
                                label: 'Detected from your journal',
                                value: formatCount(model.detectedCount),
                            },
                        ].filter((item) => hasFigure(item.value))}
                    />
                    <DataTable
                        columns={VIOLATION_KIND_COLUMNS}
                        data={[...model.byKind]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
                </>
            )}
        </OverviewPanel>
    );
});
