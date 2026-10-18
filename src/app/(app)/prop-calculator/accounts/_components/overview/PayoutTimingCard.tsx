import { Clock } from 'lucide-react';
import { memo } from 'react';

import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { isMissingFigure } from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import { MissingValue } from '~/components/MissingValue';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';

import { OverviewEmptyPanel, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';
import {
    type PayoutTimingCardModel,
    type PayoutTimingFigure,
} from './payoutTimingModel';
import { SampleBadge } from './SampleBadge';

const PAYOUT_TIMING_LABEL = 'Payout timing per plan';

const NO_SAMPLE_REASON = 'No paid payout on this plan to measure yet.';

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
    if (!model.rows.some(hasObservedTiming)) {
        return (
            <OverviewEmptyPanel
                description="Timing is measured from funded accounts that have been paid."
                icon={Clock}
                section={OverviewSectionId.PayoutTiming}
                title="No paid funded account to time yet"
            />
        );
    }
    return (
        <OverviewPanel
            info={model.explanation}
            section={OverviewSectionId.PayoutTiming}
        >
            <DataTable
                columns={PAYOUT_TIMING_COLUMNS}
                data={[...model.rows]}
                isSortable={false}
                pageSize={null}
                regionLabel={PAYOUT_TIMING_LABEL}
                rowId={(row) => row.key}
            />
        </OverviewPanel>
    );
});

function Figure({ figure }: { readonly figure: PayoutTimingFigure }) {
    if (figure.n === 0) return <MissingValue reason={NO_SAMPLE_REASON} />;
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            <FigureText text={figure.mean} />
            <span className="text-xs text-muted-foreground">
                {isMissingFigure(figure.standardError)
                    ? `n = ${String(figure.n)}`
                    : `SE ${figure.standardError}, n = ${String(figure.n)}`}
            </span>
            <SampleBadge level={figure.sampleLevel} />
        </span>
    );
}

function hasObservedTiming(row: PayoutTimingRow): boolean {
    return (
        row.toFirstPayout.n > 0 ||
        row.betweenPayouts.n > 0 ||
        row.unpaidNote !== null
    );
}
