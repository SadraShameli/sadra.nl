import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type AttemptThroughputCardModel } from './overviewModel';

export function AttemptThroughputCard({
    model,
}: {
    readonly model: AttemptThroughputCardModel;
}) {
    if (model.months.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No purchase or retry recorded yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-white">
                    Attempts per month
                </h3>
                <p className="text-sm text-muted-foreground">
                    Mean {model.meanPerMonth} attempts per month
                    {model.meanPerActiveFirmPerMonth === null
                        ? ''
                        : `, ${model.meanPerActiveFirmPerMonth} per active firm per month`}
                    .
                </p>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">
                                Attempts
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.months.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell className="tabular-nums">
                                    {row.month}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.attempts}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {model.perFirm.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-white">
                        Mean attempts per month by firm
                    </h3>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Firm</TableHead>
                                <TableHead className="text-right">
                                    Mean per month
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {model.perFirm.map((row) => (
                                <TableRow key={row.key}>
                                    <TableCell>{row.firm}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.meanPerMonth}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}
