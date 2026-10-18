'use client';

import { useCallback, useMemo } from 'react';

import { useBankrollVariant } from '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant';
import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { toolsWorkerPendingText } from '~/app/(app)/prop-calculator/_components/value/valueCardsModel';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { ToolSectionHeading } from '~/components/ToolSectionHeading';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Card } from '~/components/ui/card';
import { DataTable } from '~/components/ui/data-table';
import { formatGateCurrency, formatPercent } from '~/lib/format';
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
    const pendingText = toolsWorkerPendingText(worker.state);

    return (
        <section
            aria-labelledby="take-profit-what-if-heading"
            className="flex flex-col gap-4"
        >
            <ToolSectionHeading id="take-profit-what-if-heading">
                Take-profit what-if
            </ToolSectionHeading>
            <Card className="gap-4 p-5">
                <p className="text-xs text-muted-foreground">
                    What-if only: the win rate at each reward multiple is
                    derived from your stated point, never used by the headline,
                    the rulebook or advice.
                </p>
                {rows === null ? (
                    failureReason === null ? (
                        pendingText === null ? null : (
                            <p
                                className="text-xs text-muted-foreground"
                                role="status"
                            >
                                {pendingText}
                            </p>
                        )
                    ) : (
                        <Alert variant="destructive">
                            <AlertDescription>{failureReason}</AlertDescription>
                        </Alert>
                    )
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
                                        {formatGateCurrency(
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
                                        {formatGateCurrency(row.expectedNet)}
                                    </span>
                                ),
                                header: 'Cycle net',
                                id: TakeProfitColumn.CycleNet,
                            },
                            {
                                cell: ({ row: { original: row } }) => (
                                    <Badge
                                        variant={
                                            row.isAnchor ? 'success' : 'warning'
                                        }
                                    >
                                        {row.label}
                                    </Badge>
                                ),
                                header: 'Note',
                                id: TakeProfitColumn.Note,
                            },
                        ]}
                        data={[...rows]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => String(row.rrRatio)}
                    />
                )}
            </Card>
        </section>
    );
}
