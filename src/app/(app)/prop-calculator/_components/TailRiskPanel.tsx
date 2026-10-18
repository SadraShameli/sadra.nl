'use client';

import { ChartNoAxesColumn } from 'lucide-react';
import { useMemo } from 'react';

import { MissingValue } from '~/components/MissingValue';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip, StatTone } from '~/components/StatStrip';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatCompactCurrency, formatPercent } from '~/lib/format';
import { type SimOutputs } from '~/lib/prop-calculator';
import { percentile } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utilities';

const NO_GAIN_SCENARIO_REASON =
    'The gain side is only measured at 10% and 25% of capital.';

interface TailRiskPanelProperties {
    result: SimOutputs;
}

interface TailRiskRow {
    gainP: null | number;
    label: string;
    lossP: number;
    threshold: number;
}

export default function TailRiskPanel({ result }: TailRiskPanelProperties) {
    const m = useMemo(() => {
        const { accountSize, finalBalances } = result;
        if (finalBalances.length === 0) return null;

        const pnls = finalBalances.map((b) => b - accountSize);
        const n = pnls.length;

        const variable95 = -percentile(pnls, 5);
        const variable99 = -percentile(pnls, 1);

        const tail95 = pnls.filter((p) => p < -variable95);
        const cvar95 =
            tail95.length > 0
                ? -(tail95.reduce((s, v) => s + v, 0) / tail95.length)
                : variable95;

        const tail99 = pnls.filter((p) => p < -variable99);
        const cvar99 =
            tail99.length > 0
                ? -(tail99.reduce((s, v) => s + v, 0) / tail99.length)
                : variable99;

        const p95gain = percentile(pnls, 95);
        const p05loss = Math.abs(percentile(pnls, 5));
        const tailRatio = p05loss > 0 ? p95gain / p05loss : Infinity;

        const lossProb = (threshold: number) =>
            pnls.filter((p) => p < -threshold).length / n;

        const lossProb10 = lossProb(accountSize * 0.1);
        const lossProb25 = lossProb(accountSize * 0.25);
        const lossProb50 = lossProb(accountSize * 0.5);

        const gainProb = (threshold: number) =>
            pnls.filter((p) => p > threshold).length / n;

        return {
            accountSize,
            cvar95,
            cvar99,
            gainProb10: gainProb(accountSize * 0.1),
            gainProb25: gainProb(accountSize * 0.25),
            lossProb10,
            lossProb25,
            lossProb50,
            tailRatio,
            var95: variable95,
            var99: variable99,
        };
    }, [result]);

    if (!m) {
        return (
            <EmptyState
                description="The run kept no final balances, so there is no tail to measure."
                icon={ChartNoAxesColumn}
                size={EmptyStateSize.Compact}
                title="No final balances"
            />
        );
    }

    const tailRatioString = Number.isFinite(m.tailRatio)
        ? m.tailRatio.toFixed(2)
        : '∞';
    const tailTone =
        m.tailRatio > 1.5
            ? StatTone.Positive
            : m.tailRatio > 1
              ? StatTone.Warning
              : StatTone.Negative;

    return (
        <div className="app-prop-calculator__tail-risk flex flex-col gap-5">
            <StatStrip
                items={[
                    {
                        caption: 'loss in 1-of-20 trials',
                        id: 'var-95',
                        label: 'VaR 95%',
                        tone: StatTone.Negative,
                        value: formatCompactCurrency(m.var95),
                    },
                    {
                        caption: 'avg loss in worst 5%',
                        id: 'cvar-95',
                        label: 'CVaR 95% (ES)',
                        tone: StatTone.Negative,
                        value: formatCompactCurrency(m.cvar95),
                    },
                    {
                        caption: 'loss in 1-of-100 trials',
                        id: 'var-99',
                        label: 'VaR 99%',
                        tone: StatTone.Negative,
                        value: formatCompactCurrency(m.var99),
                    },
                    {
                        caption: 'avg loss in worst 1%',
                        id: 'cvar-99',
                        label: 'CVaR 99% (ES)',
                        tone: StatTone.Negative,
                        value: formatCompactCurrency(m.cvar99),
                    },
                    {
                        caption: 'upside / downside tail',
                        id: 'tail-ratio',
                        label: 'Tail ratio',
                        tone: tailTone,
                        value: tailRatioString,
                    },
                ]}
            />

            <div className="flex flex-col gap-2">
                <PanelSubheading>Loss probability</PanelSubheading>
                <TailRiskTable
                    rows={[
                        {
                            gainP: m.gainProb10,
                            label: 'Lose 10% of capital',
                            lossP: m.lossProb10,
                            threshold: m.accountSize * 0.1,
                        },
                        {
                            gainP: m.gainProb25,
                            label: 'Lose 25% of capital',
                            lossP: m.lossProb25,
                            threshold: m.accountSize * 0.25,
                        },
                        {
                            gainP: null,
                            label: 'Lose 50% of capital',
                            lossP: m.lossProb50,
                            threshold: m.accountSize * 0.5,
                        },
                    ]}
                />
            </div>
        </div>
    );
}

function TailRiskTable({ rows }: { rows: TailRiskRow[] }) {
    const columns = useMemo<DataTableColumn<TailRiskRow>[]>(
        () => [
            {
                accessorFn: (r) => r.label,
                cell: ({ row }) => (
                    <span className="text-foreground">
                        {row.original.label}
                    </span>
                ),
                header: 'Scenario',
                id: 'scenario',
                meta: { isRowHeader: true },
            },
            {
                accessorFn: (r) => r.threshold,
                cell: ({ row }) => (
                    <span className="text-muted-foreground">
                        {formatCompactCurrency(row.original.threshold)}
                    </span>
                ),
                header: 'Threshold',
                id: 'threshold',
            },
            {
                accessorFn: (r) => r.lossP,
                cell: ({ row }) => {
                    const p = row.original.lossP;
                    return (
                        <span
                            className={cn(
                                'font-medium',
                                p > 0.25
                                    ? 'text-destructive'
                                    : p > 0.1
                                      ? 'text-warning'
                                      : 'text-success',
                            )}
                        >
                            {formatPercent(p)}
                        </span>
                    );
                },
                header: 'P(loss ≥ threshold)',
                id: 'lossP',
            },
            {
                accessorFn: (r) => r.gainP ?? -1,
                cell: ({ row }) => {
                    const g = row.original.gainP;
                    if (g === null) {
                        return (
                            <MissingValue reason={NO_GAIN_SCENARIO_REASON} />
                        );
                    }
                    return (
                        <span
                            className={cn(
                                g > 0.5
                                    ? 'text-success'
                                    : g > 0.25
                                      ? 'text-warning'
                                      : 'text-muted-foreground',
                            )}
                        >
                            {formatPercent(g)}
                        </span>
                    );
                },
                header: 'P(gain ≥ threshold)',
                id: 'gainP',
            },
        ],
        [],
    );
    return (
        <DataTable<TailRiskRow>
            columns={columns}
            data={rows}
            pageSize={null}
            rowId={(r) => r.label}
            tableClassName={cn(
                'app-prop-calculator__tail-risk-table',
                'text-xs tabular-nums',
            )}
        />
    );
}
