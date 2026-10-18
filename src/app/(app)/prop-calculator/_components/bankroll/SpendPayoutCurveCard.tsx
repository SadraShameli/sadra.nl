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
import { DataTable } from '~/components/ui/data-table';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
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

enum CurveColumn {
    Attempts = 'attempts',
    Budget = 'budget',
    ExpectedNet = 'expected-net',
    ExpectedPayouts = 'expected-payouts',
    ExpectedSpend = 'expected-spend',
    LossProbability = 'loss-probability',
    NetP10 = 'net-p10',
    NetP90 = 'net-p90',
}

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
        <DataTable
            aria-label="Spend and payout per budget"
            columns={[
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {formatGateCurrency(row.budget)}
                        </span>
                    ),
                    header: 'Budget',
                    id: CurveColumn.Budget,
                    meta: { isRowHeader: true },
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.figures?.attempts}
                        </span>
                    ),
                    header: 'Attempts',
                    id: CurveColumn.Attempts,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.figures === null
                                ? null
                                : formatGateCurrency(row.figures.expectedSpend)}
                        </span>
                    ),
                    header: 'Expected spend',
                    id: CurveColumn.ExpectedSpend,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.figures === null
                                ? null
                                : formatGateCurrency(
                                      row.figures.expectedPayouts,
                                  )}
                        </span>
                    ),
                    header: 'Expected payouts',
                    id: CurveColumn.ExpectedPayouts,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.figures === null
                                ? null
                                : formatGateCurrency(row.figures.expectedNet)}
                        </span>
                    ),
                    header: 'Expected net',
                    id: CurveColumn.ExpectedNet,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.figures === null
                                ? null
                                : formatGateCurrency(row.figures.netP10)}
                        </span>
                    ),
                    header: 'Net P10',
                    id: CurveColumn.NetP10,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.figures === null
                                ? null
                                : formatGateCurrency(row.figures.netP90)}
                        </span>
                    ),
                    header: 'Net P90',
                    id: CurveColumn.NetP90,
                },
                {
                    cell: ({ row: { original: row } }) => (
                        <span className="font-mono">
                            {row.figures === null
                                ? null
                                : lossProbabilityText(row.figures)}
                        </span>
                    ),
                    header: 'P(net < 0)',
                    id: CurveColumn.LossProbability,
                },
            ]}
            data={[...rows]}
            isSortable={false}
            pageSize={null}
            rowId={(row) => String(row.budget)}
            rowMessage={(row) =>
                row.figures === null ? (
                    <span className="text-warning">
                        {NOT_APPLICABLE}
                        {row.reason === null
                            ? ''
                            : `: ${ECONOMICS_REASON_TEXT[row.reason]}`}
                    </span>
                ) : undefined
            }
        />
    );
}

function lossProbabilityText(
    figures: NonNullable<SpendPayoutCurveRow['figures']>,
): string {
    return figures.lossProbabilityStandardError === null
        ? formatPercent(figures.lossProbability)
        : `${formatPercent(figures.lossProbability)} (SE ${formatPercent(figures.lossProbabilityStandardError)})`;
}
