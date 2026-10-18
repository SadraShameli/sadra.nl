'use client';

import { useCallback, useMemo } from 'react';
import { Area, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import { ToolsWorkerPhase } from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { MissingValue } from '~/components/MissingValue';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip, type StatStripItem } from '~/components/StatStrip';
import {
    CHART_STROKE_WIDTH,
    CHART_X_AXIS_PROPS,
    CHART_Y_AXIS_PROPS,
    type ChartConfig,
    ChartContainer,
    ChartSkeleton,
} from '~/components/ui/chart';
import { DataTable } from '~/components/ui/data-table';
import { Separator } from '~/components/ui/separator';
import {
    formatCompactCurrency,
    formatPercent,
    formatWholeOrCentsCurrency,
} from '~/lib/format';
import { fraction } from '~/lib/prop-calculator';
import { type ProjectionMonthEnd } from '~/lib/prop-calculator/economics';
import { stableJson } from '~/lib/stableJson';

import { BankrollField, BankrollFieldKind } from './BankrollField';
import {
    BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL,
    bankrollCycleDescription,
    bankrollCycleFigures,
    bankrollCycleInput,
    bankrollProjectionRequest,
    type BankrollProjectionSummary,
    bankrollProjectionSummary,
} from './bankrollModel';
import {
    BankrollRunStatus,
    isAwaitingRequestedResult,
} from './BankrollRunStatus';
import { BankrollSection } from './BankrollSection';
import { growthStatItems, readyValue } from './bankrollStatItems';
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
        color: 'color-mix(in oklab, var(--chart-1) 18%, transparent)',
        label: 'P10 to P90',
    },
    median: { color: 'var(--chart-1)', label: 'Median bankroll' },
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
            headingId="bankroll-projection-heading"
            info="Simulates reinvesting payouts into new attempts over a horizon, with P10 to P90 bands and the chance the bankroll runs dry."
            inputs={
                <>
                    <BankrollField
                        id="bankroll-start"
                        info="The cash you start with, in dollars."
                        initial={state.start}
                        label="Starting bankroll"
                        onChange={(raw) =>
                            onChange({ start: parseBankrollDollarsField(raw) })
                        }
                    />
                    <BankrollField
                        id="bankroll-horizon"
                        info="How many trading days to simulate."
                        initial={state.horizonDays}
                        kind={BankrollFieldKind.Integer}
                        label="Horizon"
                        onChange={(raw) =>
                            onChange({
                                horizonDays: parseBankrollPositiveIntField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-reinvest"
                        info="The share of each payout put back into the bankroll, from 0 to 1. Empty means 0: every payout is withdrawn."
                        initial={state.reinvestFraction}
                        label="Reinvest fraction"
                        onChange={(raw) =>
                            onChange({
                                reinvestFraction:
                                    parseBankrollReinvestFractionField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-monthly-budget"
                        info="Optional. The most you spend on new attempts in one month, in dollars."
                        initial={state.monthlyBudget}
                        label="Monthly budget"
                        onChange={(raw) =>
                            onChange({
                                monthlyBudget: parseBankrollDollarsField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-round-budget"
                        info="Optional. The most you spend on attempts over the whole horizon, in dollars."
                        initial={state.roundBudget}
                        label="Round budget"
                        onChange={(raw) =>
                            onChange({
                                roundBudget: parseBankrollDollarsField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-capacity"
                        info="Optional. The most accounts you hold at once, capped at the plan's funded account limit."
                        initial={state.capacity}
                        kind={BankrollFieldKind.Integer}
                        label="Capacity"
                        onChange={(raw) =>
                            onChange({
                                capacity: parseBankrollPositiveIntField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-payout-lag"
                        info="Trading days between a payout and its cash reaching the bankroll. Empty means 0."
                        initial={state.payoutLagDays}
                        kind={BankrollFieldKind.Integer}
                        label="Payout lag"
                        onChange={(raw) =>
                            onChange({
                                payoutLagDays:
                                    parseBankrollNonNegativeIntField(raw),
                            })
                        }
                    />
                    <Separator />
                    <PanelSubheading info="Optional. A deterministic figure, not a forecast: the starting bankroll multiplied by the cycle multiple once per cycle over the horizon. It shows beside the bands once both are set.">
                        Cycle illustration
                    </PanelSubheading>
                    <BankrollField
                        id="bankroll-cycle-multiple"
                        info="Optional. How many times the bankroll grows per cycle."
                        initial={state.cycleMultiple}
                        label="Cycle multiple"
                        onChange={(raw) =>
                            onChange({
                                cycleMultiple: parseBankrollMultipleField(raw),
                            })
                        }
                    />
                    <BankrollField
                        id="bankroll-cycle-days"
                        info="Optional. Trading days per cycle."
                        initial={state.cycleDays}
                        kind={BankrollFieldKind.Integer}
                        label="Cycle length"
                        onChange={(raw) =>
                            onChange({
                                cycleDays: parseBankrollPositiveIntField(raw),
                            })
                        }
                    />
                </>
            }
            isComputing={isAwaitingRequestedResult(
                requestKey !== null,
                worker.state,
            )}
            results={
                projection === null ? (
                    <BankrollRunStatus
                        emptyText="Enter a starting bankroll and a horizon to project."
                        isRequested={requestKey !== null}
                        skeleton={
                            <>
                                <StatStrip
                                    isLoading
                                    items={projectionItems(null)}
                                />
                                <ChartSkeleton />
                            </>
                        }
                        state={worker.state}
                    />
                ) : (
                    <>
                        <StatStrip
                            items={projectionItems(
                                bankrollProjectionSummary(projection.result),
                            )}
                        />
                        <MonthEndBands monthEnds={projection.monthEnds} />
                        {illustration === undefined ||
                        illustration === null ? null : (
                            <p className="text-xs text-muted-foreground">
                                {BANKROLL_CLOSED_FORM_ILLUSTRATION_LABEL} (
                                {bankrollCycleDescription(illustration)}):{' '}
                                {illustration.quantity.value === null ? (
                                    <MissingValue />
                                ) : (
                                    formatWholeOrCentsCurrency(
                                        illustration.quantity.value,
                                    )
                                )}
                            </p>
                        )}
                    </>
                )
            }
            title="Projection"
        />
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
                        fill="var(--color-median)"
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
                        stroke="var(--color-median)"
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
                                {formatWholeOrCentsCurrency(
                                    row.original.cashP10,
                                )}
                            </span>
                        ),
                        header: 'Bankroll P10',
                        id: ProjectionCardColumn.BankrollP10,
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatWholeOrCentsCurrency(
                                    row.original.cashP50,
                                )}
                            </span>
                        ),
                        header: 'Bankroll P50',
                        id: ProjectionCardColumn.BankrollP50,
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatWholeOrCentsCurrency(
                                    row.original.cashP90,
                                )}
                            </span>
                        ),
                        header: 'Bankroll P90',
                        id: ProjectionCardColumn.BankrollP90,
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatWholeOrCentsCurrency(
                                    row.original.payoutsP50,
                                )}
                            </span>
                        ),
                        header: 'Payouts (P50)',
                        id: ProjectionCardColumn.PayoutsP50,
                    },
                    {
                        cell: ({ row }) => (
                            <span className="font-mono">
                                {formatWholeOrCentsCurrency(
                                    row.original.spendP50,
                                )}
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

function projectionItems(
    summary: BankrollProjectionSummary | null,
): readonly StatStripItem[] {
    return [
        {
            id: 'path-ruin',
            label: 'Path ruin',
            value: readyValue(summary, (ready) =>
                formatPercent(ready.pathRuin),
            ),
        },
        {
            id: 'final-net-negative',
            label: 'P(final net < 0)',
            value: readyValue(summary, (ready) =>
                formatPercent(ready.pFinalNetNegative),
            ),
        },
        {
            id: 'cards-bought',
            label: 'Cards bought (median)',
            value: readyValue(summary, (ready) =>
                ready.cardsBoughtMedian.toFixed(1),
            ),
        },
        ...growthStatItems(summary),
    ];
}
