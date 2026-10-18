'use client';

import { useCallback, useMemo } from 'react';
import { Area, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import {
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
} from '~/components/ui/chart';
import { DataTable } from '~/components/ui/data-table';
import {
    formatCompactCurrency,
    formatGateCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import { fraction } from '~/lib/prop-calculator';
import { type ProjectionMonthEnd } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

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

enum ProjectionCardColumn {
    BankrollP10 = 'bankroll-p10',
    BankrollP50 = 'bankroll-p50',
    BankrollP90 = 'bankroll-p90',
    Month = 'month',
    PayoutsP50 = 'payouts-p50',
    SpendP50 = 'spend-p50',
}

interface ProjectionCardProperties {
    onChange: (patch: Partial<BankrollViewState>) => void;
    state: BankrollViewState;
}

const monthEndChartConfig: ChartConfig = {
    band: {
        color: 'color-mix(in oklab, var(--success) 18%, transparent)',
        label: 'P10 to P90',
    },
    median: { color: 'var(--success)', label: 'Median bankroll' },
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
                <StatStrip
                    items={[
                        {
                            id: 'path-ruin',
                            label: 'Path ruin',
                            value: formatPercent(summary.pathRuin),
                        },
                        {
                            id: 'final-net-negative',
                            label: 'P(final net < 0)',
                            value: formatPercent(summary.pFinalNetNegative),
                        },
                        {
                            id: 'cards-bought',
                            label: 'Cards bought (median)',
                            value: summary.cardsBoughtMedian.toFixed(1),
                        },
                        {
                            id: 'multiple',
                            label: 'Multiple (P50 cash / start)',
                            value:
                                summary.multiple === null
                                    ? NOT_APPLICABLE
                                    : `${summary.multiple.toFixed(2)}x`,
                        },
                        {
                            id: 'measured-cycle-days',
                            label: 'Measured cycle days',
                            value:
                                summary.measuredCycleDays === null
                                    ? NOT_APPLICABLE
                                    : summary.measuredCycleDays.toFixed(1),
                        },
                    ]}
                />
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
            <PanelSubheading>
                Bankroll at each month end (P10 to P90)
            </PanelSubheading>
            <ChartContainer
                className="app-prop-calculator__bankroll-month-end-chart"
                config={monthEndChartConfig}
            >
                <ComposedChart
                    data={data}
                    margin={{ bottom: 28, left: 0, right: 12, top: 10 }}
                >
                    <XAxis
                        {...CHART_X_AXIS_PROPS}
                        dataKey="month"
                        label={{
                            fontSize: 11,
                            offset: 12,
                            position: 'bottom',
                            value: 'Months',
                        }}
                        tickFormatter={(value: number) => `${String(value)}mo`}
                    />
                    <YAxis
                        {...CHART_Y_AXIS_PROPS}
                        tickFormatter={(value: number) =>
                            formatCompactCurrency(value)
                        }
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
                        fill="var(--success)"
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
                        stroke="var(--success)"
                        strokeWidth={CHART_STROKE_WIDTH}
                        type="monotone"
                    />
                </ComposedChart>
            </ChartContainer>
            <DataTable
                aria-label="Month-end projection"
                columns={[
                    {
                        cell: ({ row }) => (
                            <>
                                {row.original.month} (day {row.original.day})
                            </>
                        ),
                        header: 'Month',
                        id: ProjectionCardColumn.Month,
                        meta: { isRowHeader: true },
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatGateCurrency(row.original.cashP10)}
                            </span>
                        ),
                        header: 'Bankroll P10',
                        id: ProjectionCardColumn.BankrollP10,
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatGateCurrency(row.original.cashP50)}
                            </span>
                        ),
                        header: 'Bankroll P50',
                        id: ProjectionCardColumn.BankrollP50,
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatGateCurrency(row.original.cashP90)}
                            </span>
                        ),
                        header: 'Bankroll P90',
                        id: ProjectionCardColumn.BankrollP90,
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatGateCurrency(row.original.payoutsP50)}
                            </span>
                        ),
                        header: 'Payouts (P50)',
                        id: ProjectionCardColumn.PayoutsP50,
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatGateCurrency(row.original.spendP50)}
                            </span>
                        ),
                        header: 'Spend (P50)',
                        id: ProjectionCardColumn.SpendP50,
                    },
                ]}
                data={[...monthEnds]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => String(row.month)}
            />
        </div>
    );
}
