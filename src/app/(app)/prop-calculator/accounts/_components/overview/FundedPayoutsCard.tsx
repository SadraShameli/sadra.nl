import { Fragment } from 'react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type FundedPayoutsCardModel } from './overviewModel';

export function FundedPayoutsCard({
    model,
}: {
    readonly model: FundedPayoutsCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No funded account yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Plan</TableHead>
                        {Array.from(
                            { length: model.payoutCountCap + 1 },
                            (_, k) => (
                                <TableHead className="text-right" key={k}>
                                    {k === model.payoutCountCap
                                        ? `${String(k)}+`
                                        : String(k)}
                                </TableHead>
                            ),
                        )}
                        <TableHead className="text-right">Too young</TableHead>
                        <TableHead className="text-right">
                            Realized funded value
                        </TableHead>
                        <TableHead className="text-right">
                            Modeled funded value
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {model.rows.map((row) => (
                        <Fragment key={row.key}>
                            <TableRow>
                                <TableCell>{row.plan}</TableCell>
                                {row.counts.map((count, index) => (
                                    <TableCell
                                        className="text-right tabular-nums"
                                        key={index}
                                    >
                                        {count}
                                    </TableCell>
                                ))}
                                <TableCell className="text-right tabular-nums">
                                    {row.openAccounts}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.realizedFundedValue}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground tabular-nums">
                                    {row.modeledFundedValue}
                                    {row.fundedValueFlag !== null && (
                                        <span className="block text-xs text-amber-400">
                                            {row.fundedValueFlag}
                                        </span>
                                    )}
                                </TableCell>
                            </TableRow>
                            {row.modeledCounts !== null && (
                                <TableRow className="text-muted-foreground">
                                    <TableCell>
                                        {row.plan} (modeled share)
                                    </TableCell>
                                    {row.modeledCounts.map((share, index) => (
                                        <TableCell
                                            className="text-right tabular-nums"
                                            key={index}
                                        >
                                            {share}
                                        </TableCell>
                                    ))}
                                    <TableCell />
                                    <TableCell />
                                    <TableCell />
                                </TableRow>
                            )}
                        </Fragment>
                    ))}
                </TableBody>
            </Table>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
}
