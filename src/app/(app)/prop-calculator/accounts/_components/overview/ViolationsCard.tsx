import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { NOT_APPLICABLE } from '~/lib/format';
import { ruleViolationKindLabel } from '~/lib/prop-accounts';

import { type ViolationsCardModel } from './overviewModel';

export function ViolationsCard({
    model,
}: {
    readonly model: ViolationsCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.byKind.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No rule violations recorded yet.
                </p>
            ) : (
                <>
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                        <div className="contents">
                            <dt className="text-muted-foreground">
                                Total cost
                            </dt>
                            <dd className="tabular-nums">
                                {model.netCost}
                            </dd>
                        </div>
                        <div className="contents">
                            <dt className="text-muted-foreground">
                                Share of net cash
                            </dt>
                            <dd className="tabular-nums">
                                {model.netCostShareOfNetCash ??
                                    NOT_APPLICABLE}
                            </dd>
                        </div>
                        <div className="contents">
                            <dt className="text-muted-foreground">
                                Logged by you
                            </dt>
                            <dd className="tabular-nums">
                                {model.manualCount}
                            </dd>
                        </div>
                        <div className="contents">
                            <dt className="text-muted-foreground">
                                Detected from your journal
                            </dt>
                            <dd className="tabular-nums">
                                {model.detectedCount}
                            </dd>
                        </div>
                    </dl>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Kind</TableHead>
                                <TableHead className="text-right">
                                    Count
                                </TableHead>
                                <TableHead className="text-right">
                                    Cost
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {model.byKind.map((row) => (
                                <TableRow key={row.key}>
                                    <TableCell>
                                        {ruleViolationKindLabel(row.kind)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.count}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.cost}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </>
            )}
            {model.disclosures.map((disclosure) => (
                <p className="text-xs text-muted-foreground" key={disclosure}>
                    {disclosure}
                </p>
            ))}
        </div>
    );
}
