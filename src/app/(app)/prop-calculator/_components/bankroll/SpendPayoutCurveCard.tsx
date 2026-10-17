'use client';

import { useCallback, useMemo, useState } from 'react';
import {
    Area,
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
    CHART_REFERENCE_LINE_PROPS,
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
} from '~/components/ui/chart';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/table';
import {
    formatCompactCurrency,
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { ECONOMICS_REASON_TEXT } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

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
    band: {
        color: 'color-mix(in oklab, var(--info) 18%, transparent)',
        label: 'Net P10 to P90',
    },
    expectedNet: { color: 'var(--info)', label: 'Expected net' },
    expectedPayouts: { color: 'var(--success)', label: 'Expected payouts' },
    expectedSpend: { color: 'var(--destructive)', label: 'Expected spend' },
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
            className="app-prop-calculator__bankroll-spend-payout-chart"
            config={chartConfig}
        >
            <ComposedChart
                data={data}
                margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
            >
                <XAxis
                    {...CHART_X_AXIS_PROPS}
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
                />
                <YAxis
                    {...CHART_Y_AXIS_PROPS}
                    tickFormatter={(value: number) =>
                        formatCompactCurrency(value)
                    }
                />
                <ChartLegend
                    content={<ChartLegendContent className="pt-0 pb-2" />}
                    position="top"
                />
                <ReferenceLine
                    {...CHART_REFERENCE_LINE_PROPS}
                    stroke="var(--muted-foreground)"
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
                    fill="var(--info)"
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
                    stroke="var(--destructive)"
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="monotone"
                />
                <Line
                    dataKey="expectedPayouts"
                    dot
                    isAnimationActive={false}
                    stroke="var(--success)"
                    strokeWidth={CHART_STROKE_WIDTH}
                    type="monotone"
                />
                <Line
                    dataKey="expectedNet"
                    dot
                    isAnimationActive={false}
                    stroke="var(--info)"
                    strokeWidth={CHART_STROKE_WIDTH}
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
                                className="font-sans text-warning"
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
