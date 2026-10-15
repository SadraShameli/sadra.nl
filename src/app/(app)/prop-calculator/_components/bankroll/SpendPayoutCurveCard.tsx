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
import {
    type ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
} from '~/components/ui/Chart';
import { Field, FieldError, FieldLabel } from '~/components/ui/Field';
import { Input } from '~/components/ui/Input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
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
import { BankrollRunStatus } from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
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

    return (
        <BankrollSection
            description="What each budget buys: whole attempts at the plan's attempt cost, priced on the same variant and seed as the cards above, every trial one attempt."
            headingId="bankroll-spend-payout-curve-heading"
            title="Spend vs payout"
        >
            <Field data-invalid={isTooMany}>
                <FieldLabel htmlFor="bankroll-curve-budgets">
                    Budgets ($, comma-separated)
                </FieldLabel>
                <Input
                    aria-invalid={isTooMany}
                    id="bankroll-curve-budgets"
                    onChange={(event) => setBudgetsText(event.target.value)}
                    placeholder="e.g. 5000, 10000, 20000"
                    value={budgetsText}
                />
                {isTooMany ? (
                    <FieldError>{TOO_MANY_BUDGETS_TEXT}</FieldError>
                ) : null}
            </Field>
            {rows === null ? (
                <BankrollRunStatus
                    isRequested={requestBudgets !== null}
                    state={worker.state}
                />
            ) : (
                <>
                    <CurveChart rows={rows} />
                    <CurveTable rows={rows} />
                </>
            )}
        </BankrollSection>
    );
}

function CurveChart({ rows }: { rows: readonly SpendPayoutCurveRow[] }) {
    const data = rows.flatMap((row) =>
        row.figures === null
            ? []
            : {
                  budget: row.budget,
                  expectedNet: row.figures.expectedNet,
                  expectedPayouts: row.figures.expectedPayouts,
                  expectedSpend: row.figures.expectedSpend,
                  low: row.figures.netP10,
                  range: row.figures.netP90 - row.figures.netP10,
              },
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
                <ChartLegend
                    content={<ChartLegendContent className="pt-0 pb-2" />}
                    position="top"
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
        <Table aria-label="Spend and payout per budget">
            <TableHeader>
                <TableRow>
                    <TableHead>Budget</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Expected spend</TableHead>
                    <TableHead>Expected payouts</TableHead>
                    <TableHead>Expected net</TableHead>
                    <TableHead>Net P10</TableHead>
                    <TableHead>Net P90</TableHead>
                    <TableHead>P(net &lt; 0)</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody className="font-mono">
                {rows.map((row, index) => (
                    <TableRow key={`${String(row.budget)}-${String(index)}`}>
                        <TableCell>{formatGateCurrency(row.budget)}</TableCell>
                        {row.figures === null ? (
                            <TableCell
                                className="font-sans text-amber-400"
                                colSpan={7}
                            >
                                {NOT_APPLICABLE}
                                {row.reason === null
                                    ? ''
                                    : `: ${ECONOMICS_REASON_TEXT[row.reason]}`}
                            </TableCell>
                        ) : (
                            <>
                                <TableCell>{row.figures.attempts}</TableCell>
                                <TableCell>
                                    {formatGateCurrency(
                                        row.figures.expectedSpend,
                                    )}
                                </TableCell>
                                <TableCell>
                                    {formatGateCurrency(
                                        row.figures.expectedPayouts,
                                    )}
                                </TableCell>
                                <TableCell>
                                    {formatGateCurrency(
                                        row.figures.expectedNet,
                                    )}
                                </TableCell>
                                <TableCell>
                                    {formatGateCurrency(row.figures.netP10)}
                                </TableCell>
                                <TableCell>
                                    {formatGateCurrency(row.figures.netP90)}
                                </TableCell>
                                <TableCell>
                                    {row.figures
                                        .lossProbabilityStandardError === null
                                        ? formatPercent(
                                              row.figures.lossProbability,
                                          )
                                        : `${formatPercent(row.figures.lossProbability)} (SE ${formatPercent(row.figures.lossProbabilityStandardError)})`}
                                </TableCell>
                            </>
                        )}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
