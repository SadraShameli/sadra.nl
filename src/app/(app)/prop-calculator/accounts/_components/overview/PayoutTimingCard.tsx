import { memo } from 'react';

import { DataTable, type DataTableColumn } from '~/components/ui/data-table';

import {
    type PayoutTimingCardModel,
    type PayoutTimingFigure,
} from './payoutTimingModel';
import { SampleBadge } from './SampleBadge';

const PAYOUT_TIMING_LABEL = 'Payout timing per plan';

enum PayoutTimingColumn {
    BetweenPayouts = 'between-payouts',
    Plan = 'plan',
    ToFirstPayout = 'to-first-payout',
}

type PayoutTimingRow = PayoutTimingCardModel['rows'][number];

const PAYOUT_TIMING_COLUMNS: DataTableColumn<PayoutTimingRow>[] = [
    {
        cell: ({ row: { original: row } }) => (
            <div className="flex flex-col gap-1">
                <span className="text-sm text-foreground">{row.plan}</span>
                {row.unpaidNote !== null && (
                    <span className="text-xs text-muted-foreground">
                        {row.unpaidNote}
                    </span>
                )}
            </div>
        ),
        header: 'Plan',
        id: PayoutTimingColumn.Plan,
        meta: { isRowHeader: true },
    },
    {
        cell: ({ row: { original: row } }) => (
            <span className="tabular-nums">
                <Figure figure={row.toFirstPayout} />
            </span>
        ),
        header: 'Funded to first payout',
        id: PayoutTimingColumn.ToFirstPayout,
    },
    {
        cell: ({ row: { original: row } }) => (
            <span className="tabular-nums">
                <Figure figure={row.betweenPayouts} />
            </span>
        ),
        header: 'Between later payouts',
        id: PayoutTimingColumn.BetweenPayouts,
    },
];

export const PayoutTimingCard = memo(function PayoutTimingCard({
    model,
}: {
    readonly model: PayoutTimingCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No plan to time yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">{model.explanation}</p>
            <DataTable
                columns={PAYOUT_TIMING_COLUMNS}
                data={[...model.rows]}
                isSortable={false}
                pageSize={null}
                regionLabel={PAYOUT_TIMING_LABEL}
                rowId={(row) => row.key}
            />
        </div>
    );
});

function Figure({ figure }: { readonly figure: PayoutTimingFigure }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            {figure.mean}
            <span className="text-xs text-muted-foreground">
                SE {figure.standardError}, n = {String(figure.n)}
            </span>
            <SampleBadge level={figure.sampleLevel} />
        </span>
    );
}
