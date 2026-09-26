import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type CapUsageCardModel } from './overviewModel';

export function CapUsageCard({ model }: { readonly model: CapUsageCardModel }) {
    return (
        <div className="flex flex-col gap-3">
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No plan in use yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Plan</TableHead>
                            <TableHead className="text-right">
                                Funded in use
                            </TableHead>
                            <TableHead className="text-right">Cap</TableHead>
                            <TableHead className="text-right">
                                Free slots
                            </TableHead>
                            <TableHead>Note</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.plan}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.used}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.cap}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.freeSlots}
                                </TableCell>
                                <TableCell>{row.note}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <p className="text-xs text-muted-foreground">{model.disclosure}</p>
            {model.unresolvedNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.unresolvedNote}
                </p>
            )}
        </div>
    );
}
