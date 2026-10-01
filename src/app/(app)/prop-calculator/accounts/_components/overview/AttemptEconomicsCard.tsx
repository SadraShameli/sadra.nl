import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type AttemptEconomicsCardModel } from './overviewModel';

export function AttemptEconomicsCard({
    model,
}: {
    readonly model: AttemptEconomicsCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No account with a modeled plan yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">Attempts</TableHead>
                        <TableHead className="text-right">
                            Attempt cost
                        </TableHead>
                        <TableHead className="text-right">Pass rate</TableHead>
                        <TableHead className="text-right">
                            Payout rate
                        </TableHead>
                        <TableHead className="text-right">
                            Payouts per paid funded
                        </TableHead>
                        <TableHead className="text-right">
                            Average payout
                        </TableHead>
                        <TableHead className="text-right">
                            Funded value
                        </TableHead>
                        <TableHead className="text-right">
                            Breakeven pass rate
                        </TableHead>
                        <TableHead className="text-right">
                            Realized EV per attempt
                        </TableHead>
                        <TableHead className="text-right">
                            Modeled EV per attempt
                        </TableHead>
                        <TableHead className="text-right">
                            Modeled pass rate
                        </TableHead>
                        <TableHead className="text-right">
                            Modeled payout rate
                        </TableHead>
                        <TableHead className="text-right">
                            Modeled payouts per paid funded
                        </TableHead>
                        <TableHead className="text-right">
                            Modeled funded value
                        </TableHead>
                        <TableHead className="text-right">
                            Margin above breakeven
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {model.rows.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell>{row.plan}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.attempts}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.attemptCost}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.passRate}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.payoutRate}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.payoutsPerPaidFunded}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.averagePayout}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.fundedValue}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.breakevenPassRate}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.realizedEvPerAttempt}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                                {row.modeledEvPerAttempt}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                                {row.modeledPassRate}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                                {row.modeledPayoutRate}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                                {row.modeledPayoutsPerPaidFunded}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                                {row.modeledFundedValue}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.marginAboveBreakeven}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
                Realized EV per attempt: ignores time.
            </p>
            <p className="text-xs text-muted-foreground">
                Modeled EV per attempt: the engine&apos;s credit-free net per
                attempt; it ignores time and is not the ranking objective.
            </p>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
}
