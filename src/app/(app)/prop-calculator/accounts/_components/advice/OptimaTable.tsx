import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type OptimumRowView } from './adviceViewModel';

export function OptimaTable({
    rows,
}: {
    readonly rows: readonly OptimumRowView[];
}) {
    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No engine optima were requested for this stage.
            </p>
        );
    }
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">
                        Standard error
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => (
                    <TableRow key={`${row.source}-${row.label}`}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell>{row.text}</TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.standardError === null
                                ? ''
                                : row.standardError.toFixed(2)}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
