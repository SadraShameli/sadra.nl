import { Fragment } from 'react';

import AccountsPassedDistributionChart from '~/app/(app)/prop-calculator/_components/AccountsPassedDistributionChart';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type FundedPayoutsCardModel } from './overviewModel';

const PAYOUT_COUNT_CAPTION = '# payouts per funded account';

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
            <div className="flex flex-col gap-4">
                {model.rows.map((row) => (
                    <DistributionPair key={row.key} row={row} />
                ))}
            </div>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
}

function DistributionPair({
    row,
}: {
    readonly row: FundedPayoutsCardModel['rows'][number];
}) {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-white">
                {row.plan}: payout-count distribution
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
                {row.realizedProbabilities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No fully observed funded account yet, so there is no
                        realized distribution.
                    </p>
                ) : (
                    <AccountsPassedDistributionChart
                        caption={`${PAYOUT_COUNT_CAPTION}, realized`}
                        distribution={[...row.realizedProbabilities]}
                        halfThreshold={false}
                    />
                )}
                {row.modeledProbabilities === null ? (
                    <p className="text-sm text-muted-foreground">
                        The modeled distribution is pending the engine cards.
                    </p>
                ) : (
                    <AccountsPassedDistributionChart
                        caption={`${PAYOUT_COUNT_CAPTION}, modeled`}
                        distribution={[...row.modeledProbabilities]}
                        halfThreshold={false}
                    />
                )}
            </div>
        </div>
    );
}
