'use client';

import { Pin, PinOff } from 'lucide-react';

import Eyebrow from '~/components/Eyebrow';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import {
    formatCompactCurrency,
    formatCurrency,
    formatDays,
    formatDelta,
    formatPercent,
    formatStreak,
} from '~/lib/format';
import { type Plan, type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { kpiDescriptions } from './kpiDescriptions';

interface CostBreakdownBodyProperties {
    plan: Plan;
    result: SimOutputs;
}

interface DeltaChip {
    positive: boolean | null;
    text: string;
}

interface KpiProperties {
    accent?: 'negative' | 'neutral' | 'positive';
    delta?: DeltaChip | null;
    info: { body: React.ReactNode; title: string };
    label: string;
    sub?: string;
    value: string;
}

interface ResultsPanelProperties {
    isPending: boolean;
    onPin: () => void;
    onUnpin: () => void;
    pinned: null | SimOutputs;
    plan: Plan;
    result: SimOutputs;
}

export default function ResultsPanel({
    isPending,
    onPin,
    onUnpin,
    pinned,
    plan,
    result,
}: ResultsPanelProperties) {
    const dPass = pinned
        ? formatDelta(result.passProbability, pinned.passProbability, 'percent')
        : null;
    const dCost = pinned
        ? formatDelta(
              result.expectedTotalCost,
              pinned.expectedTotalCost,
              'currency',
          )
        : null;
    const dDays = pinned
        ? formatDelta(
              result.expectedDaysToPass,
              pinned.expectedDaysToPass,
              'days',
          )
        : null;
    const dNet = pinned
        ? formatDelta(
              result.expectedMonthlyNet,
              pinned.expectedMonthlyNet,
              'currency',
          )
        : null;
    const dCostInverted = dCost
        ? {
              positive: dCost.positive === null ? null : !dCost.positive,
              text: dCost.text,
          }
        : null;
    const dDaysInverted = dDays
        ? {
              positive: dDays.positive === null ? null : !dDays.positive,
              text: dDays.text,
          }
        : null;
    const passAccent: KpiProperties['accent'] =
        result.passProbability >= 0.6
            ? 'positive'
            : result.passProbability < 0.3
              ? 'negative'
              : 'neutral';
    const netAccent: KpiProperties['accent'] =
        result.expectedMonthlyNet > 0
            ? 'positive'
            : result.expectedMonthlyNet < 0
              ? 'negative'
              : 'neutral';

    const roiAccent: KpiProperties['accent'] =
        result.roiOnCost > 0
            ? 'positive'
            : result.roiOnCost < 0
              ? 'negative'
              : 'neutral';
    const isShowCycleEconomics = result.expectedAttempts > 1.01;

    return (
        <div
            className={cn(
                'app-prop-calculator__results',
                'flex flex-col gap-4 transition-opacity',
                isPending && 'opacity-60',
            )}
            data-state={isPending ? 'pending' : 'idle'}
        >
            <div className="flex items-center justify-between">
                {pinned ? (
                    <span className="text-xs text-muted-foreground">
                        Pinned: {pinned.accountSize.toLocaleString()} ·
                        comparing live vs pinned
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground">
                        Pin a scenario to compare deltas
                    </span>
                )}
                <Button
                    className="flex h-7 items-center gap-1.5 px-2 text-xs"
                    onClick={pinned ? onUnpin : onPin}
                    size="sm"
                    variant={pinned ? 'default' : 'outline'}
                >
                    {pinned ? (
                        <>
                            <PinOff className="size-3.5" />
                            Unpin
                        </>
                    ) : (
                        <>
                            <Pin className="size-3.5" />
                            Pin scenario
                        </>
                    )}
                </Button>
            </div>

            <div>
                <Eyebrow as="h3" className="mb-2">
                    Outcome
                </Eyebrow>
                <div className="grid grid-cols-2 gap-3">
                    <Kpi
                        accent={passAccent}
                        delta={dPass}
                        info={{
                            body: (
                                <>
                                    <p>{kpiDescriptions.passProbability}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        {formatPercent(
                                            result.cleanPassProbability,
                                        )}{' '}
                                        clean ·{' '}
                                        {formatPercent(
                                            result.passProbability -
                                                result.cleanPassProbability,
                                        )}{' '}
                                        with violation ·{' '}
                                        {formatPercent(result.bustProbability)}{' '}
                                        bust ·{' '}
                                        {formatPercent(
                                            result.timeoutProbability,
                                        )}{' '}
                                        timeout
                                    </p>
                                </>
                            ),
                            title: 'Pass probability',
                        }}
                        label="Pass probability"
                        sub={`${formatPercent(result.bustProbability)} bust · ${formatPercent(result.timeoutProbability)} timeout`}
                        value={formatPercent(result.passProbability)}
                    />
                    <Kpi
                        info={{
                            body: (
                                <>
                                    <p>{kpiDescriptions.cleanPass}</p>
                                    {plan.consistency && (
                                        <p className="mt-2 font-mono text-xs">
                                            Rule: best day ≤{' '}
                                            {formatPercent(
                                                plan.consistency
                                                    .maxBestDayShare,
                                            )}{' '}
                                            of total profit
                                        </p>
                                    )}
                                </>
                            ),
                            title: 'Clean pass',
                        }}
                        label="Clean pass"
                        sub={
                            plan.consistency
                                ? `${formatPercent(plan.consistency.maxBestDayShare)} single-day cap`
                                : 'no consistency rule'
                        }
                        value={formatPercent(result.cleanPassProbability)}
                    />
                    <Kpi
                        delta={dDaysInverted}
                        info={{
                            body: (
                                <>
                                    <p>{kpiDescriptions.avgDaysToPass}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        P25 {formatDays(result.daysToPassP25)} ·
                                        P50 {formatDays(result.daysToPassP50)} ·
                                        P75 {formatDays(result.daysToPassP75)}
                                    </p>
                                </>
                            ),
                            title: 'Avg days to pass',
                        }}
                        label="Avg days to pass"
                        sub={`min ${plan.minTradingDays} required`}
                        value={formatDays(result.expectedDaysToPass)}
                    />
                    <Kpi
                        delta={dCostInverted}
                        info={{
                            body: (
                                <CostBreakdownBody
                                    plan={plan}
                                    result={result}
                                />
                            ),
                            title: 'Total cost (avg)',
                        }}
                        label="Total cost (avg)"
                        sub={`P90 budget ${formatCurrency(result.expectedSpendP90)}`}
                        value={formatCurrency(result.expectedTotalCost)}
                    />
                    <Kpi
                        info={{
                            body: <p>{kpiDescriptions.firstPayout}</p>,
                            title: 'First payout',
                        }}
                        label="First payout"
                        sub={`${plan.minDaysAfterPassForPayout}d min · ${formatCompactCurrency(plan.minPayoutProfit)} buffer`}
                        value={
                            result.expectedFirstPayoutDay > 0
                                ? `day ${result.expectedFirstPayoutDay.toFixed(0)}`
                                : '—'
                        }
                    />
                    <Kpi
                        accent={netAccent}
                        delta={dNet}
                        info={{
                            body: (
                                <>
                                    <p>{kpiDescriptions.monthlyNet}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        Gross{' '}
                                        {formatCurrency(
                                            result.expectedGrossPayout,
                                        )}{' '}
                                        − cost{' '}
                                        {formatCurrency(
                                            result.expectedTotalCost,
                                        )}{' '}
                                        = net{' '}
                                        {formatCurrency(result.expectedNet)}
                                    </p>
                                </>
                            ),
                            title: 'Monthly net (est)',
                        }}
                        label="Monthly net (est)"
                        sub={`payout ${formatCurrency(result.expectedGrossPayout)} avg`}
                        value={formatCurrency(result.expectedMonthlyNet)}
                    />
                </div>
            </div>

            <div>
                <Eyebrow as="h3" className="mb-2">
                    Trading edge
                </Eyebrow>
                <div className="grid grid-cols-2 gap-3">
                    <Kpi
                        info={{
                            body: (
                                <>
                                    <p>{kpiDescriptions.maxLosingStreak}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        P50{' '}
                                        {formatStreak(
                                            result.maxLosingStreakP50,
                                        )}{' '}
                                        · P95{' '}
                                        {formatStreak(
                                            result.maxLosingStreakP95,
                                        )}
                                    </p>
                                </>
                            ),
                            title: 'Max losing streak',
                        }}
                        label="Max losing streak"
                        sub="P50 / P95"
                        value={`${formatStreak(result.maxLosingStreakP50)} / ${formatStreak(result.maxLosingStreakP95)}`}
                    />
                    <Kpi
                        accent={
                            result.bustProbability > 0.4
                                ? 'negative'
                                : 'neutral'
                        }
                        info={{
                            body: <p>{kpiDescriptions.riskOfRuin}</p>,
                            title: 'Risk of ruin',
                        }}
                        label="Risk of ruin"
                        sub="bust before passing"
                        value={formatPercent(result.bustProbability)}
                    />
                    <Kpi
                        accent={
                            result.risk5LossesPercent > 0.5
                                ? 'negative'
                                : 'neutral'
                        }
                        info={{
                            body: <p>{kpiDescriptions.risk5Losses}</p>,
                            title: 'Risk of 5+ consecutive losses',
                        }}
                        label="Risk of 5+ losses"
                        sub={
                            result.risk10LossesPercent > 0.05
                                ? `10+: ${formatPercent(result.risk10LossesPercent)}`
                                : '10+: rare'
                        }
                        value={formatPercent(result.risk5LossesPercent)}
                    />
                    <Kpi
                        accent={roiAccent}
                        info={{
                            body: <p>{kpiDescriptions.roiOnCost}</p>,
                            title: 'ROI on cost',
                        }}
                        label="ROI on cost"
                        sub={`net ${formatCurrency(result.expectedNet)} / cost`}
                        value={formatPercent(result.roiOnCost)}
                    />
                    <Kpi
                        info={{
                            body: <p>{kpiDescriptions.tradesPerPass}</p>,
                            title: 'Trades per pass',
                        }}
                        label="Trades per pass"
                        sub="when you pass"
                        value={
                            result.tradesPerSuccessfulAttempt > 0
                                ? String(
                                      Math.round(
                                          result.tradesPerSuccessfulAttempt,
                                      ),
                                  )
                                : '—'
                        }
                    />
                    <Kpi
                        info={{
                            body: (
                                <>
                                    <p>{kpiDescriptions.maxDrawdown}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        P50{' '}
                                        {formatCompactCurrency(
                                            result.maxDrawdownP50,
                                        )}{' '}
                                        · P95{' '}
                                        {formatCompactCurrency(
                                            result.maxDrawdownP95,
                                        )}
                                    </p>
                                </>
                            ),
                            title: 'Max drawdown',
                        }}
                        label="Max drawdown"
                        sub={`P50 ${formatCompactCurrency(result.maxDrawdownP50)}`}
                        value={formatCompactCurrency(result.maxDrawdownP95)}
                    />
                </div>
            </div>

            {isShowCycleEconomics && (
                <div>
                    <Eyebrow as="h3" className="mb-2">
                        Cycle economics
                    </Eyebrow>
                    <div className="grid grid-cols-2 gap-3">
                        <Kpi
                            info={{
                                body: (
                                    <>
                                        <p>
                                            {kpiDescriptions.expectedAttempts}
                                        </p>
                                        <p className="mt-2 font-mono text-xs">
                                            Mean{' '}
                                            {result.expectedAttempts.toFixed(2)}{' '}
                                            · P90{' '}
                                            {result.expectedAttemptsP90.toFixed(
                                                0,
                                            )}
                                        </p>
                                    </>
                                ),
                                title: 'Expected attempts',
                            }}
                            label="Expected attempts"
                            sub={`P90: ${result.expectedAttemptsP90.toFixed(0)}`}
                            value={result.expectedAttempts.toFixed(2)}
                        />
                        <Kpi
                            info={{
                                body: (
                                    <>
                                        <p>{kpiDescriptions.expectedSpend}</p>
                                        <p className="mt-2 font-mono text-xs">
                                            Mean{' '}
                                            {formatCurrency(
                                                result.expectedGrossSpend,
                                            )}{' '}
                                            · P90{' '}
                                            {formatCurrency(
                                                result.expectedSpendP90,
                                            )}
                                        </p>
                                    </>
                                ),
                                title: 'Expected gross spend',
                            }}
                            label="Gross spend"
                            sub={`P90 budget: ${formatCurrency(result.expectedSpendP90)}`}
                            value={formatCurrency(result.expectedGrossSpend)}
                        />
                        <Kpi
                            info={{
                                body: <p>{kpiDescriptions.breakEven}</p>,
                                title: 'Break-even funded P&L',
                            }}
                            label="Break-even"
                            sub="funded P&L to recoup"
                            value={formatCurrency(result.breakEvenFundedProfit)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function CostBreakdownBody({ plan, result }: CostBreakdownBodyProperties) {
    const callback = result.costBreakdown;
    const evalListed = plan.fees.oneTimeEval;
    const activationListed = plan.fees.activation;
    const rows: { label: string; value: string }[] = [];
    if (evalListed > 0) {
        const evalDiscounted = callback.perAccountEvalFee;
        rows.push({
            label: 'Eval fee',
            value:
                Math.abs(evalListed - evalDiscounted) > 0.01
                    ? `${formatCompactCurrency(evalListed)} → ${formatCurrency(evalDiscounted)}`
                    : formatCurrency(evalDiscounted),
        });
    }
    if (activationListed > 0) {
        const activationDiscounted = callback.perAccountActivationFee;
        rows.push({
            label: 'Activation',
            value:
                Math.abs(activationListed - activationDiscounted) > 0.01
                    ? `${formatCompactCurrency(activationListed)} → ${formatCurrency(activationDiscounted)}`
                    : formatCurrency(activationDiscounted),
        });
    }
    if (callback.monthlySubsTotal > 0) {
        rows.push({
            label: 'Monthly subs',
            value: formatCurrency(callback.monthlySubsTotal),
        });
    }
    if (callback.resetFeesTotal > 0) {
        rows.push({
            label: 'Reset fees',
            value: formatCurrency(callback.resetFeesTotal),
        });
    }
    return (
        <div className="flex flex-col gap-1.5">
            <p>{kpiDescriptions.totalCost}</p>
            <Card className="mt-1 gap-1 py-2">
                <CardContent className="flex flex-col gap-1 px-2 font-mono text-[11px] tabular-nums">
                    {rows.map((row) => (
                        <div
                            className="flex items-center justify-between gap-3"
                            key={row.label}
                        >
                            <span className="text-muted-foreground">
                                {row.label}
                            </span>
                            <span className="text-foreground">{row.value}</span>
                        </div>
                    ))}
                    <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-border/40 pt-1 font-semibold">
                        <span>Total avg</span>
                        <span>{formatCurrency(result.expectedTotalCost)}</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function Kpi({
    accent = 'neutral',
    delta,
    info,
    label,
    sub,
    value,
}: KpiProperties) {
    const accentClass =
        accent === 'positive'
            ? 'text-emerald-400'
            : accent === 'negative'
              ? 'text-rose-400'
              : 'text-foreground';
    const deltaClass =
        delta?.positive === true
            ? 'text-emerald-400'
            : delta?.positive === false
              ? 'text-rose-400'
              : 'text-muted-foreground';
    return (
        <Card className="gap-1 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {label}
                </span>
                <InfoPopover title={info.title}>{info.body}</InfoPopover>
            </div>
            <span
                className={cn(
                    'font-mono text-2xl font-semibold tabular-nums',
                    accentClass,
                )}
            >
                {value}
            </span>
            {sub && (
                <span className="text-xs text-muted-foreground">{sub}</span>
            )}
            {delta && (
                <span
                    className={cn(
                        'mt-0.5 font-mono text-[11px] tabular-nums',
                        deltaClass,
                    )}
                >
                    {delta.text} vs pinned
                </span>
            )}
        </Card>
    );
}
