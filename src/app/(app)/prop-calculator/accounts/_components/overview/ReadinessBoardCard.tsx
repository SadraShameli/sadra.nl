import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type ReadinessBoardCardModel } from './overviewModel';

export function ReadinessBoardCard({
    model,
}: {
    readonly model: ReadinessBoardCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No funded account has a usable balance snapshot yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">
                                Rule-capped withdrawable at the request
                            </TableHead>
                            <TableHead className="text-right">
                                Net after split
                            </TableHead>
                            <TableHead>What unlocks it</TableHead>
                            <TableHead>As of</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.account}</TableCell>
                                <TableCell>{row.status}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.requested}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.netAfterSplit}
                                </TableCell>
                                <TableCell>
                                    {row.unlock}
                                    {row.note !== null && (
                                        <span className="block text-xs text-muted-foreground">
                                            {row.note}
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell>{row.asOf}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <p className="text-xs text-muted-foreground">{model.disclosure}</p>
            {model.notFundedCount > 0 && (
                <p className="text-xs text-muted-foreground">
                    {model.notFundedCount === 1
                        ? '1 account is not funded, so it has no payout readiness.'
                        : `${String(model.notFundedCount)} accounts are not funded, so they have no payout readiness.`}
                </p>
            )}
            {model.unavailable.length > 0 && (
                <ul
                    aria-label="Accounts without a payout readiness"
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
