'use client';

import { useCallback, useMemo, useState } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
} from 'recharts';

import StatCard from '~/app/(app)/prop-calculator/_components/StatCard';
import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { type ChartConfig, ChartContainer } from '~/components/ui/Chart';
import { Input } from '~/components/ui/Input';
import {
    formatCompactCurrency,
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { fraction } from '~/lib/prop-calculator';
import { type ProjectionMonthEnd } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';
import { cn } from '~/lib/utilities';

import {
    BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL,
    bankrollCycleDescription,
    bankrollCycleFigures,
    bankrollCycleInput,
    bankrollProjectionRequest,
    bankrollProjectionSummary,
} from './bankrollModel';
import {
    type BankrollUrlState,
    parseBankrollDollarsField,
    parseBankrollMultipleField,
    parseBankrollNonNegativeIntField,
    parseBankrollPositiveIntField,
    parseBankrollReinvestFractionField,
} from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

interface ProjectionCardProperties {
    onChange: (patch: Partial<BankrollUrlState>) => void;
    state: BankrollUrlState;
}

const monthEndChartConfig: ChartConfig = {
    band: { color: 'hsl(142 76% 45% / 0.18)', label: 'P10 to P90' },
    median: { color: 'hsl(142 76% 45%)', label: 'Median bankroll' },
};

export function ProjectionCard({ onChange, state }: ProjectionCardProperties) {
    const { variant } = useBankrollVariant();

    const policy = useMemo(
        () =>
            state.start === null || state.horizonDays === null
                ? null
                : {
                      capacity: state.capacity,
                      horizonDays: state.horizonDays,
                      monthlyBudget: state.monthlyBudget,
                      payoutLagDays: state.payoutLagDays ?? 0,
                      reinvestFraction: state.reinvestFraction ?? fraction(0),
                      roundBudget: state.roundBudget,
                      start: state.start,
                  },
        [
            state.capacity,
            state.horizonDays,
            state.monthlyBudget,
            state.payoutLagDays,
            state.reinvestFraction,
            state.roundBudget,
            state.start,
        ],
    );
    const requestKey = policy === null ? null : stableJson({ policy, variant });

    const buildRequest = useCallback(
        (runId: number) =>
            policy === null
                ? null
                : bankrollProjectionRequest(variant, policy, runId),
        [policy, variant],
    );
    const worker = useToolsRequest(requestKey, buildRequest);

    const projection =
        worker.state.phase === ToolsWorkerPhase.Succeeded &&
        worker.state.result.kind === ToolsResponseKind.Projection
            ? worker.state.result
            : null;
    const summary =
        projection === null
            ? null
            : bankrollProjectionSummary(projection.result);
    const failureReason =
        worker.state.phase === ToolsWorkerPhase.Failed
            ? worker.state.reason
            : null;

    const cycle = bankrollCycleInput(state.cycleMultiple, state.cycleDays);
    const illustration =
        projection === null ||
        cycle === null ||
        state.start === null ||
        state.horizonDays === null
            ? null
            : bankrollCycleFigures(state.start, state.horizonDays, [cycle])[0];

    return (
        <section
            aria-labelledby="bankroll-projection-heading"
            className="flex flex-col gap-4"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="bankroll-projection-heading"
            >
                Projection
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                    label="Starting bankroll ($)"
                    onChange={(raw) =>
                        onChange({ start: parseBankrollDollarsField(raw) })
                    }
                    testId="bankroll-start"
                    value={state.start}
                />
                <NumberField
                    label="Monthly budget ($, optional)"
                    onChange={(raw) =>
                        onChange({
                            monthlyBudget: parseBankrollDollarsField(raw),
                        })
                    }
                    testId="bankroll-monthly-budget"
                    value={state.monthlyBudget}
                />
                <NumberField
                    label="Reinvest fraction (0 to 1)"
                    onChange={(raw) =>
                        onChange({
                            reinvestFraction:
                                parseBankrollReinvestFractionField(raw),
                        })
                    }
                    testId="bankroll-reinvest"
                    value={state.reinvestFraction}
                />
                <NumberField
                    label="Capacity (max concurrent accounts, optional)"
                    onChange={(raw) =>
                        onChange({
                            capacity: parseBankrollPositiveIntField(raw),
                        })
                    }
                    testId="bankroll-capacity"
                    value={state.capacity}
                />
                <NumberField
                    label="Payout lag (days)"
                    onChange={(raw) =>
                        onChange({
                            payoutLagDays:
                                parseBankrollNonNegativeIntField(raw),
                        })
                    }
                    testId="bankroll-payout-lag"
                    value={state.payoutLagDays}
                />
                <NumberField
                    label="Horizon (trading days)"
                    onChange={(raw) =>
                        onChange({
                            horizonDays: parseBankrollPositiveIntField(raw),
                        })
                    }
                    testId="bankroll-horizon"
                    value={state.horizonDays}
                />
                <NumberField
                    label="Round budget ($, optional)"
                    onChange={(raw) =>
                        onChange({
                            roundBudget: parseBankrollDollarsField(raw),
                        })
                    }
                    testId="bankroll-round-budget"
                    value={state.roundBudget}
                />
                <NumberField
                    label="Cycle multiple for the illustration (optional)"
                    onChange={(raw) =>
                        onChange({
                            cycleMultiple: parseBankrollMultipleField(raw),
                        })
                    }
                    testId="bankroll-cycle-multiple"
                    value={state.cycleMultiple}
                />
                <NumberField
                    label="Cycle length for the illustration (trading days, optional)"
                    onChange={(raw) =>
                        onChange({
                            cycleDays: parseBankrollPositiveIntField(raw),
                        })
                    }
                    testId="bankroll-cycle-days"
                    value={state.cycleDays}
                />
            </div>
            {summary === null ? (
                failureReason === null ? (
                    <p className="text-sm text-muted-foreground">
                        Enter a starting bankroll and a horizon to project.
                    </p>
                ) : (
                    <p className="text-xs text-rose-400" role="alert">
                        {failureReason}
                    </p>
                )
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <StatCard
                        label="Path ruin"
                        value={formatPercent(summary.pathRuin)}
                    />
                    <StatCard
                        label="P(final net < 0)"
                        value={formatPercent(summary.pFinalNetNegative)}
                    />
                    <StatCard
                        label="Cards bought (median)"
                        value={summary.cardsBoughtMedian.toFixed(1)}
                    />
                    <StatCard
                        label="Multiple (P50 cash / start)"
                        value={
                            summary.multiple === null
                                ? NOT_APPLICABLE
                                : `${summary.multiple.toFixed(2)}x`
                        }
                    />
                    <StatCard
                        label="Measured cycle days"
                        value={
                            summary.measuredCycleDays === null
                                ? NOT_APPLICABLE
                                : summary.measuredCycleDays.toFixed(1)
                        }
                    />
                </div>
            )}
            {projection === null ? null : (
                <MonthEndBands monthEnds={projection.monthEnds} />
            )}
            {illustration === undefined || illustration === null ? null : (
                <p className="text-xs text-muted-foreground">
                    {BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL} (
                    {bankrollCycleDescription(illustration)}):{' '}
                    {illustration.quantity.value === null
                        ? NOT_APPLICABLE
                        : formatGateCurrency(illustration.quantity.value)}
                </p>
            )}
        </section>
    );
}

function MonthEndBands({
    monthEnds,
}: {
    monthEnds: readonly ProjectionMonthEnd[];
}) {
    if (monthEnds.length === 0) return null;
    const data = monthEnds.map((row) => ({
        low: row.cashP10,
        median: row.cashP50,
        month: row.month,
        range: row.cashP90 - row.cashP10,
    }));
    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white">
                Bankroll at each month end (P10 to P90)
            </h3>
            <ChartContainer
                className={cn(
                    'app-prop-calculator__bankroll-month-end-chart',
                    'aspect-16/7 min-h-64 w-full',
                )}
                config={monthEndChartConfig}
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
                        dataKey="month"
                        label={{
                            fontSize: 11,
                            offset: 12,
                            position: 'bottom',
                            value: 'Months',
                        }}
                        tickFormatter={(value: number) => `${String(value)}mo`}
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
                        fill="hsl(142 76% 45%)"
                        fillOpacity={0.18}
                        isAnimationActive={false}
                        legendType="none"
                        stackId="band"
                        stroke="none"
                    />
                    <Line
                        dataKey="median"
                        dot={false}
                        isAnimationActive={false}
                        stroke="hsl(142 76% 45%)"
                        strokeWidth={2.5}
                        type="monotone"
                    />
                </ComposedChart>
            </ChartContainer>
            <div className="overflow-x-auto">
                <table
                    aria-label="Month-end projection"
                    className="w-full text-left text-xs"
                >
                    <thead>
                        <tr className="text-muted-foreground">
                            <th className="py-1 pr-3">Month</th>
                            <th className="py-1 pr-3">Bankroll P10</th>
                            <th className="py-1 pr-3">Bankroll P50</th>
                            <th className="py-1 pr-3">Bankroll P90</th>
                            <th className="py-1 pr-3">Payouts (P50)</th>
                            <th className="py-1 pr-3">Spend (P50)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthEnds.map((row) => (
                            <tr
                                className="border-t border-white/10"
                                key={row.month}
                            >
                                <td className="py-1 pr-3">
                                    {row.month} (day {row.day})
                                </td>
                                <td className="py-1 pr-3 font-mono">
                                    {formatGateCurrency(row.cashP10)}
                                </td>
                                <td className="py-1 pr-3 font-mono">
                                    {formatGateCurrency(row.cashP50)}
                                </td>
                                <td className="py-1 pr-3 font-mono">
                                    {formatGateCurrency(row.cashP90)}
                                </td>
                                <td className="py-1 pr-3 font-mono">
                                    {formatGateCurrency(row.payoutsP50)}
                                </td>
                                <td className="py-1 pr-3 font-mono">
                                    {formatGateCurrency(row.spendP50)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function NumberField({
    label,
    onChange,
    testId,
    value,
}: {
    label: string;
    onChange: (raw: string) => void;
    testId: string;
    value: null | number;
}) {
    const [text, setText] = useState(() =>
        value === null ? '' : String(value),
    );
    return (
        <div className="flex flex-col gap-1">
            <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={testId}
            >
                {label}
            </label>
            <Input
                id={testId}
                inputMode="decimal"
                onChange={(event) => {
                    setText(event.target.value);
                    onChange(event.target.value);
                }}
                placeholder="Not set"
                type="number"
                value={text}
            />
        </div>
    );
}
