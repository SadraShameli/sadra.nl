import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { figureTextOf, type OptimumRowView } from './adviceViewModel';

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
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row) => (
                    <TableRow key={`${row.source}-${row.label}`}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell>
                            <p>{row.text}</p>
                            {row.figures.length > 0 && (
                                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground tabular-nums">
                                    {row.figures.map((figure) => (
                                        <li key={figure.kind}>
                                            {figure.label}{' '}
                                            {figureTextOf(figure)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
