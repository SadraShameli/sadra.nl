import { memo } from 'react';

import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { NOT_APPLICABLE } from '~/lib/format';
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
                <p className="text-sm text-muted-foreground">
                    No rule violations recorded yet.
                </p>
            ) : (
                <>
                    <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-[max-content_1fr]">
                        <div className="contents">
                            <dt className="text-muted-foreground">
                                Total cost
                            </dt>
                            <dd className="tabular-nums">{model.netCost}</dd>
                        </div>
                        <div className="contents">
                            <dt className="text-muted-foreground">
                                Share of net cash
                            </dt>
                            <dd className="tabular-nums">
                                {model.netCostShareOfNetCash ?? NOT_APPLICABLE}
                            </dd>
                        </div>
                        <div className="contents">
                            <dt className="text-muted-foreground">
                                Logged by you
                            </dt>
                            <dd className="tabular-nums">
                                {model.manualCount}
                            </dd>
                        </div>
                        <div className="contents">
                            <dt className="text-muted-foreground">
                                Detected from your journal
                            </dt>
                            <dd className="tabular-nums">
                                {model.detectedCount}
                            </dd>
                        </div>
                    </dl>
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
