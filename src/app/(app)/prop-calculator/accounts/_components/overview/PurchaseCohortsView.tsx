import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type PurchaseCohortRow } from './overviewModel';

export function PurchaseCohortsView({
    rows,
}: {
    readonly rows: readonly PurchaseCohortRow[];
}) {
    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No purchase recorded yet.
            </p>
        );
    }
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Purchase month</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Payouts</TableHead>
                    <TableHead className="text-right">
                        Realized multiple (ended)
                    </TableHead>
                    <TableHead className="text-right">
                        To-date multiple
                    </TableHead>
                    <TableHead className="text-right">In progress</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => (
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
                            {row.realizedMultiple}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.toDateMultiple}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.inProgressCount}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
