'use client';

import { DrawdownKind, type Plan, TradingPhase } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { describeConsistencyBadge } from './consistencyBadge';
import { dailyLossLimitLabel } from './dailyLossLimitLabel';
import { ptddColor } from './metricColors';

interface BadgeProperties {
    label: string;
    value: string;
    valueClassName?: string;
}

interface PlanStatsBadgesProperties {
    plan: Plan;
}

export default function PlanStatsBadges({ plan }: PlanStatsBadgesProperties) {
    const ptdd = plan.profitTarget / plan.drawdown.amount;
    const payoutLabel = payoutShareLabel(plan);
    const consistencyLabel = describeConsistencyBadge(plan);
    const dailyLossLimitValue = dailyLossLimitLabel(plan.fundedDailyLossLimit);
    const isDailyLossLimitHard = plan.isDailyLossLimitTerminating(
        TradingPhase.Funded,
    );

    return (
        <div
            className={cn(
                'app-prop-calculator__plan-stats-badges',
                'flex flex-col gap-y-1 text-xs md:flex-row md:flex-wrap md:items-center md:gap-x-5',
            )}
        >
            <Badge
                label="PT:DD"
                value={`${ptdd.toFixed(2)}×`}
                valueClassName={ptddColor(ptdd)}
            />
            <Badge label="Drawdown" value={drawdownLabel(plan.drawdown.kind)} />
            <Badge label="Payout" value={payoutLabel} />
            {plan.minTradingDays > 0 && (
                <Badge label="Min days" value={String(plan.minTradingDays)} />
            )}
            {consistencyLabel !== null && (
                <Badge label="Consistency" value={consistencyLabel} />
            )}
            {dailyLossLimitValue !== null && (
                <Badge
                    label="Daily loss"
                    value={
                        isDailyLossLimitHard
                            ? `${dailyLossLimitValue} (hard, ends account)`
                            : dailyLossLimitValue
                    }
                    valueClassName={
                        isDailyLossLimitHard ? 'text-destructive' : undefined
                    }
                />
            )}
        </div>
    );
}

function Badge({ label, value, valueClassName }: BadgeProperties) {
    return (
        <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-mono font-semibold ${valueClassName ?? ''}`}>
                {value}
            </span>
        </span>
    );
}

function drawdownLabel(kind: DrawdownKind): string {
    if (kind === DrawdownKind.EodTrailing) return 'EOD trailing';
    return kind === DrawdownKind.IntradayTrailing
        ? 'Intraday trailing'
        : 'Static';
}

function payoutShareLabel(plan: Plan): string {
    const schedule = plan.payoutSplit.schedule;
    const first = schedule[0]?.tiers[0]?.traderShare ?? 1;
    const last = schedule.at(-1)?.tiers[0]?.traderShare ?? first;
    const firstPct = (first * 100).toFixed(0);
    const lastPct = (last * 100).toFixed(0);
    return firstPct === lastPct ? `${firstPct}%` : `${firstPct}–${lastPct}%`;
}
