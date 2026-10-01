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
    type RiskCandidateRowView,
    type RiskCandidatesView,
} from './adviceValueModel';

export const DOCUMENTED_RUNG_MARK = 'Documented rung';

export const ENGINE_OPTIMUM_MARK = 'Engine optimum for this one step';

const DOCUMENTED_RUNG_STAYS_TEXT =
    'The documented rung stays your plan: this table compares one trade and does not change it.';

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
            <p className="text-sm text-muted-foreground">
                {DOCUMENTED_RUNG_STAYS_TEXT}
            </p>
            {view.sizingNote !== null && (
                <p className="text-sm text-muted-foreground">
                    {view.sizingNote}
                </p>
            )}
            <Table>
                <TableHeader>
                    <TableRow>
                        {view.isRanked && <TableHead>Rank</TableHead>}
                        <TableHead className="text-right">Risk</TableHead>
                        <TableHead className="text-right">Contracts</TableHead>
                        <TableHead className="text-right">
                            Continuation value (with credit)
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
                            {view.isRanked && <TableCell>{row.rank}</TableCell>}
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
                                {rowMarksOf(row, view.isRanked).join('; ')}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function rowMarksOf(
    row: RiskCandidateRowView,
    isRanked: boolean,
): readonly string[] {
    return [
        ...(row.isDocumented ? [DOCUMENTED_RUNG_MARK] : []),
        ...(!isRanked && row.isEngineOptimum ? [ENGINE_OPTIMUM_MARK] : []),
    ];
}
