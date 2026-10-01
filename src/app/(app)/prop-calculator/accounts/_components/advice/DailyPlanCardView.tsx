import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { formatCurrency } from '~/lib/format';

import { type DailyPlanCardViewModel } from './adviceViewModel';

export function DailyPlanCardView({
    card,
}: {
    readonly card: DailyPlanCardViewModel;
}) {
    return (
        <div className="flex flex-col gap-2">
            {card.rungs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No trade is placeable today.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Trade</TableHead>
                            <TableHead className="text-right">Risk</TableHead>
                            <TableHead className="text-right">
                                Take profit
                            </TableHead>
                            <TableHead className="text-right">
                                Running loss after
                            </TableHead>
                            <TableHead>Capped by</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {card.rungs.map((rung, index) => (
                            <TableRow key={String(index)}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatCurrency(rung.risk, 2)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatCurrency(rung.takeProfit, 2)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatCurrency(rung.runningLossAfter, 2)}
                                </TableCell>
                                <TableCell>
                                    {rung.cappedByText.join(', ')}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <p className="text-sm">
                {card.stopReasonText}
                {card.stopCappedByText.length > 0 &&
                    ` (${card.stopCappedByText.join(', ')})`}
            </p>
        </div>
    );
}
