import { HandCoins } from 'lucide-react';
import { memo } from 'react';

import AccountsPassedDistributionChart from '~/app/(app)/prop-calculator/_components/AccountsPassedDistributionChart';
import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import {
    hasFigure,
    isPendingFigure,
} from '~/app/(app)/prop-calculator/accounts/_components/figureValues';
import { sentenceOf } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { MissingValue } from '~/components/MissingValue';
import { PanelSubheading } from '~/components/PanelSubheading';
import { ChartSize, ChartSkeleton } from '~/components/ui/chart';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
    DataTableNarrowLayout,
} from '~/components/ui/data-table';
import { WarningNote } from '~/components/WarningNote';
import { cn } from '~/lib/utilities';

import { type FundedPayoutsCardModel } from './overviewModel';
import {
    infoLinesOf,
    OverviewEmptyPanel,
    OverviewPanel,
} from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

const PAYOUT_COUNT_CAPTION = '# payouts per funded account';

const MODELED_DISTRIBUTION_LABEL = 'Modeled distribution:';

const NO_MODELED_DISTRIBUTION_TEXT = `${MODELED_DISTRIBUTION_LABEL} the engine has none for this plan.`;

const NO_REALIZED_DISTRIBUTION_TEXT =
    'Realized distribution: no fully observed funded account yet.';

enum FundedPayoutsColumn {
    ModeledFundedValue = 'modeled-funded-value',
    Plan = 'plan',
    RealizedFundedValue = 'realized-funded-value',
    TooYoung = 'too-young',
}

enum FundedPayoutsLine {
    Modeled = 'modeled',
    Realized = 'realized',
}

interface FundedPayoutsLineRow {
    readonly kind: FundedPayoutsLine;
    readonly row: FundedPayoutsPlanRow;
}

type FundedPayoutsPlanRow = FundedPayoutsCardModel['rows'][number];

function fundedPayoutsColumns(
    payoutCountCap: number,
): DataTableColumn<FundedPayoutsLineRow>[] {
    return [
        {
            cell: ({ row: { original: line } }) =>
                line.kind === FundedPayoutsLine.Modeled
                    ? `${line.row.plan} (modeled share)`
                    : line.row.plan,
            header: 'Plan',
            id: FundedPayoutsColumn.Plan,
            meta: { isRowHeader: true },
        },
        ...Array.from(
            { length: payoutCountCap + 1 },
            (_, count): DataTableColumn<FundedPayoutsLineRow> => ({
                cell: ({ row: { original: line } }) =>
                    line.kind === FundedPayoutsLine.Modeled
                        ? line.row.modeledCounts?.[count]
                        : line.row.counts[count],
                header:
                    count === payoutCountCap
                        ? `${String(count)}+`
                        : String(count),
                id: payoutCountColumnId(count),
                meta: { align: DataTableAlign.End },
            }),
        ),
        {
            cell: ({ row: { original: line } }) =>
                realizedOnly(line, (row) => row.openAccounts),
            header: 'Too young',
            id: FundedPayoutsColumn.TooYoung,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: line } }) =>
                realizedOnly(line, (row) => (
                    <FigureText text={row.realizedFundedValue} />
                )),
            header: 'Realized funded value',
            id: FundedPayoutsColumn.RealizedFundedValue,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: line } }) =>
                realizedOnly(line, (row) => (
                    <div>
                        <FigureText text={row.modeledFundedValue} />
                        {row.fundedValueFlag !== null && (
                            <WarningNote className="flex justify-end text-xs">
                                {row.fundedValueFlag}
                            </WarningNote>
                        )}
                    </div>
                )),
            header: 'Modeled funded value',
            id: FundedPayoutsColumn.ModeledFundedValue,
            meta: { align: DataTableAlign.End },
        },
    ];
}

function linesOf(
    rows: readonly FundedPayoutsPlanRow[],
): FundedPayoutsLineRow[] {
    return rows.flatMap((row) => [
        { kind: FundedPayoutsLine.Realized, row },
        ...(row.modeledCounts === null
            ? []
            : [{ kind: FundedPayoutsLine.Modeled, row }]),
    ]);
}

function payoutCountColumnId(count: number): string {
    return `count-${String(count)}`;
}

function realizedOnly(
    line: FundedPayoutsLineRow,
    render: (row: FundedPayoutsPlanRow) => React.ReactNode,
): React.ReactNode {
    return line.kind === FundedPayoutsLine.Realized ? render(line.row) : null;
}

export const FundedPayoutsCard = memo(function FundedPayoutsCard({
    model,
}: {
    readonly model: FundedPayoutsCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <OverviewEmptyPanel
                icon={HandCoins}
                section={OverviewSectionId.FundedPayouts}
                title="No funded account yet"
            />
        );
    }
    return (
        <OverviewPanel
            info={infoLinesOf(model.disclosures)}
            section={OverviewSectionId.FundedPayouts}
        >
            <DataTable
                columns={fundedPayoutsColumns(model.payoutCountCap).filter(
                    (column) =>
                        column.id !== FundedPayoutsColumn.RealizedFundedValue ||
                        model.rows.some((row) =>
                            hasFigure(row.realizedFundedValue),
                        ),
                )}
                data={linesOf(model.rows)}
                isSortable={false}
                narrowLayout={DataTableNarrowLayout.Scroll}
                pageSize={null}
                rowId={(line) => `${line.row.key}-${line.kind}`}
            />
            <div className="flex flex-col gap-4">
                {model.rows.map((row) => (
                    <DistributionPair key={row.key} row={row} />
                ))}
            </div>
        </OverviewPanel>
    );
});

function DistributionPair({
    row,
}: {
    readonly row: FundedPayoutsCardModel['rows'][number];
}) {
    const hasRealized = row.realizedProbabilities.length > 0;
    const isModeledPending = isPendingFigure(row.modeledFundedValue);
    const hasModeled = row.modeledProbabilities !== null || isModeledPending;
    return (
        <div className="flex flex-col gap-2">
            <PanelSubheading>
                {row.plan}: payout-count distribution
            </PanelSubheading>
            <div
                className={cn(
                    'grid gap-4',
                    hasRealized && hasModeled && 'md:grid-cols-2',
                )}
            >
                {hasRealized && (
                    <AccountsPassedDistributionChart
                        caption={`${PAYOUT_COUNT_CAPTION}, realized`}
                        distribution={[...row.realizedProbabilities]}
                        halfThreshold={false}
                    />
                )}
                {row.modeledProbabilities === null ? (
                    isModeledPending && (
                        <ChartSkeleton size={ChartSize.Compact} />
                    )
                ) : (
                    <AccountsPassedDistributionChart
                        caption={`${PAYOUT_COUNT_CAPTION}, modeled`}
                        distribution={[...row.modeledProbabilities]}
                        halfThreshold={false}
                    />
                )}
            </div>
            {!hasRealized && (
                <p className="text-xs text-muted-foreground">
                    {NO_REALIZED_DISTRIBUTION_TEXT}
                </p>
            )}
            {!hasModeled && <NoModeledDistribution row={row} />}
        </div>
    );
}

function NoModeledDistribution({
    row,
}: {
    readonly row: FundedPayoutsPlanRow;
}) {
    return row.modeledUnavailableReason === null ? (
        <p className="text-xs text-muted-foreground">
            {NO_MODELED_DISTRIBUTION_TEXT}
        </p>
    ) : (
        <p className="text-xs text-muted-foreground">
            {MODELED_DISTRIBUTION_LABEL}{' '}
            <MissingValue reason={sentenceOf(row.modeledUnavailableReason)} />
        </p>
    );
}
