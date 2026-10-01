import CashFlowBandChartView from '~/app/(app)/prop-calculator/_components/charts/CashFlowBandChartView';
import { SimulationFailureNotice } from '~/app/(app)/prop-calculator/_components/SimulationFailureNotice';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import {
    ExpectedNetStatus,
    type ProjectionCardModel,
    type ProjectionRow,
} from './overviewModel';

export function ProjectionCard({
    model,
}: {
    readonly model: ProjectionCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {model.statusNote ?? 'No plan to project yet.'}
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-4">
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
                        <TableHead>Accounts</TableHead>
                        <TableHead className="text-right">
                            Final net, P10
                        </TableHead>
                        <TableHead className="text-right">
                            Final net, median
                        </TableHead>
                        <TableHead className="text-right">
                            Final net, P90
                        </TableHead>
                        <TableHead className="text-right">
                            Median spend
                        </TableHead>
                        <TableHead className="text-right">
                            Median payouts
                        </TableHead>
                        <TableHead className="text-right">
                            Chance the final net is negative
                        </TableHead>
                        <TableHead className="text-right">
                            Chance of ever being cash-positive
                        </TableHead>
                        <TableHead>Break-even month</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {model.rows.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell>{row.plan}</TableCell>
                            <TableCell>{row.accounts}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.finalNet.p10}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.finalNet.p50}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.finalNet.p90}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.finalSpendMedian}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.finalPayoutMedian}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.probabilityFinalNetNegative}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.probabilityEverPositive}
                            </TableCell>
                            <TableCell>{row.breakEvenMonth}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {model.rows.map((row) => (
                <ProjectionDetail key={row.key} row={row} />
            ))}
            {model.refused.map((refusal) => (
                <SimulationFailureNotice
                    key={refusal.key}
                    message={`${refusal.plan}: ${refusal.reason}`}
                />
            ))}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
}

function ProjectionDetail({ row }: { readonly row: ProjectionRow }) {
    return (
        <div className="flex flex-col gap-2">
            {row.result !== null && (
                <>
                    <p className="text-sm font-medium text-white">
                        {row.plan}: net cash by month, P10 to P90 band and
                        median
                    </p>
                    <CashFlowBandChartView result={row.result} />
                </>
            )}
            <p className="text-xs text-muted-foreground">
                {row.plan}: {row.labels.startBasis}; {row.labels.trials};{' '}
                {row.labels.horizon}; {row.labels.retainedCushion};{' '}
                {row.labels.payoutPolicy}; {row.labels.lifetimeCapBasis};{' '}
                {row.labels.tradesPerDay}. {row.labels.creditBasis}
            </p>
            {row.notHonoured.length > 0 && (
                <ul
                    aria-label={`Policy fields the timeline does not honour for ${row.plan}`}
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-amber-400"
                >
                    {row.notHonoured.map((text) => (
                        <li key={text}>{text}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
