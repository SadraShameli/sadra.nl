import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type ExpectedNetCardModel, ExpectedNetStatus } from './overviewModel';

export function ExpectedNetCard({
    model,
}: {
    readonly model: ExpectedNetCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {model.statusNote ?? 'No plan to model yet.'}
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            {model.status !== ExpectedNetStatus.Ready &&
                model.statusNote !== null && (
                    <p className="text-sm text-muted-foreground" role="status">
                        {model.statusNote}
                    </p>
                )}
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">
                            Active funded slots
                        </TableHead>
                        <TableHead className="text-right">
                            Documented policy, monthly net (credit-free)
                        </TableHead>
                        <TableHead className="text-right">
                            Documented policy, credit-inclusive
                        </TableHead>
                        <TableHead className="text-right">
                            Documented request
                        </TableHead>
                        <TableHead className="text-right">
                            Documented times slots
                        </TableHead>
                        <TableHead className="text-right">
                            Payout-size optimum, monthly net (credit-free)
                        </TableHead>
                        <TableHead className="text-right">
                            Payout-size optimum, credit-inclusive
                        </TableHead>
                        <TableHead className="text-right">
                            Optimum request
                        </TableHead>
                        <TableHead className="text-right">
                            Optimum times slots
                        </TableHead>
                        <TableHead className="text-right">
                            Rank, documented
                        </TableHead>
                        <TableHead className="text-right">
                            Rank, optimum
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {model.rows.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell>
                                {row.plan}
                                {row.policySensitiveNote !== null && (
                                    <span className="block text-xs text-amber-400">
                                        {row.policySensitiveNote}
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.activeSlots}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.documented.creditFree}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                                {row.documented.creditInclusive}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.documented.requestSize}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.documented.totalCreditFree}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.optimum.creditFree}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                                {row.optimum.creditInclusive}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.optimum.requestSize}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.optimum.totalCreditFree}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.rankDocumented}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.rankOptimum}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <div className="flex flex-col gap-2">
                {model.rows.map((row) => (
                    <p className="text-xs text-muted-foreground" key={row.key}>
                        {row.plan}: {row.labels.startBasis}, {row.labels.trials}
                        ; {row.labels.retainedCushion};{' '}
                        {row.labels.payoutPolicy}; {row.labels.lifetimeCapBasis}
                        . {row.labels.creditBasis}
                    </p>
                ))}
            </div>
            {model.rows.some((row) => row.liveTransferNotes.length > 0) && (
                <ul
                    aria-label="Live-transfer and payout-trigger assumptions behind the figures"
                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                >
                    {model.rows.flatMap((row) =>
                        row.liveTransferNotes.map((note) => (
                            <li key={`${row.key}-${note}`}>
                                {row.plan}: {note}
                            </li>
                        )),
                    )}
                </ul>
            )}
            {model.refused.length > 0 && (
                <ul
                    aria-label="Runs the engine refused"
                    className="flex list-disc flex-col gap-1 pl-5 text-sm text-destructive"
                >
                    {model.refused.map((refusal) => (
                        <li key={refusal.key}>
                            {refusal.plan}, {refusal.run}: {refusal.reason}
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
