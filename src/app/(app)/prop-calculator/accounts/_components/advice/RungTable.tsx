import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { formatCurrency } from '~/lib/format';

export interface RungTableRow {
    readonly cappedByText: readonly string[];
    readonly risk: number;
    readonly runningLossAfter: number;
    readonly takeProfit: number;
}

export function RungTable({
    label,
    rungs,
}: {
    readonly label: string;
    readonly rungs: readonly RungTableRow[];
}) {
    return (
        <Table>
            <TableCaption className="sr-only">{label}</TableCaption>
            <TableHeader>
                <TableRow>
                    <TableHead>Trade</TableHead>
                    <TableHead className="text-right">Risk</TableHead>
                    <TableHead className="text-right">Take profit</TableHead>
                    <TableHead className="text-right">
                        Running loss after
                    </TableHead>
                    <TableHead>Capped by</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rungs.map((rung, index) => (
                    <TableRow key={String(index)}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="text-right tabular-nums">
                            {formatCurrency(rung.risk, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {formatCurrency(rung.takeProfit, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {formatCurrency(rung.runningLossAfter, 2)}
                        </TableCell>
                        <TableCell>{rung.cappedByText.join(', ')}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
