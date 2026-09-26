import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

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
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">
                        Payouts received
                    </TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Cumulative net</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {model.months.map((row) => (
                    <TableRow key={row.key}>
                        <TableCell className="tabular-nums">
                            {row.month}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.spend}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.payouts}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.net}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.cumulativeNet}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
