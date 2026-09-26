import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { NOT_APPLICABLE } from '~/lib/format';

import { MonthlyPayoutChart } from './MonthlyPayoutChart';
import { type StatementCardModel } from './overviewModel';

export function StatementCard({
    model,
}: {
    readonly model: StatementCardModel;
}) {
    return model.months.length === 0 ? (
        <p className="text-sm text-muted-foreground">
            No fee, payout or event recorded yet.
        </p>
    ) : (
        <div className="flex flex-col gap-3">
            <MonthlyPayoutChart
                points={model.chart}
                targetDollars={model.targetDollars}
            />
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">
                            Payouts received
                        </TableHead>
                        <TableHead className="text-right">
                            Payout count
                        </TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="text-right">
                            Cumulative net
                        </TableHead>
                        <TableHead className="text-right">Multiple</TableHead>
                        <TableHead className="text-right">
                            Trailing 3-month multiple
                        </TableHead>
                        <TableHead className="text-right">Growth</TableHead>
                        <TableHead>Meets target</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {model.months.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell className="tabular-nums">
                                {row.month}
                                {row.isPartial && (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                        (partial)
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.spend}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.payouts}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.payoutCount}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.net}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.cumulativeNet}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.multiple}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.trailingThreeMonthMultiple}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.payoutGrowth}
                            </TableCell>
                            <TableCell>
                                {meetsTargetLabel(
                                    row.meetsPayoutTarget,
                                    row.meetsMultipleTarget,
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">{model.caveat}</p>
        </div>
    );
}

function meetsTargetLabel(
    meetsPayoutTarget: boolean | null,
    meetsMultipleTarget: boolean | null,
): string {
    if (meetsPayoutTarget === null && meetsMultipleTarget === null) {
        return NOT_APPLICABLE;
    }
    const wasMet = (meetsPayoutTarget ?? true) && (meetsMultipleTarget ?? true);
    return wasMet ? 'Yes' : 'No';
}
