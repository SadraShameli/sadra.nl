import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type OutcomesCardModel } from './overviewModel';

export function RealizedOutcomesCard({
    model,
}: {
    readonly model: OutcomesCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No account with a modeled plan yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Plan</TableHead>
                            <TableHead className="text-right">
                                Pass rate
                            </TableHead>
                            <TableHead className="text-right">
                                Sessions to funded
                            </TableHead>
                            <TableHead className="text-right">
                                Funded survival
                            </TableHead>
                            <TableHead className="text-right">
                                Still open
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.plan}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.passRate}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.sessionsToFunded}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.fundedSurvival}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.openFunded}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
}
