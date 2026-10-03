import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type TiltVarianceCardModel } from './overviewModel';

export function TiltVarianceCard({
    model,
}: {
    readonly model: TiltVarianceCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No months with net cash yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Firm</TableHead>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">
                                Net cash
                            </TableHead>
                            <TableHead className="text-right">
                                Violation cost
                            </TableHead>
                            <TableHead className="text-right">
                                Net without violations
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.firm}</TableCell>
                                <TableCell>{row.month}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.netCash}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.violationCost}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.netWithoutViolations}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <p className="text-xs text-muted-foreground">{model.disclosure}</p>
            {model.droppedNote !== null && (
                <p className="text-xs text-amber-400">{model.droppedNote}</p>
            )}
        </div>
    );
}
