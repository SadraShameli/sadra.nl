import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type ReplacementCardModel } from './overviewModel';
import { SampleBadge } from './SampleBadge';

enum ReplacementCardColumn {
    Attempts = 'attempts',
    AttemptsPerFunded = 'attempts-per-funded',
    Plan = 'plan',
    RebuyLag = 'rebuy-lag',
    RebuyLagUsedByDefault = 'rebuy-lag-used-by-default',
    ReplacementsNotMeasured = 'replacements-not-measured',
}

export const ReplacementCard = memo(function ReplacementCard({
    model,
}: {
    readonly model: ReplacementCardModel;
}) {
    return model.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
            No account with a modeled plan yet.
        </p>
    ) : (
        <DataTable
            columns={[
                {
                    cell: ({ row }) => <>{row.original.plan}</>,
                    header: 'Plan',
                    id: ReplacementCardColumn.Plan,
                },
                {
                    cell: ({ row }) => (
                        <>
                            <span className="inline-flex items-center gap-1.5">
                                {row.original.attempts}
                                <SampleBadge
                                    level={row.original.attemptsSampleLevel}
                                />
                            </span>
                        </>
                    ),
                    header: 'Attempts',
                    id: ReplacementCardColumn.Attempts,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.attemptsPerFunded}</>,
                    header: 'Attempts per funded',
                    id: ReplacementCardColumn.AttemptsPerFunded,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.lag}</>,
                    header: 'Rebuy lag',
                    id: ReplacementCardColumn.RebuyLag,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.rebuyLag}</>,
                    header: 'Rebuy lag used by default',
                    id: ReplacementCardColumn.RebuyLagUsedByDefault,
                    meta: { align: DataTableAlign.End },
                },
                {
                    cell: ({ row }) => <>{row.original.unmeasured}</>,
                    header: 'Replacements not measured',
                    id: ReplacementCardColumn.ReplacementsNotMeasured,
                    meta: { align: DataTableAlign.End },
                },
            ]}
            data={[...model.rows]}
            isSortable={false}
            pageSize={null}
            rowId={(row) => row.key}
        />
    );
});
