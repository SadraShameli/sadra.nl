import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import {
    type DiversificationCardModel,
    type FirmShareRow,
} from './overviewModel';

export function DiversificationCard({
    model,
}: {
    readonly model: DiversificationCardModel;
}) {
    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <ShareTable
                emptyMessage="No active funded or live account yet."
                rows={model.funding}
                title="Funding (active funded and live nominal)"
            />
            <ShareTable
                emptyMessage="No paid payout yet."
                rows={model.payouts}
                title="Payouts received"
            />
        </div>
    );
}

function ShareTable({
    emptyMessage,
    rows,
    title,
}: {
    readonly emptyMessage: string;
    readonly rows: readonly FirmShareRow[];
    readonly title: string;
}) {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-white">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Firm</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Share</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.firm}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.amount}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.share}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
