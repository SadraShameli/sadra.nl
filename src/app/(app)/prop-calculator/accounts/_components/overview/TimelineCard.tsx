import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type TimelineCardModel } from './overviewModel';

export function TimelineCard({ model }: { readonly model: TimelineCardModel }) {
    if (model.entries.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No fee, payout or event recorded yet.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Entry</TableHead>
                        <TableHead className="text-right">Cash</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {model.entries.map((row) => (
                        <TableRow key={row.key}>
                            <TableCell className="tabular-nums">
                                {row.on}
                            </TableCell>
                            <TableCell>{row.account}</TableCell>
                            <TableCell>{row.description}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.amount}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
                Cash you received shows as positive and cash you spent as
                negative. A payout that is not paid moved no cash.
            </p>
            {model.hiddenEntries > 0 && (
                <p className="text-xs text-muted-foreground">
                    Showing the newest {model.entries.length} entries;{' '}
                    {model.hiddenEntries} older{' '}
                    {model.hiddenEntries === 1 ? 'entry is' : 'entries are'} not
                    shown here.
                </p>
            )}
        </div>
    );
}
