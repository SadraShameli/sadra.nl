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
import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Card } from '~/components/ui/Card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { formatGateCurrency, formatPercent } from '~/lib/format';
import { stableJson } from '~/lib/stableJson';

import {
    defaultTakeProfitWhatIfInputs,
    takeProfitWhatIfRequest,
    takeProfitWhatIfRowViews,
} from './takeProfitWhatIfModel';

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
            <h2
                className="text-lg font-semibold tracking-tight text-foreground"
                id="take-profit-what-if-heading"
            >
                Take-profit what-if
            </h2>
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
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>RR</TableHead>
                                <TableHead>Win rate</TableHead>
                                <TableHead>P(pass)</TableHead>
                                <TableHead>Days to pass</TableHead>
                                <TableHead>Monthly net</TableHead>
                                <TableHead>Cycle net</TableHead>
                                <TableHead>Note</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="font-mono">
                            {rows.map((row) => (
                                <TableRow key={row.rrRatio}>
                                    <TableCell>
                                        {row.rrRatio.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        {formatPercent(row.winrate)}
                                    </TableCell>
                                    <TableCell>
                                        {formatPercent(
                                            row.attemptPassProbability,
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {row.daysToPassP50.toFixed(0)}
                                    </TableCell>
                                    <TableCell>
                                        {formatGateCurrency(
                                            row.expectedMonthlyNet,
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {formatGateCurrency(row.expectedNet)}
                                    </TableCell>
                                    <TableCell className="font-sans">
                                        <Badge
                                            variant={
                                                row.isAnchor
                                                    ? 'success'
                                                    : 'warning'
                                            }
                                        >
                                            {row.label}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
        </section>
    );
}
