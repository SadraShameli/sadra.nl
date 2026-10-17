'use client';

import { useMemo } from 'react';

import { Alert } from '~/components/ui/Alert';
import { Card, CardContent } from '~/components/ui/Card';
import { DataTable, type DataTableColumn } from '~/components/ui/DataTable';
import {
    formatCurrency,
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { type SimInputs, type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { resilienceFigures, type ResilienceRow } from './resilienceModel';

interface ResiliencePanelProperties {
    baseInputs: SimInputs;
    result: SimOutputs;
}

export default function ResiliencePanel({
    baseInputs,
    result,
}: ResiliencePanelProperties) {
    const data = useMemo(
        () => resilienceFigures(baseInputs, result),
        [baseInputs, result],
    );

    const buffer = data.lossToler - data.p95;

    return (
        <Card className={cn('app-prop-calculator__resilience', 'px-5 py-4')}>
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Card className="gap-1 py-2">
                    <CardContent className="px-3">
                        <div className="text-[11px] text-muted-foreground">
                            Loss tolerance
                        </div>
                        <div className="font-mono text-xl font-bold tabular-nums">
                            {data.lossToler}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                            consecutive losses before bust
                        </div>
                    </CardContent>
                </Card>
                <Card className="gap-1 py-2">
                    <CardContent className="px-3">
                        <div className="text-[11px] text-muted-foreground">
                            P95 worst streak
                        </div>
                        <div className="font-mono text-xl font-bold tabular-nums">
                            {data.p95}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                            from simulation
                        </div>
                    </CardContent>
                </Card>
                <Alert
                    className="p-3"
                    variant={buffer >= 0 ? 'success' : 'destructive'}
                >
                    <div className="text-[11px] opacity-80">Buffer</div>
                    <div className="font-mono text-xl font-bold tabular-nums">
                        {buffer >= 0 ? `+${buffer}` : buffer}
                    </div>
                    <div className="text-[10px] opacity-80">
                        {buffer >= 0 ? 'safe margin' : 'at risk'}
                    </div>
                </Alert>
            </div>

            <ResilienceTable rows={data.rows} />

            {data.p95 > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                    To survive your P95 worst streak ({data.p95} losses), max
                    safe risk is{' '}
                    <span className="font-mono font-semibold text-foreground">
                        {formatGateCurrency(data.safeRisk)}
                    </span>{' '}
                    ({data.safeRiskPct.toFixed(2)}% of account).
                </p>
            )}
        </Card>
    );
}

function ResilienceTable({ rows }: { rows: readonly ResilienceRow[] }) {
    const columns = useMemo<DataTableColumn<ResilienceRow>[]>(
        () => [
            {
                accessorFn: (r) => r.n,
                cell: ({ row }) => (
                    <span>
                        {row.original.n} in a row
                        {row.original.isTolerance && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                                (bust limit)
                            </span>
                        )}
                    </span>
                ),
                header: 'Streak',
                id: 'streak',
            },
            {
                accessorFn: (r) => r.prob ?? -1,
                cell: ({ row }) =>
                    row.original.prob === null
                        ? NOT_APPLICABLE
                        : formatPercent(row.original.prob),
                header: 'P(occurs in eval)',
                id: 'prob',
            },
            {
                accessorFn: (r) => r.damage,
                cell: ({ row }) => formatCurrency(row.original.damage),
                header: 'Damage',
                id: 'damage',
            },
            {
                accessorFn: (r) => (r.survives ? 1 : 0),
                cell: ({ row }) => (row.original.survives ? 'Yes' : 'Bust'),
                header: 'Survive?',
                id: 'survives',
            },
        ],
        [],
    );
    return (
        <DataTable<ResilienceRow>
            columns={columns}
            data={[...rows]}
            pageSize={null}
            rowClassName={(r) =>
                cn(
                    !r.survives &&
                        (r.prob ?? 1) > 0.05 &&
                        'bg-destructive/10 text-destructive',
                    !r.survives && (r.prob ?? 1) <= 0.05 && 'text-warning',
                    r.isTolerance && 'font-semibold',
                )
            }
            rowId={(r) => String(r.n)}
            tableClassName={cn(
                'app-prop-calculator__resilience-table',
                'text-xs tabular-nums',
            )}
        />
    );
}
