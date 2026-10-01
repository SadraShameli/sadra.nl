import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type CushionBoardCardModel } from './overviewModel';

export function CushionBoardCard({
    model,
}: {
    readonly model: CushionBoardCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No account has a usable balance snapshot yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="text-right">Rank</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Stage</TableHead>
                            <TableHead className="text-right">Floor</TableHead>
                            <TableHead className="text-right">
                                Cushion
                            </TableHead>
                            <TableHead className="text-right">
                                Cushion in risk units
                            </TableHead>
                            <TableHead>As of</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell className="text-right tabular-nums">
                                    {row.rank}
                                </TableCell>
                                <TableCell>{row.account}</TableCell>
                                <TableCell>{row.basis}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.floor}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.cushion}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.ratio}
                                </TableCell>
                                <TableCell>{row.asOf}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <p className="text-xs text-muted-foreground">{model.disclosure}</p>
            {model.unavailable.length > 0 && (
                <ul
                    aria-label="Accounts without a cushion"
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground"
                >
                    {model.unavailable.map((row) => (
                        <li key={row.key}>
                            {row.account}: {row.reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
