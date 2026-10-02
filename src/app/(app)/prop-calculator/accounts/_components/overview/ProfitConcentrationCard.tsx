import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type ProfitConcentrationCardModel } from './overviewModel';

export function ProfitConcentrationCard({
    model,
}: {
    readonly model: ProfitConcentrationCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No account at a modeled firm yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Firm</TableHead>
                            <TableHead className="text-right">
                                Funded accounts in profit
                            </TableHead>
                            <TableHead className="text-right">
                                Withdrawable above the retained cushion
                            </TableHead>
                            <TableHead className="text-right">
                                Share of your withdrawable
                            </TableHead>
                            <TableHead>Recent payouts</TableHead>
                            <TableHead>Since the last move live</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.firm}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.inProfit} of {row.fundedAccounts}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.withdrawable}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.withdrawableShare}
                                </TableCell>
                                <TableCell>{row.recentPayouts}</TableCell>
                                <TableCell>{row.sinceMovedLive}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            {model.caveats.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-amber-400">
                    {model.caveats.map((caveat) => (
                        <li key={caveat}>{caveat}</li>
                    ))}
                </ul>
            )}
            <p className="text-sm text-muted-foreground">
                {model.thresholdNote}
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
}
