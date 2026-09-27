'use client';

import { useState } from 'react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { NOT_APPLICABLE } from '~/lib/format';
import { cn } from '~/lib/utilities';

import { MonthlyPayoutChart } from './MonthlyPayoutChart';
import { type StatementCardModel } from './overviewModel';
import { PurchaseCohortsView } from './PurchaseCohortsView';

enum StatementView {
    ByPurchaseCohort = 'by-purchase-cohort',
    CashByMonth = 'cash-by-month',
}

export function StatementCard({
    model,
}: {
    readonly model: StatementCardModel;
}) {
    const [view, setView] = useState(StatementView.CashByMonth);
    return model.months.length === 0 ? (
        <p className="text-sm text-muted-foreground">
            No fee, payout or event recorded yet.
        </p>
    ) : (
        <div className="flex flex-col gap-3">
            <MonthlyPayoutChart
                points={model.chart}
                targetDollars={model.targetDollars}
            />
            <div className="flex gap-2">
                <ViewButton
                    active={view === StatementView.CashByMonth}
                    onClick={() => {
                        setView(StatementView.CashByMonth);
                    }}
                >
                    Cash by month
                </ViewButton>
                <ViewButton
                    active={view === StatementView.ByPurchaseCohort}
                    onClick={() => {
                        setView(StatementView.ByPurchaseCohort);
                    }}
                >
                    By purchase cohort
                </ViewButton>
            </div>
            {view === StatementView.ByPurchaseCohort ? (
                <PurchaseCohortsView rows={model.purchaseCohorts} />
            ) : (
                <CashByMonthTable model={model} />
            )}
            <p className="text-xs text-muted-foreground">{model.caveat}</p>
        </div>
    );
}

function CashByMonthTable({
    model,
}: {
    readonly model: StatementCardModel;
}) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">
                        Payouts received
                    </TableHead>
                    <TableHead className="text-right">Payout count</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">
                        Cumulative net
                    </TableHead>
                    <TableHead className="text-right">Multiple</TableHead>
                    <TableHead className="text-right">
                        Trailing 3-month multiple
                    </TableHead>
                    <TableHead className="text-right">Growth</TableHead>
                    <TableHead>Meets target</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {model.months.map((row) => (
                    <TableRow key={row.key}>
                        <TableCell className="tabular-nums">
                            {row.month}
                            {row.isPartial && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                    (partial)
                                </span>
                            )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.spend}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.payouts}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.payoutCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.net}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.cumulativeNet}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.multiple}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.trailingThreeMonthMultiple}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.payoutGrowth}
                        </TableCell>
                        <TableCell>
                            {meetsTargetLabel(
                                row.meetsPayoutTarget,
                                row.meetsMultipleTarget,
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function meetsTargetLabel(
    meetsPayoutTarget: boolean | null,
    meetsMultipleTarget: boolean | null,
): string {
    if (meetsPayoutTarget === null && meetsMultipleTarget === null) {
        return NOT_APPLICABLE;
    }
    const wasMet = (meetsPayoutTarget ?? true) && (meetsMultipleTarget ?? true);
    return wasMet ? 'Yes' : 'No';
}

function ViewButton({
    active,
    children,
    onClick,
}: {
    readonly active: boolean;
    readonly children: string;
    readonly onClick: () => void;
}) {
    return (
        <button
            aria-pressed={active}
            className={cn(
                'rounded-md px-3 py-1 text-sm font-medium',
                active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-white',
            )}
            onClick={onClick}
            type="button"
        >
            {children}
        </button>
    );
}
