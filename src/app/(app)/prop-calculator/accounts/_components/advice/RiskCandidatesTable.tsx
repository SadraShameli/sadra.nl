import { uncertainCurrencyText } from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { formatGateCurrency } from '~/lib/format';

import {
    CANDIDATE_VALUE_BASIS_TEXT,
    type RiskCandidatesView,
} from './adviceValueModel';

export const DOCUMENTED_RUNG_MARK = 'Documented rung';

export function RiskCandidatesTable({
    view,
}: {
    readonly view: RiskCandidatesView;
}) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
                {view.label}; {CANDIDATE_VALUE_BASIS_TEXT}.
            </p>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead className="text-right">Risk</TableHead>
                        <TableHead className="text-right">Contracts</TableHead>
                        <TableHead className="text-right">
                            Continuation value
                        </TableHead>
                        <TableHead className="text-right">
                            Net of duration charge
                        </TableHead>
                        <TableHead>Note</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {view.rows.map((row) => (
                        <TableRow key={row.rank}>
                            <TableCell>{row.rank}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.risk.text}
                                <span className="sr-only"> ({row.risk.label})</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {row.contractsText ?? ''}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {uncertainCurrencyText(row.continuation)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {formatGateCurrency(row.netOfDurationCharge)}
                            </TableCell>
                            <TableCell>
                                {row.isDocumented ? DOCUMENTED_RUNG_MARK : ''}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
