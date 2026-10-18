'use client';

import { useMemo } from 'react';

import { StatStrip } from '~/components/StatStrip';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import {
    formatCurrency,
    formatPercent,
    formatWholeOrCentsCurrency,
} from '~/lib/format';
import { type SimInputs, type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { NO_PASS_REASON } from './missingReasons';
import { resilienceFigures, type ResilienceRow } from './resilienceModel';
import { ValueOrMissing } from './ValueOrMissing';

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
    const bufferClass = buffer >= 0 ? 'text-success' : 'text-destructive';

    return (
        <div className="app-prop-calculator__resilience flex flex-col gap-4">
            <StatStrip
                items={[
                    {
                        caption: 'consecutive losses before bust',
                        id: 'loss-tolerance',
                        label: 'Loss tolerance',
                        value: data.lossToler,
                    },
                    {
                        caption: 'from simulation',
                        id: 'p95-worst-streak',
                        label: 'P95 worst streak',
                        value: data.p95,
                    },
                    {
                        caption: (
                            <span className={bufferClass}>
                                {buffer >= 0 ? 'safe margin' : 'at risk'}
                            </span>
                        ),
                        id: 'buffer',
                        label: 'Buffer',
                        value: (
                            <span className={bufferClass}>
                                {buffer >= 0 ? `+${buffer}` : buffer}
                            </span>
                        ),
                    },
                ]}
            />

            <ResilienceTable rows={data.rows} />

            {data.p95 > 0 && (
                <p className="m-0 text-xs text-muted-foreground">
                    To survive your P95 worst streak ({data.p95} losses), max
                    safe risk is{' '}
                    <span className="font-mono font-semibold text-foreground">
                        {formatWholeOrCentsCurrency(data.safeRisk)}
                    </span>{' '}
                    ({data.safeRiskPct.toFixed(2)}% of account).
                </p>
            )}
        </div>
    );
}

function ResilienceTable({ rows }: { rows: readonly ResilienceRow[] }) {
    const hasProbability = rows.some((row) => row.prob !== null);
    const columns = useMemo<DataTableColumn<ResilienceRow>[]>(
        () => [
            {
                accessorFn: (r) => r.n,
                cell: ({ row }) => (
                    <span>
                        {row.original.n} in a row
                        {row.original.isTolerance && (
                            <span className="ml-1 text-xs text-muted-foreground">
                                (bust limit)
                            </span>
                        )}
                    </span>
                ),
                header: 'Streak',
                id: 'streak',
                meta: { isRowHeader: true },
            },
            ...(hasProbability
                ? [
                      {
                          accessorFn: (r) => r.prob ?? undefined,
                          cell: ({ row }) => (
                              <ValueOrMissing
                                  reason={NO_PASS_REASON}
                                  value={
                                      row.original.prob === null
                                          ? null
                                          : formatPercent(row.original.prob)
                                  }
                              />
                          ),
                          header: 'P(occurs in eval)',
                          id: 'prob',
                          sortUndefined: 'last',
                      } satisfies DataTableColumn<ResilienceRow>,
                  ]
                : []),
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
        [hasProbability],
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
