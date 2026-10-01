import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type PooledCapCardModel } from './overviewModel';

export function PooledCapCard({
    model,
}: {
    readonly model: PooledCapCardModel;
}) {
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
                            <TableHead>Cap scope</TableHead>
                            <TableHead className="text-right">
                                Funded in use
                            </TableHead>
                            <TableHead className="text-right">
                                Plan cap
                            </TableHead>
                            <TableHead className="text-right">
                                Pool free slots
                            </TableHead>
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
                                <TableCell>{row.scope}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.used}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.cap}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.poolFreeSlots}
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
            {model.unverifiedFirms.length > 0 && (
                <ul
                    aria-label="Firms with an unverified cap scope"
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground"
                >
                    {model.unverifiedFirms.map((firm) => (
                        <li key={firm}>{firm}: cap scope unverified</li>
                    ))}
                </ul>
            )}
            {model.householdNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.householdNote}
                </p>
            )}
        </div>
    );
}
