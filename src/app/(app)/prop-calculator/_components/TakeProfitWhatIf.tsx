'use client';

import { useCallback, useMemo } from 'react';

import { useBankrollVariant } from '~/app/(app)/prop-calculator/_components/bankroll/useBankrollVariant';
import { useToolsRequest } from '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest';
import { useCalculatorInputs } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { useDebouncedValue } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
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
            ? takeProfitWhatIfRowViews(worker.state.result.rows, cardInputs.anchorRrRatio)
            : null;
    const failureReason =
        worker.state.phase === ToolsWorkerPhase.Failed ? worker.state.reason : null;

    return (
        <section
            aria-labelledby="take-profit-what-if-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="take-profit-what-if-heading"
            >
                Take-profit what-if
            </h2>
            <p className="text-xs text-muted-foreground">
                What-if only: the win rate at each reward multiple is derived from your
                stated point, never used by the headline, the rulebook or advice.
            </p>
            {rows === null ? (
                failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">
                        {failureReason}
                    </p>
                )
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="text-muted-foreground">
                                <th className="py-1 pr-3">RR</th>
                                <th className="py-1 pr-3">Win rate</th>
                                <th className="py-1 pr-3">P(pass)</th>
                                <th className="py-1 pr-3">Days to pass</th>
                                <th className="py-1 pr-3">Monthly net</th>
                                <th className="py-1 pr-3">Cycle net</th>
                                <th className="py-1 pr-3">Note</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr className="border-t border-white/10" key={row.rrRatio}>
                                    <td className="py-1 pr-3 font-mono">
                                        {row.rrRatio.toFixed(2)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatPercent(row.winrate)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatPercent(row.attemptPassProbability)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {row.daysToPassP50.toFixed(0)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(row.expectedMonthlyNet)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(row.expectedNet)}
                                    </td>
                                    <td
                                        className={
                                            row.isAnchor
                                                ? 'py-1 pr-3 text-emerald-400'
                                                : 'py-1 pr-3 text-amber-400'
                                        }
                                    >
                                        {row.label}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
