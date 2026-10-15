'use client';

import { useCallback, useMemo } from 'react';
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
import { BankrollNumberField } from './BankrollNumberField';
import { BankrollRunStatus } from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
import {
    type BankrollViewState,
    parseBankrollDollarsField,
    parseBankrollMultipleField,
    parseBankrollNonNegativeIntField,
    parseBankrollPositiveIntField,
    parseBankrollReinvestFractionField,
} from './bankrollUrlState';
import { useBankrollVariant } from './useBankrollVariant';
import { useToolsRequest } from './useToolsRequest';

interface ProjectionCardProperties {
    onChange: (patch: Partial<BankrollViewState>) => void;
    state: BankrollViewState;
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

    const cycle = bankrollCycleInput(state.cycleMultiple, state.cycleDays);
    const illustration =
        projection === null ||
        cycle === null ||
        state.start === null ||
        state.horizonDays === null
            ? null
            : bankrollCycleFigures(state.start, state.horizonDays, [cycle])[0];

    return (
        <BankrollSection
            description="Simulates reinvesting payouts into new attempts over a horizon, with P10 to P90 bands and the chance the bankroll runs dry."
            headingId="bankroll-projection-heading"
            title="Projection"
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <BankrollNumberField
                    id="bankroll-start"
                    initial={state.start}
                    label="Starting bankroll ($)"
                    onChange={(raw) =>
                        onChange({ start: parseBankrollDollarsField(raw) })
                    }
                />
                <BankrollNumberField
                    id="bankroll-monthly-budget"
                    initial={state.monthlyBudget}
                    label="Monthly budget ($, optional)"
                    onChange={(raw) =>
                        onChange({
                            monthlyBudget: parseBankrollDollarsField(raw),
                        })
                    }
                />
                <BankrollNumberField
                    id="bankroll-reinvest"
                    initial={state.reinvestFraction}
                    label="Reinvest fraction (0 to 1)"
                    onChange={(raw) =>
                        onChange({
                            reinvestFraction:
                                parseBankrollReinvestFractionField(raw),
                        })
                    }
                />
                <BankrollNumberField
                    id="bankroll-capacity"
                    initial={state.capacity}
                    label="Capacity (max concurrent accounts, optional)"
                    onChange={(raw) =>
                        onChange({
                            capacity: parseBankrollPositiveIntField(raw),
                        })
                    }
                />
                <BankrollNumberField
                    id="bankroll-payout-lag"
                    initial={state.payoutLagDays}
                    label="Payout lag (days)"
                    onChange={(raw) =>
                        onChange({
                            payoutLagDays:
                                parseBankrollNonNegativeIntField(raw),
                        })
                    }
                />
                <BankrollNumberField
                    id="bankroll-horizon"
                    initial={state.horizonDays}
                    label="Horizon (trading days)"
                    onChange={(raw) =>
                        onChange({
                            horizonDays: parseBankrollPositiveIntField(raw),
                        })
                    }
                />
                <BankrollNumberField
                    id="bankroll-round-budget"
                    initial={state.roundBudget}
                    label="Round budget ($, optional)"
                    onChange={(raw) =>
                        onChange({
                            roundBudget: parseBankrollDollarsField(raw),
                        })
                    }
                />
                <BankrollNumberField
                    id="bankroll-cycle-multiple"
                    initial={state.cycleMultiple}
                    label="Cycle multiple for the illustration (optional)"
                    onChange={(raw) =>
                        onChange({
                            cycleMultiple: parseBankrollMultipleField(raw),
                        })
                    }
                />
                <BankrollNumberField
                    id="bankroll-cycle-days"
                    initial={state.cycleDays}
                    label="Cycle length for the illustration (trading days, optional)"
                    onChange={(raw) =>
                        onChange({
                            cycleDays: parseBankrollPositiveIntField(raw),
                        })
                    }
                />
            </div>
            {summary === null ? (
                <BankrollRunStatus
                    idleText="Enter a starting bankroll and a horizon to project."
                    isRequested={requestKey !== null}
                    state={worker.state}
                />
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
        </BankrollSection>
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
            <Table aria-label="Month-end projection">
                <TableHeader>
                    <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Bankroll P10</TableHead>
                        <TableHead>Bankroll P50</TableHead>
                        <TableHead>Bankroll P90</TableHead>
                        <TableHead>Payouts (P50)</TableHead>
                        <TableHead>Spend (P50)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {monthEnds.map((row) => (
                        <TableRow key={row.month}>
                            <TableCell>
                                {row.month} (day {row.day})
                            </TableCell>
                            <TableCell className="font-mono">
                                {formatGateCurrency(row.cashP10)}
                            </TableCell>
                            <TableCell className="font-mono">
                                {formatGateCurrency(row.cashP50)}
                            </TableCell>
                            <TableCell className="font-mono">
                                {formatGateCurrency(row.cashP90)}
                            </TableCell>
                            <TableCell className="font-mono">
                                {formatGateCurrency(row.payoutsP50)}
                            </TableCell>
                            <TableCell className="font-mono">
                                {formatGateCurrency(row.spendP50)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
