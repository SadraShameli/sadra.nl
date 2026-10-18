import { memo } from 'react';

import AccountsPassedDistributionChart from '~/app/(app)/prop-calculator/_components/AccountsPassedDistributionChart';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';

import { type FundedPayoutsCardModel } from './overviewModel';

const PAYOUT_COUNT_CAPTION = '# payouts per funded account';

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
                realizedOnly(line, (row) => row.realizedFundedValue),
            header: 'Realized funded value',
            id: FundedPayoutsColumn.RealizedFundedValue,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: line } }) =>
                realizedOnly(line, (row) => (
                    <span className="text-muted-foreground">
                        {row.modeledFundedValue}
                        {row.fundedValueFlag !== null && (
                            <span className="block text-xs text-warning">
                                {row.fundedValueFlag}
                            </span>
                        )}
                    </span>
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
            <p className="text-sm text-muted-foreground">
                No funded account yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <DataTable
                columns={fundedPayoutsColumns(model.payoutCountCap)}
                data={linesOf(model.rows)}
                isSortable={false}
                pageSize={null}
                rowClassName={(line) =>
                    line.kind === FundedPayoutsLine.Modeled
                        ? 'text-muted-foreground'
                        : undefined
                }
                rowId={(line) => `${line.row.key}-${line.kind}`}
            />
            <div className="flex flex-col gap-4">
                {model.rows.map((row) => (
                    <DistributionPair key={row.key} row={row} />
                ))}
            </div>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
});

function DistributionPair({
    row,
}: {
    readonly row: FundedPayoutsCardModel['rows'][number];
}) {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">
                {row.plan}: payout-count distribution
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
                {row.realizedProbabilities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No fully observed funded account yet, so there is no
                        realized distribution.
                    </p>
                ) : (
                    <AccountsPassedDistributionChart
                        caption={`${PAYOUT_COUNT_CAPTION}, realized`}
                        distribution={[...row.realizedProbabilities]}
                        halfThreshold={false}
                    />
                )}
                {row.modeledProbabilities === null ? (
                    <p className="text-sm text-muted-foreground">
                        The modeled distribution is pending the engine cards.
                    </p>
                ) : (
                    <AccountsPassedDistributionChart
                        caption={`${PAYOUT_COUNT_CAPTION}, modeled`}
                        distribution={[...row.modeledProbabilities]}
                        halfThreshold={false}
                    />
                )}
            </div>
        </div>
    );
}
