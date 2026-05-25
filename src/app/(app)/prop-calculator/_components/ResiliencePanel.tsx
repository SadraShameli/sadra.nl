'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import { Alert } from '~/components/ui/Alert';
import { Card, CardContent } from '~/components/ui/Card';
import { DataTable } from '~/components/ui/DataTable';
import InfoPopover from '~/components/ui/InfoPopover';
import { formatCurrency, formatPercent } from '~/lib/format';
import { type Plan, type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { panelDescriptions } from './kpiDescriptions';
import { probStreakAtLeast } from './lab/labMath';

interface ResiliencePanelProps {
    plan: Plan;
    result: SimOutputs;
    riskPerTrade: number;
    winrate: number;
}

interface ResilienceRow {
    damage: number;
    isTolerance: boolean;
    n: number;
    prob: number;
    survives: boolean;
}

const BASE_STREAKS = [3, 4, 5, 6, 7, 8, 10] as const;

export default function ResiliencePanel({
    plan,
    result,
    riskPerTrade,
    winrate,
}: ResiliencePanelProps) {
    const data = useMemo(() => {
        const dd = plan.drawdown.amount;
        const accountSize = plan.accountSize;
        const lossToler = riskPerTrade > 0 ? Math.floor(dd / riskPerTrade) : 0;
        const p95 = Math.round(result.maxLosingStreakP95);
        const q = 1 - winrate;
        const K = Math.round(
            result.tradesPerSuccessfulAttempt * result.expectedAttempts,
        );

        const streaks = [...BASE_STREAKS] as number[];
        if (lossToler > 0 && lossToler <= 20 && !streaks.includes(lossToler)) {
            streaks.push(lossToler);
            streaks.sort((a, b) => a - b);
        }

        const rows = streaks.map((n) => ({
            damage: Math.min(n * riskPerTrade, dd),
            isTolerance: n === lossToler,
            n,
            prob: probStreakAtLeast(K, n, q),
            survives: n * riskPerTrade <= dd,
        }));

        const safeRisk = p95 > 0 ? dd / p95 : 0;
        const safeRiskPct =
            accountSize > 0 ? (safeRisk / accountSize) * 100 : 0;

        return { lossToler, p95, rows, safeRisk, safeRiskPct };
    }, [plan, result, winrate, riskPerTrade]);

    const buffer = data.lossToler - data.p95;

    return (
        <Card className={cn('app-prop-calculator__resilience', 'px-5 py-4')}>
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                    Streak &amp; Drawdown Resilience
                </h3>
                <InfoPopover title="Streak & drawdown resilience">
                    {panelDescriptions.resilience}
                </InfoPopover>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                        {formatCurrency(data.safeRisk)}
                    </span>{' '}
                    ({data.safeRiskPct.toFixed(2)}% of account).
                </p>
            )}
        </Card>
    );
}

function ResilienceTable({ rows }: { rows: ResilienceRow[] }) {
    const columns = useMemo<ColumnDef<ResilienceRow>[]>(
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
                accessorFn: (r) => r.prob,
                cell: ({ row }) => formatPercent(row.original.prob),
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
        <DataTable<ResilienceRow, unknown>
            columns={columns}
            data={rows}
            pageSize={null}
            rowClassName={(r) =>
                cn(
                    !r.survives &&
                        r.prob > 0.05 &&
                        'bg-rose-500/10 text-rose-400',
                    !r.survives && r.prob <= 0.05 && 'text-amber-400',
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
