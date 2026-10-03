import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import {
    type PayoutTimingCardModel,
    type PayoutTimingFigure,
} from './payoutTimingModel';
import { SampleBadge } from './SampleBadge';

const PAYOUT_TIMING_LABEL = 'Payout timing per plan';

export function PayoutTimingCard({
    model,
}: {
    readonly model: PayoutTimingCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No plan to time yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">{model.explanation}</p>
            <Table
                containerProps={{
                    'aria-label': PAYOUT_TIMING_LABEL,
                    role: 'region',
                    tabIndex: 0,
                }}
            >
                <TableHeader>
                    <TableRow>
                        <TableHead>Plan</TableHead>
                        <TableHead>Funded to first payout</TableHead>
                        <TableHead>Between later payouts</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {model.rows.map((row) => (
                        <TableRow key={row.key}>
                            <TableHead className="h-auto py-2" scope="row">
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm font-normal text-foreground">
                                        {row.plan}
                                    </span>
                                    {row.unpaidNote !== null && (
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {row.unpaidNote}
                                        </span>
                                    )}
                                </div>
                            </TableHead>
                            <TableCell className="tabular-nums">
                                <Figure figure={row.toFirstPayout} />
                            </TableCell>
                            <TableCell className="tabular-nums">
                                <Figure figure={row.betweenPayouts} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function Figure({ figure }: { readonly figure: PayoutTimingFigure }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
            {figure.mean}
            <span className="text-xs text-muted-foreground">
                SE {figure.standardError}, n = {String(figure.n)}
            </span>
            <SampleBadge level={figure.sampleLevel} />
        </span>
    );
}
