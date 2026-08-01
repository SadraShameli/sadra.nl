'use client';

import { useState } from 'react';

import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import { Input } from '~/components/ui/Input';
import { formatCompactCurrency, formatPercent } from '~/lib/format';
import {
    type CouponDiscounts,
    type DayStopRule,
    type Plan,
} from '~/lib/prop-calculator';
import { clamp, median } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utilities';

import BreakevenMonthHistogramView from './charts/BreakevenMonthHistogramView';
import CashFlowBandChartView from './charts/CashFlowBandChartView';
import CashFlowPaybackChartView from './charts/CashFlowPaybackChartView';
import {
    CASH_FLOW_MAX_TRADES_PER_DAY,
    useCashFlowSimulation,
} from './useCashFlowSimulation';

interface CashFlowPanelProperties {
    commissionPerRoundTrip?: number;
    dayStop?: DayStopRule;
    discounts?: CouponDiscounts;
    maxEvalDays: number;
    plan: Plan;
    riskPerTrade: number;
    rrRatio: number;
    seed: number;
    tradesPerDay: number;
    winrate: number;
}

const HORIZON_OPTIONS = [
    { days: 126, label: '6 months' },
    { days: 252, label: '1 year' },
    { days: 504, label: '2 years' },
    { days: 756, label: '3 years' },
] as const;

// This panel gets its own small, independent trial/account controls,
// decoupled from the global calculator sliders — see `useCashFlowSimulation`
// for why (no web workers, so worst-case cost has to stay bounded).
const DEFAULT_ACCOUNTS = 5;
const MAX_ACCOUNTS = 10;
const MIN_ACCOUNTS = 1;
const DEFAULT_TRIALS = 150;
const MAX_TRIALS = 300;
const MIN_TRIALS = 25;

export default function CashFlowPanel({
    commissionPerRoundTrip,
    dayStop,
    discounts,
    maxEvalDays,
    plan,
    riskPerTrade,
    rrRatio,
    seed,
    tradesPerDay,
    winrate,
}: CashFlowPanelProperties) {
    const [horizonIndex, setHorizonIndex] = useState(1);
    const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
    const [trials, setTrials] = useState(DEFAULT_TRIALS);

    const horizon = HORIZON_OPTIONS[horizonIndex] ?? HORIZON_OPTIONS[0];

    const { effectiveTradesPerDay, isTradesPerDayCapped, pending, result } =
        useCashFlowSimulation({
            accounts,
            commissionPerRoundTrip,
            dayBudget: horizon.days,
            dayStop,
            discounts,
            maxEvalDays,
            plan,
            riskPerTrade,
            rrRatio,
            seed,
            tradesPerDay,
            trials,
            winrate,
        });

    const finalNet50 = result?.netP50.at(-1) ?? 0;
    const finalNet10 = result?.netP10.at(-1) ?? 0;
    const finalNet90 = result?.netP90.at(-1) ?? 0;
    const finalSpend50 = result?.spendP50.at(-1) ?? 0;
    const pEverBreakEven = result?.pEverCashflowPositive ?? 0;
    const medianBreakEvenMonth =
        result && result.breakEvenMonthValues.length > 0
            ? median(result.breakEvenMonthValues)
            : null;
    const roiOnSpend = finalSpend50 > 0 ? finalNet50 / finalSpend50 : 0;

    return (
        <Card className={cn('app-prop-calculator__cash-flow', 'px-5 py-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Cash Flow Over Time
                    </h3>
                    <InfoPopover title="Cash Flow Over Time">
                        Projects your realistic, rules-aware cash flow: buy an
                        eval, retry at full price on failure (no discounted
                        resets), then — once funded — cycle through the payout
                        ladder with qualifying days, the safety net, and the
                        consistency rule all enforced, repeating for every new
                        card bought after an account closes or busts. The shaded
                        band shows the P10–P90 spread of cumulative net (payouts
                        − spend) across simulated trials; the bold line is the
                        median.
                    </InfoPopover>
                </div>
                <div className="flex gap-2">
                    {HORIZON_OPTIONS.map((h, index) => (
                        <Button
                            className="h-7 px-2.5 text-xs"
                            key={h.label}
                            onClick={() => setHorizonIndex(index)}
                            size="sm"
                            type="button"
                            variant={
                                index === horizonIndex ? 'default' : 'ghost'
                            }
                        >
                            {h.label}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label
                            className="mb-1 block text-[11px] text-muted-foreground"
                            htmlFor="cash-flow-accounts"
                        >
                            Accounts (max {MAX_ACCOUNTS})
                        </label>
                        <Input
                            className="h-7 w-20 text-xs"
                            id="cash-flow-accounts"
                            max={MAX_ACCOUNTS}
                            min={MIN_ACCOUNTS}
                            onChange={(event) =>
                                setAccounts(
                                    clamp(
                                        Number(event.target.value),
                                        MIN_ACCOUNTS,
                                        MAX_ACCOUNTS,
                                    ),
                                )
                            }
                            step={1}
                            type="number"
                            value={accounts}
                        />
                    </div>
                    <div>
                        <label
                            className="mb-1 block text-[11px] text-muted-foreground"
                            htmlFor="cash-flow-trials"
                        >
                            Trials
                        </label>
                        <Input
                            className="h-7 w-20 text-xs"
                            id="cash-flow-trials"
                            max={MAX_TRIALS}
                            min={MIN_TRIALS}
                            onChange={(event) =>
                                setTrials(
                                    clamp(
                                        Number(event.target.value),
                                        MIN_TRIALS,
                                        MAX_TRIALS,
                                    ),
                                )
                            }
                            step={25}
                            type="number"
                            value={trials}
                        />
                    </div>
                    <span className="pb-1.5 text-[11px] text-muted-foreground">
                        {pending
                            ? 'computing…'
                            : 'independent of the global trial/account settings above'}
                    </span>
                </div>

                {isTradesPerDayCapped && (
                    <p className="text-[11px] text-amber-400">
                        Capped at {CASH_FLOW_MAX_TRADES_PER_DAY} effective
                        trades/day for this panel (global setting is{' '}
                        {tradesPerDay}) — this simulation runs entirely on the
                        main thread, so its own worst case has to stay bounded
                        independently of the slider above.
                    </p>
                )}

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                    <StatCell
                        label="Median final net"
                        sub={`through ${horizon.label}`}
                        value={formatCompactCurrency(finalNet50)}
                        valueClass={
                            finalNet50 >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                    <StatCell
                        label="P10 final net"
                        sub="10th percentile outcome"
                        value={formatCompactCurrency(finalNet10)}
                    />
                    <StatCell
                        label="P90 final net"
                        sub="90th percentile outcome"
                        value={formatCompactCurrency(finalNet90)}
                    />
                    <StatCell
                        label="Median break-even"
                        sub="month net turns positive"
                        value={
                            medianBreakEvenMonth === null
                                ? '—'
                                : `${medianBreakEvenMonth.toFixed(1)}mo`
                        }
                        valueClass={
                            medianBreakEvenMonth === null
                                ? 'text-muted-foreground'
                                : 'text-emerald-400'
                        }
                    />
                    <StatCell
                        label="P(ever break-even)"
                        sub="within the horizon"
                        value={formatPercent(pEverBreakEven)}
                        valueClass={
                            pEverBreakEven >= 0.5
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                        }
                    />
                    <StatCell
                        label="ROI on spend"
                        sub="median final net ÷ median spend"
                        value={formatPercent(roiOnSpend)}
                        valueClass={
                            roiOnSpend >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }
                    />
                </div>

                {result ? (
                    <>
                        <CashFlowBandChartView result={result} />
                        <p className="text-[11px] text-muted-foreground">
                            {trials} trials × {accounts} accounts ·{' '}
                            {effectiveTradesPerDay} trades/day · shaded band:
                            P10–P90 · bold line: median net
                        </p>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="flex min-w-0 flex-col gap-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                    Spend vs payout (median)
                                </p>
                                <CashFlowPaybackChartView result={result} />
                                <p className="text-[11px] text-muted-foreground">
                                    <span className="text-rose-400">■</span>{' '}
                                    Cumulative spend ·{' '}
                                    <span className="text-emerald-400">■</span>{' '}
                                    Cumulative payout
                                </p>
                            </div>
                            <div className="flex min-w-0 flex-col gap-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                    Break-even month distribution
                                </p>
                                <BreakevenMonthHistogramView result={result} />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                        Computing cash flow…
                    </div>
                )}
            </div>
        </Card>
    );
}

function StatCell({
    label,
    sub,
    value,
    valueClass,
}: {
    label: string;
    sub?: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <Card className="gap-1 py-2.5">
            <CardContent className="flex flex-col gap-1 px-3">
                <span className="text-[11px] text-muted-foreground">
                    {label}
                </span>
                <span
                    className={cn(
                        'font-mono text-lg leading-none font-bold tabular-nums',
                        valueClass,
                    )}
                >
                    {value}
                </span>
                {sub && (
                    <span className="text-[10px] text-muted-foreground">
                        {sub}
                    </span>
                )}
            </CardContent>
        </Card>
    );
}
