'use client';

import { useState } from 'react';

import { FilterToolbar } from '~/components/FilterToolbar';
import { InfoNote } from '~/components/InfoNote';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { ChartSkeleton } from '~/components/ui/chart';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { formatCompactCurrency, formatPercent } from '~/lib/format';
import { type SimInputs, TRADING_DAYS_PER_YEAR } from '~/lib/prop-calculator';
import { median } from '~/lib/prop-calculator/stats';

import { cashFlowRoiOnSpend } from './cashFlowRoi';
import BreakevenMonthHistogramView from './charts/BreakevenMonthHistogramView';
import CashFlowBandChartView from './charts/CashFlowBandChartView';
import CashFlowPaybackChartView from './charts/CashFlowPaybackChartView';
import { clampInt } from './clamp';
import FunnelWhatIfSection from './FunnelWhatIfSection';
import { panelDescriptions } from './kpiDescriptions';
import { NO_COST_ROI_REASON } from './missingReasons';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import {
    CASH_FLOW_MAX_TRADES_PER_DAY,
    useCashFlowSimulation,
} from './useCashFlowSimulation';
import { ValueOrMissing } from './ValueOrMissing';

interface CashFlowPanelProperties {
    baseInputs: SimInputs;
    firmDisplayName: string;
    maxAccounts: number;
}

const HORIZON_OPTIONS = [
    { days: TRADING_DAYS_PER_YEAR / 2, label: '6 months' },
    { days: TRADING_DAYS_PER_YEAR, label: '1 year' },
    { days: TRADING_DAYS_PER_YEAR * 2, label: '2 years' },
    { days: TRADING_DAYS_PER_YEAR * 3, label: '3 years' },
] as const;

const NO_BREAK_EVEN_REASON = 'No trial broke even within the horizon.';
const DEFAULT_ACCOUNTS = 5;
const MAX_ACCOUNTS = 10;
const MIN_ACCOUNTS = 1;
const DEFAULT_TRIALS = 150;
const MAX_TRIALS = 300;
const MIN_TRIALS = 25;

export default function CashFlowPanel({
    baseInputs,
    firmDisplayName,
    maxAccounts,
}: CashFlowPanelProperties) {
    const {
        commissionPerRoundTrip,
        dayStop,
        discounts,
        evalDayPolicy,
        instrument,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        stopPoints,
        tradesPerDay,
        winrate,
    } = baseInputs;
    const [horizonIndex, setHorizonIndex] = useState(1);
    const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
    const [trials, setTrials] = useState(DEFAULT_TRIALS);

    const horizon = HORIZON_OPTIONS[horizonIndex] ?? HORIZON_OPTIONS[0];
    const accountCap = Math.min(MAX_ACCOUNTS, maxAccounts);
    const effectiveAccounts = clampInt(
        accounts,
        MIN_ACCOUNTS,
        accountCap,
        MIN_ACCOUNTS,
    );

    const {
        effectiveTradesPerDay,
        error,
        isTradesPerDayCapped,
        pending,
        result,
    } = useCashFlowSimulation({
        accounts: effectiveAccounts,
        commissionPerRoundTrip,
        dayBudget: horizon.days,
        dayStop,
        discounts,
        evalDayPolicy,
        instrument,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        stopPoints,
        tradesPerDay,
        trials,
        winrate,
    });

    const finalNet50 = result?.netP50.at(-1) ?? 0;
    const finalNet10 = result?.netP10.at(-1) ?? 0;
    const finalNet90 = result?.netP90.at(-1) ?? 0;
    const finalSpend50 = result?.spendP50.at(-1) ?? 0;
    const pFinalNetNegative = result?.pFinalNetNegative ?? 0;
    const pEverBreakEven = result?.pEverCashflowPositive ?? 0;
    const medianBreakEvenMonth =
        result && result.breakEvenMonthValues.length > 0
            ? median(result.breakEvenMonthValues)
            : null;
    const roiOnSpend = cashFlowRoiOnSpend(finalNet50, finalSpend50);

    return (
        <ToolPanel
            className="app-prop-calculator__cash-flow"
            description="independent of the global trial/account settings above"
            info={panelDescriptions.cashFlow}
            isComputing={pending}
            title="Net over time"
            titleAs="h3"
        >
            <FilterToolbar label="Cash flow options">
                <div className="app-prop-calculator__cash-flow-horizon -mx-1 max-w-full overflow-x-auto px-1 pb-1">
                    <ToggleGroup
                        aria-label="Horizon"
                        className="w-max justify-start"
                        onValueChange={(value: string) => {
                            const index = HORIZON_OPTIONS.findIndex(
                                (option) => option.label === value,
                            );
                            if (index !== -1) setHorizonIndex(index);
                        }}
                        size="sm"
                        type="single"
                        value={HORIZON_OPTIONS[horizonIndex]?.label ?? ''}
                        variant="outline"
                    >
                        {HORIZON_OPTIONS.map((option) => (
                            <ToggleGroupItem
                                className="shrink-0 whitespace-nowrap"
                                key={option.label}
                                value={option.label}
                            >
                                {option.label}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </div>
                <Field className="w-auto" orientation="horizontal">
                    <FieldLabel htmlFor="cash-flow-accounts">
                        Accounts (max {accountCap})
                    </FieldLabel>
                    <Input
                        className="w-24"
                        id="cash-flow-accounts"
                        max={accountCap}
                        min={MIN_ACCOUNTS}
                        onChange={(event) =>
                            setAccounts(
                                clampInt(
                                    Number(event.target.value),
                                    MIN_ACCOUNTS,
                                    accountCap,
                                    MIN_ACCOUNTS,
                                ),
                            )
                        }
                        step={1}
                        type="number"
                        value={effectiveAccounts}
                    />
                </Field>
                <Field className="w-auto" orientation="horizontal">
                    <FieldLabel htmlFor="cash-flow-trials">Trials</FieldLabel>
                    <Input
                        className="w-24"
                        id="cash-flow-trials"
                        max={MAX_TRIALS}
                        min={MIN_TRIALS}
                        onChange={(event) =>
                            setTrials(
                                clampInt(
                                    Number(event.target.value),
                                    MIN_TRIALS,
                                    MAX_TRIALS,
                                    MIN_TRIALS,
                                ),
                            )
                        }
                        step={25}
                        type="number"
                        value={trials}
                    />
                </Field>
            </FilterToolbar>

            {maxAccounts < MAX_ACCOUNTS && (
                <InfoNote>
                    {firmDisplayName} allows at most {maxAccounts} funded
                    account(s) at once on this plan
                </InfoNote>
            )}

            {isTradesPerDayCapped && (
                <StatusRow
                    detail="This simulation runs entirely on the main thread, so its own worst case has to stay bounded independently of the slider above."
                    title={`Capped at ${String(CASH_FLOW_MAX_TRADES_PER_DAY)} effective trades/day for this panel (global setting is ${String(tradesPerDay)})`}
                    tone={StatusTone.Warn}
                />
            )}

            {error === null ? (
                <StatStrip
                    isLoading={result === null}
                    items={[
                        {
                            caption: `through ${horizon.label}`,
                            id: 'median-final-net',
                            label: 'Median final net',
                            value: formatCompactCurrency(finalNet50),
                        },
                        {
                            caption: '10th percentile outcome',
                            id: 'p10-final-net',
                            label: 'P10 final net',
                            value: formatCompactCurrency(finalNet10),
                        },
                        {
                            caption:
                                'share of trials with a negative final net',
                            id: 'p-final-net-negative',
                            label: 'P(ends net negative)',
                            value: formatPercent(pFinalNetNegative),
                        },
                        {
                            caption: '90th percentile outcome',
                            id: 'p90-final-net',
                            label: 'P90 final net',
                            value: formatCompactCurrency(finalNet90),
                        },
                        {
                            caption: 'month net turns positive',
                            id: 'median-break-even',
                            label: 'Median break-even',
                            value: (
                                <ValueOrMissing
                                    reason={NO_BREAK_EVEN_REASON}
                                    value={
                                        medianBreakEvenMonth === null
                                            ? null
                                            : `${medianBreakEvenMonth.toFixed(1)}mo`
                                    }
                                />
                            ),
                        },
                        {
                            caption: 'within the horizon',
                            id: 'p-ever-break-even',
                            label: 'P(ever break-even)',
                            value: formatPercent(pEverBreakEven),
                        },
                        {
                            caption: 'median final net ÷ median spend',
                            id: 'roi-on-spend',
                            label: 'ROI on spend',
                            value: (
                                <ValueOrMissing
                                    reason={NO_COST_ROI_REASON}
                                    value={roiOnSpend}
                                />
                            ),
                        },
                    ]}
                />
            ) : null}

            {result ? (
                <>
                    <CashFlowBandChartView result={result} />
                    <p className="text-xs text-muted-foreground">
                        {trials} trials × {result.accountsSimulated} accounts ·{' '}
                        {effectiveTradesPerDay} trades/day · shaded band:
                        P10–P90 · bold line: median net
                    </p>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-2">
                            <PanelSubheading as="h4">
                                Spend vs payout (median)
                            </PanelSubheading>
                            <CashFlowPaybackChartView result={result} />
                        </div>
                        <div className="flex min-w-0 flex-col gap-2">
                            <PanelSubheading as="h4">
                                Break-even month distribution
                            </PanelSubheading>
                            <BreakevenMonthHistogramView result={result} />
                        </div>
                    </div>
                </>
            ) : error === null ? (
                <ChartSkeleton />
            ) : (
                <SimulationFailureNotice message={error} />
            )}

            <FunnelWhatIfSection />
        </ToolPanel>
    );
}
