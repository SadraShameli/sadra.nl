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
                            <TableHead className="text-right">
                                Structural busts
                            </TableHead>
                            <TableHead className="text-right">
                                Within-plan busts
                            </TableHead>
                            <TableHead className="text-right">
                                Unknown busts
                            </TableHead>
                            <TableHead className="text-right">
                                Payout rate
                            </TableHead>
                            <TableHead className="text-right">Fees</TableHead>
                            <TableHead className="text-right">
                                Net payouts
                            </TableHead>
                            <TableHead className="text-right">Net</TableHead>
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
                                <TableCell className="text-right tabular-nums">
                                    {row.structuralBusts}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.withinPlanBusts}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.unknownBusts}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.payoutRate}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.fees}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.netPayouts}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.net}
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
            <p className="text-xs text-muted-foreground">
                {model.biggestWeakness}
            </p>
            {model.weaknesses.length > 0 && (
                <ul
                    aria-label="Biggest weakness by plan"
                    className="flex flex-col gap-1 text-sm"
                >
                    {model.weaknesses.map((weakness) => (
                        <li key={weakness.key}>
                            Biggest weakness, {weakness.plan}: {weakness.text}
                        </li>
                    ))}
                </ul>
            )}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
}
