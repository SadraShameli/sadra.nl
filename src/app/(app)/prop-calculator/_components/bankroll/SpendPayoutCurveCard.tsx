'use client';

import { useCallback, useMemo, useState } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    XAxis,
    YAxis,
} from 'recharts';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import {
    type SpendPayoutCurveRow,
    ToolsResponseKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { Input } from '~/components/ui/Input';
import {
    formatCompactCurrency,
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { ECONOMICS_REASON_TEXT } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';
import { cn } from '~/lib/utilities';

import {
    bankrollSpendPayoutCurveRequest,
    parseBankrollDollarCandidateList,
} from './bankrollModel';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

const MAX_BUDGETS = 10;
const TOO_MANY_BUDGETS_TEXT = `Enter at most ${String(MAX_BUDGETS)} budgets.`;

const chartConfig: ChartConfig = {
    band: { color: 'hsl(217 91% 60% / 0.18)', label: 'Net P10 to P90' },
    expectedNet: { color: 'hsl(217 91% 60%)', label: 'Expected net' },
    expectedPayouts: { color: 'hsl(142 76% 45%)', label: 'Expected payouts' },
    expectedSpend: { color: 'hsl(0 84% 60%)', label: 'Expected spend' },
};

export function SpendPayoutCurveCard() {
    const { variant } = useBankrollVariant();
    const [budgetsText, setBudgetsText] = useState('');

    const budgets = useMemo(
        () => parseBankrollDollarCandidateList(budgetsText),
        [budgetsText],
    );
    const isTooMany = budgets !== null && budgets.length > MAX_BUDGETS;
    const requestBudgets = isTooMany ? null : budgets;

    const requestKey =
        requestBudgets === null
            ? null
            : stableJson({ requestBudgets, variant });
    const buildRequest = useCallback(
        (runId: number) =>
            requestBudgets === null
                ? null
                : bankrollSpendPayoutCurveRequest(
                      variant,
                      requestBudgets,
                      runId,
                  ),
        [requestBudgets, variant],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const rows =
        requestBudgets !== null &&
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.SpendPayoutCurve
            ? worker.state.result.rows
            : null;
    const failureReason =
        requestBudgets !== null &&
        worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;

    return (
        <section
            aria-labelledby="bankroll-spend-payout-curve-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="bankroll-spend-payout-curve-heading"
            >
                Spend vs payout
            </h2>
            <p className="text-xs text-muted-foreground">
                What each budget buys: whole attempts at the plan&apos;s attempt
                cost, priced on the same variant and seed as the cards above,
                every trial one attempt.
            </p>
            <div className="flex flex-col gap-1">
                <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="bankroll-curve-budgets"
                >
                    Budgets ($, comma-separated)
                </label>
                <Input
                    aria-invalid={isTooMany}
                    id="bankroll-curve-budgets"
                    onChange={(event) => setBudgetsText(event.target.value)}
                    placeholder="e.g. 5000, 10000, 20000"
                    value={budgetsText}
                />
                {isTooMany ? (
                    <p className="text-xs text-rose-400">
                        {TOO_MANY_BUDGETS_TEXT}
                    </p>
                ) : null}
            </div>
            {rows === null ? (
                failureReason === null ? null : (
                    <p className="text-xs text-rose-400" role="alert">
                        {failureReason}
                    </p>
                )
            ) : (
                <>
                    <CurveChart rows={rows} />
                    <CurveTable rows={rows} />
                </>
            )}
        </section>
    );
}

function CurveChart({ rows }: { rows: readonly SpendPayoutCurveRow[] }) {
    const data = rows.flatMap((row) =>
        row.figures === null
            ? []
            : [
                  {
                      budget: row.budget,
                      expectedNet: row.figures.expectedNet,
                      expectedPayouts: row.figures.expectedPayouts,
                      expectedSpend: row.figures.expectedSpend,
                      low: row.figures.netP10,
                      range: row.figures.netP90 - row.figures.netP10,
                  },
              ],
    );
    if (data.length === 0) return null;
    return (
        <ChartContainer
            className={cn(
                'app-prop-calculator__bankroll-spend-payout-chart',
                'aspect-16/7 min-h-64 w-full',
            )}
            config={chartConfig}
        >
            <ComposedChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <CartesianGrid
                    opacity={0.2}
                    stroke="#ccc"
                    strokeDasharray="3 3"
                />
                <XAxis
                    axisLine={false}
                    dataKey="budget"
                    label={{
                        fontSize: 11,
                        offset: 12,
                        position: 'bottom',
                        value: 'Budget',
                    }}
                    tickFormatter={(value: number) =>
                        formatCompactCurrency(value)
                    }
                    tickLine={false}
                    tickMargin={6}
                />
                <YAxis
                    axisLine={false}
                    tickFormatter={(value: number) =>
                        formatCompactCurrency(value)
                    }
                    tickLine={false}
                    width={60}
                />
                <ReferenceLine
                    stroke="hsl(0 0% 70%)"
                    strokeDasharray="4 4"
                    y={0}
                />
                <Area
                    dataKey="low"
                    fill="transparent"
                    isAnimationActive={false}
                    legendType="none"
                    stackId="band"
                    stroke="none"
                />
                <Area
                    dataKey="range"
                    fill="hsl(217 91% 60%)"
                    fillOpacity={0.18}
                    isAnimationActive={false}
                    legendType="none"
                    stackId="band"
                    stroke="none"
                />
                <Line
                    dataKey="expectedSpend"
                    dot
                    isAnimationActive={false}
                    stroke="hsl(0 84% 60%)"
                    strokeWidth={2}
                    type="monotone"
                />
                <Line
                    dataKey="expectedPayouts"
                    dot
                    isAnimationActive={false}
                    stroke="hsl(142 76% 45%)"
                    strokeWidth={2}
                    type="monotone"
                />
                <Line
                    dataKey="expectedNet"
                    dot
                    isAnimationActive={false}
                    stroke="hsl(217 91% 60%)"
                    strokeWidth={2.5}
                    type="monotone"
                />
            </ComposedChart>
        </ChartContainer>
    );
}

function CurveTable({ rows }: { rows: readonly SpendPayoutCurveRow[] }) {
    return (
        <div className="overflow-x-auto">
            <table
                aria-label="Spend and payout per budget"
                className="w-full text-left text-xs"
            >
                <thead>
                    <tr className="text-muted-foreground">
                        <th className="py-1 pr-3">Budget</th>
                        <th className="py-1 pr-3">Attempts</th>
                        <th className="py-1 pr-3">Expected spend</th>
                        <th className="py-1 pr-3">Expected payouts</th>
                        <th className="py-1 pr-3">Expected net</th>
                        <th className="py-1 pr-3">Net P10</th>
                        <th className="py-1 pr-3">Net P90</th>
                        <th className="py-1 pr-3">P(net &lt; 0)</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr
                            className="border-t border-white/10"
                            key={`${String(row.budget)}-${String(index)}`}
                        >
                            <td className="py-1 pr-3 font-mono">
                                {formatGateCurrency(row.budget)}
                            </td>
                            {row.figures === null ? (
                                <td
                                    className="py-1 pr-3 text-amber-400"
                                    colSpan={7}
                                >
                                    {NOT_APPLICABLE}
                                    {row.reason === null
                                        ? ''
                                        : `: ${ECONOMICS_REASON_TEXT[row.reason]}`}
                                </td>
                            ) : (
                                <>
                                    <td className="py-1 pr-3 font-mono">
                                        {row.figures.attempts}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(
                                            row.figures.expectedSpend,
                                        )}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(
                                            row.figures.expectedPayouts,
                                        )}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(
                                            row.figures.expectedNet,
                                        )}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(row.figures.netP10)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {formatGateCurrency(row.figures.netP90)}
                                    </td>
                                    <td className="py-1 pr-3 font-mono">
                                        {row.figures
                                            .lossProbabilityStandardError ===
                                        null
                                            ? formatPercent(
                                                  row.figures.lossProbability,
                                              )
                                            : `${formatPercent(row.figures.lossProbability)} (SE ${formatPercent(row.figures.lossProbabilityStandardError)})`}
                                    </td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
