import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type LiveProximityCardModel } from './overviewModel';

export function LiveProximityCard({
    model,
}: {
    readonly model: LiveProximityCardModel;
}) {
    const isEmpty =
        model.firms.length === 0 &&
        model.accounts.length === 0 &&
        model.singleDayFacts.length === 0;
    return (
        <div className="flex flex-col gap-3">
            {isEmpty && (
                <p className="text-sm text-muted-foreground">
                    No open funded account to measure against a live trigger.
                </p>
            )}
            {model.firms.length > 0 && (
                <Table aria-label="Payouts toward a firm-wide live trigger">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Firm</TableHead>
                            <TableHead className="text-right">
                                Paid payouts since
                            </TableHead>
                            <TableHead>Since</TableHead>
                            <TableHead className="text-right">
                                Firm-wide trigger
                            </TableHead>
                            <TableHead className="text-right">
                                Payouts left
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.firms.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.firm}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.paidSinceLastLive}
                                </TableCell>
                                <TableCell>{row.since}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.trigger}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.remaining}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            {model.accounts.length > 0 && (
                <Table aria-label="Payouts toward a per-account live trigger">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead className="text-right">
                                Paid payouts
                            </TableHead>
                            <TableHead className="text-right">
                                Per-account trigger
                            </TableHead>
                            <TableHead className="text-right">
                                Payouts left
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.accounts.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.account}</TableCell>
                                <TableCell>{row.plan}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.paidPayouts}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.trigger}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.remaining}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            {model.singleDayFacts.length > 0 && (
                <ul
                    aria-label="Single-day live triggers"
                    className="flex list-disc flex-col gap-2 pl-5 text-sm"
                >
                    {model.singleDayFacts.map((fact) => (
                        <li key={fact.key}>
                            {fact.plan}: {fact.text}
                            <blockquote className="mt-1 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                                {fact.quote}
                                <span className="block">{fact.source}</span>
                            </blockquote>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-xs text-muted-foreground">{model.disclosure}</p>
            {model.unlistedNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.unlistedNote}
                </p>
            )}
        </div>
    );
}
