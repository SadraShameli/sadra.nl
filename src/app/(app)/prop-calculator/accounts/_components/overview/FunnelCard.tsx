import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type FunnelCardModel } from './overviewModel';

export function FunnelCard({ model }: { readonly model: FunnelCardModel }) {
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
                            <TableHead>Firm</TableHead>
                            <TableHead className="text-right">
                                Purchased
                            </TableHead>
                            <TableHead className="text-right">Passed</TableHead>
                            <TableHead className="text-right">Funded</TableHead>
                            <TableHead className="text-right">
                                First payout
                            </TableHead>
                            <TableHead className="text-right">
                                Moved live
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.firm}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.purchased}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.passed}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.funded}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.firstPayout}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.movedLive}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            {model.unresolvedNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.unresolvedNote}
                </p>
            )}
        </div>
    );
}
