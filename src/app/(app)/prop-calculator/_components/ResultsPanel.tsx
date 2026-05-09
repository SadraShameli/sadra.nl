'use client';

import { type Plan, type SimOutputs } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { Card } from '~/components/ui/Card';

import { Button } from '~/components/ui/Button';

import {
    formatCompactCurrency,
    formatCurrency,
    formatDays,
    formatDelta,
    formatPercent,
    formatR,
    formatRatio,
    formatStreak,
} from './helpers';
import InfoPopover from './InfoPopover';
import { kpiDescriptions } from './kpiDescriptions';

interface ResultsPanelProps {
    plan: Plan;
    result: SimOutputs;
    pinned: SimOutputs | null;
    onPin: () => void;
    onUnpin: () => void;
    isPending: boolean;
}

interface DeltaChip {
    text: string;
    positive: boolean | null;
}

interface KpiProps {
    label: string;
    value: string;
    sub?: string;
    accent?: 'positive' | 'negative' | 'neutral';
    delta?: DeltaChip | null;
    info: { title: string; body: React.ReactNode };
}

function Kpi({ label, value, sub, accent = 'neutral', delta, info }: KpiProps) {
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

interface CostBreakdownBodyProps {
    result: SimOutputs;
    plan: Plan;
}

function CostBreakdownBody({ result, plan }: CostBreakdownBodyProps) {
    const cb = result.costBreakdown;
    const evalListed = plan.fees.oneTimeEval;
    const activationListed = plan.fees.activation;
    const rows: { label: string; value: string }[] = [];
    if (evalListed > 0) {
        rows.push({
            label: 'Eval fee',
            value:
                evalListed !== cb.evalFee
                    ? `${formatCompactCurrency(evalListed)} → ${formatCurrency(cb.evalFee)}`
                    : formatCurrency(cb.evalFee),
        });
    }
    if (activationListed > 0) {
        rows.push({
            label: 'Activation',
            value:
                activationListed !== cb.activationFee
                    ? `${formatCompactCurrency(activationListed)} → ${formatCurrency(cb.activationFee)}`
                    : formatCurrency(cb.activationFee),
        });
    }
    if (cb.monthlySubsTotal > 0) {
        rows.push({
            label: 'Monthly subs',
            value: formatCurrency(cb.monthlySubsTotal),
        });
    }
    if (cb.resetFeesTotal > 0) {
        rows.push({
            label: 'Reset fees',
            value: formatCurrency(cb.resetFeesTotal),
        });
    }
    return (
        <div className="flex flex-col gap-1.5">
            <p>{kpiDescriptions.totalCost}</p>
            <div className="mt-1 flex flex-col gap-1 rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[11px] tabular-nums">
                {rows.map((row) => (
                    <div
                        key={row.label}
                        className="flex items-center justify-between gap-3"
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
            </div>
        </div>
    );
}

export default function ResultsPanel({
    plan,
    result,
    pinned,
    onPin,
    onUnpin,
    isPending,
}: ResultsPanelProps) {
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
              text: dCost.text,
              positive: dCost.positive === null ? null : !dCost.positive,
          }
        : null;
    const dDaysInverted = dDays
        ? {
              text: dDays.text,
              positive: dDays.positive === null ? null : !dDays.positive,
          }
        : null;
    const passAccent: KpiProps['accent'] =
        result.passProbability >= 0.6
            ? 'positive'
            : result.passProbability < 0.3
              ? 'negative'
              : 'neutral';
    const netAccent: KpiProps['accent'] =
        result.expectedMonthlyNet > 0
            ? 'positive'
            : result.expectedMonthlyNet < 0
              ? 'negative'
              : 'neutral';

    const expectancyAccent: KpiProps['accent'] =
        result.expectancyR > 0.05
            ? 'positive'
            : result.expectancyR < -0.05
              ? 'negative'
              : 'neutral';
    const profitFactorAccent: KpiProps['accent'] =
        result.profitFactor >= 1.5
            ? 'positive'
            : result.profitFactor < 1.0
              ? 'negative'
              : 'neutral';
    const roiAccent: KpiProps['accent'] =
        result.roiOnCost > 0
            ? 'positive'
            : result.roiOnCost < 0
              ? 'negative'
              : 'neutral';
    const showCycleEconomics = result.expectedAttempts > 1.01;

    return (
        <div
            className={cn(
                'flex flex-col gap-4 transition-opacity',
                isPending && 'opacity-60',
            )}
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
                    variant={pinned ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={pinned ? onUnpin : onPin}
                >
                    {pinned ? '📌 Unpin' : '📌 Pin scenario'}
                </Button>
            </div>

            <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Outcome
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <Kpi
                        label="Pass probability"
                        value={formatPercent(result.passProbability)}
                        sub={`${formatPercent(result.bustProbability)} bust · ${formatPercent(result.timeoutProbability)} timeout`}
                        accent={passAccent}
                        delta={dPass}
                        info={{
                            title: 'Pass probability',
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
                        }}
                    />
                    <Kpi
                        label="Clean pass"
                        value={formatPercent(result.cleanPassProbability)}
                        sub={
                            plan.consistency
                                ? `${formatPercent(plan.consistency.maxBestDayShare)} single-day cap`
                                : 'no consistency rule'
                        }
                        info={{
                            title: 'Clean pass',
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
                        }}
                    />
                    <Kpi
                        label="Avg days to pass"
                        value={formatDays(result.expectedDaysToPass)}
                        sub={`min ${plan.minTradingDays} required`}
                        delta={dDaysInverted}
                        info={{
                            title: 'Avg days to pass',
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
                        }}
                    />
                    <Kpi
                        label="Total cost (avg)"
                        value={formatCurrency(result.expectedTotalCost)}
                        sub={`P90 budget ${formatCurrency(result.expectedSpendP90)}`}
                        delta={dCostInverted}
                        info={{
                            title: 'Total cost (avg)',
                            body: (
                                <CostBreakdownBody
                                    result={result}
                                    plan={plan}
                                />
                            ),
                        }}
                    />
                    <Kpi
                        label="First payout"
                        value={
                            result.expectedFirstPayoutDay > 0
                                ? `day ${result.expectedFirstPayoutDay.toFixed(0)}`
                                : '—'
                        }
                        sub={`${plan.minDaysAfterPassForPayout}d min · ${formatCompactCurrency(plan.minPayoutProfit)} buffer`}
                        info={{
                            title: 'First payout',
                            body: <p>{kpiDescriptions.firstPayout}</p>,
                        }}
                    />
                    <Kpi
                        label="Monthly net (est)"
                        value={formatCurrency(result.expectedMonthlyNet)}
                        sub={`payout ${formatCurrency(result.expectedGrossPayout)} avg`}
                        accent={netAccent}
                        delta={dNet}
                        info={{
                            title: 'Monthly net (est)',
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
                        }}
                    />
                </div>
            </div>

            <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Trading edge
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <Kpi
                        label="Expectancy"
                        value={formatR(result.expectancyR)}
                        sub={`${formatCurrency(result.expectancyDollars)} per trade`}
                        accent={expectancyAccent}
                        info={{
                            title: 'Expectancy',
                            body: (
                                <>
                                    <p>{kpiDescriptions.expectancy}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        {formatR(result.expectancyR)} ·{' '}
                                        {formatCurrency(
                                            result.expectancyDollars,
                                        )}{' '}
                                        per trade
                                    </p>
                                </>
                            ),
                        }}
                    />
                    <Kpi
                        label="Profit factor"
                        value={formatRatio(result.profitFactor)}
                        sub={
                            result.profitFactor >= 1.5
                                ? 'healthy'
                                : result.profitFactor >= 1.0
                                  ? 'marginal'
                                  : 'losing'
                        }
                        accent={profitFactorAccent}
                        info={{
                            title: 'Profit factor',
                            body: <p>{kpiDescriptions.profitFactor}</p>,
                        }}
                    />
                    <Kpi
                        label="Max losing streak"
                        value={`${formatStreak(result.maxLosingStreakP50)} / ${formatStreak(result.maxLosingStreakP95)}`}
                        sub="P50 / P95"
                        info={{
                            title: 'Max losing streak',
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
                        }}
                    />
                    <Kpi
                        label="Risk of ruin"
                        value={formatPercent(result.bustProbability)}
                        sub="bust before passing"
                        accent={
                            result.bustProbability > 0.4
                                ? 'negative'
                                : 'neutral'
                        }
                        info={{
                            title: 'Risk of ruin',
                            body: <p>{kpiDescriptions.riskOfRuin}</p>,
                        }}
                    />
                    <Kpi
                        label="Risk of 5+ losses"
                        value={formatPercent(result.risk5LossesPercent)}
                        sub={
                            result.risk10LossesPercent > 0.05
                                ? `10+: ${formatPercent(result.risk10LossesPercent)}`
                                : '10+: rare'
                        }
                        accent={
                            result.risk5LossesPercent > 0.5
                                ? 'negative'
                                : 'neutral'
                        }
                        info={{
                            title: 'Risk of 5+ consecutive losses',
                            body: <p>{kpiDescriptions.risk5Losses}</p>,
                        }}
                    />
                    <Kpi
                        label="ROI on cost"
                        value={formatPercent(result.roiOnCost)}
                        sub={`net ${formatCurrency(result.expectedNet)} / cost`}
                        accent={roiAccent}
                        info={{
                            title: 'ROI on cost',
                            body: <p>{kpiDescriptions.roiOnCost}</p>,
                        }}
                    />
                    <Kpi
                        label="Trades per pass"
                        value={
                            result.tradesPerSuccessfulAttempt > 0
                                ? `${Math.round(result.tradesPerSuccessfulAttempt)}`
                                : '—'
                        }
                        sub="when you pass"
                        info={{
                            title: 'Trades per pass',
                            body: <p>{kpiDescriptions.tradesPerPass}</p>,
                        }}
                    />
                    <Kpi
                        label="Max drawdown"
                        value={formatCompactCurrency(result.maxDrawdownP95)}
                        sub={`P50 ${formatCompactCurrency(result.maxDrawdownP50)}`}
                        info={{
                            title: 'Max drawdown',
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
                        }}
                    />
                </div>
            </div>

            {showCycleEconomics && (
                <div>
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Cycle economics
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <Kpi
                            label="Expected attempts"
                            value={result.expectedAttempts.toFixed(2)}
                            sub={`P90: ${result.expectedAttemptsP90.toFixed(0)}`}
                            info={{
                                title: 'Expected attempts',
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
                            }}
                        />
                        <Kpi
                            label="Gross spend"
                            value={formatCurrency(result.expectedGrossSpend)}
                            sub={`P90 budget: ${formatCurrency(result.expectedSpendP90)}`}
                            info={{
                                title: 'Expected gross spend',
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
                            }}
                        />
                        <Kpi
                            label="Break-even"
                            value={formatCurrency(result.breakEvenFundedProfit)}
                            sub="funded P&L to recoup"
                            info={{
                                title: 'Break-even funded P&L',
                                body: <p>{kpiDescriptions.breakEven}</p>,
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
