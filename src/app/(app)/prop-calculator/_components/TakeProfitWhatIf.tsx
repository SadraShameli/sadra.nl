'use client';

import { useCallback, useMemo } from 'react';

import { useBankrollVariant } from '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant';
import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { DataTable } from '~/components/ui/data-table';
import { formatPercent, formatWholeOrCentsCurrency } from '~/lib/format';
import { stableJson } from '~/lib/stableJson';

import {
    defaultTakeProfitWhatIfInputs,
    takeProfitWhatIfRequest,
    takeProfitWhatIfRowViews,
} from './takeProfitWhatIfModel';

enum TakeProfitColumn {
    CycleNet = 'cycle-net',
    DaysToPass = 'days-to-pass',
    MonthlyNet = 'monthly-net',
    Note = 'note',
    PassProbability = 'pass-probability',
    Rr = 'rr',
    WinRate = 'win-rate',
}

export default function TakeProfitWhatIf() {
    const { state: calculatorState } = useCalculatorInputs();
    const { variant } = useBankrollVariant();
    const cardInputs = useMemo(
        () => defaultTakeProfitWhatIfInputs(calculatorState.rrRatio),
        [calculatorState.rrRatio],
    );

    const requestKey = stableJson({ cardInputs, variant });
    const debouncedRequestKey = useDebouncedValue(requestKey, SIM_DEBOUNCE_MS);
    const buildRequest = useCallback(
        (runId: number) => takeProfitWhatIfRequest(variant, cardInputs, runId),
        [cardInputs, variant],
    );
    const worker = useToolsRequest(debouncedRequestKey, buildRequest);

    const rows =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.TakeProfitRows
            ? takeProfitWhatIfRowViews(
                  worker.state.result.rows,
                  cardInputs.anchorRrRatio,
              )
            : null;
    const failureReason =
        worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;
    const isComputing =
        worker.state.phase === ToolsWorkerPhase.Running ||
        requestKey !== debouncedRequestKey;

    return (
        <section aria-labelledby="take-profit-what-if-heading">
            <ToolPanel
                description="What-if only: the win rate at each reward multiple is derived from your stated point, never used by the headline, the rulebook or advice."
                isComputing={isComputing}
                title="Take-profit what-if"
                titleId="take-profit-what-if-heading"
            >
                {rows === null && failureReason !== null ? (
                    <Alert variant="destructive">
                        <AlertDescription>{failureReason}</AlertDescription>
                    </Alert>
                ) : (
                    <DataTable
                        columns={[
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        {row.rrRatio.toFixed(2)}
                                    </span>
                                ),
                                header: 'RR',
                                id: TakeProfitColumn.Rr,
                                meta: { isRowHeader: true },
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        {formatPercent(row.winrate)}
                                    </span>
                                ),
                                header: 'Win rate',
                                id: TakeProfitColumn.WinRate,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        {formatPercent(
                                            row.attemptPassProbability,
                                        )}
                                    </span>
                                ),
                                header: 'P(pass)',
                                id: TakeProfitColumn.PassProbability,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        {row.daysToPassP50.toFixed(0)}
                                    </span>
                                ),
                                header: 'Days to pass',
                                id: TakeProfitColumn.DaysToPass,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        {formatWholeOrCentsCurrency(
                                            row.expectedMonthlyNet,
                                        )}
                                    </span>
                                ),
                                header: 'Monthly net',
                                id: TakeProfitColumn.MonthlyNet,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <span className="font-mono">
                                        {formatWholeOrCentsCurrency(
                                            row.expectedNet,
                                        )}
                                    </span>
                                ),
                                header: 'Cycle net',
                                id: TakeProfitColumn.CycleNet,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <Badge>{row.label}</Badge>
                                ),
                                header: 'Note',
                                id: TakeProfitColumn.Note,
                            },
                        ]}
                        data={rows === null ? [] : [...rows]}
                        isCurrentRow={(row) => row.isAnchor}
                        isLoading={rows === null}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => String(row.rrRatio)}
                    />
                )}
            </ToolPanel>
        </section>
    );
}
