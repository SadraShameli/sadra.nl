'use client';

import {
    type DailyLossLimitConfig,
    type DailyLossLimitDescriptor,
    DailyLossLimitShape,
    describeDailyLossLimit,
    DrawdownKind,
    type Plan,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

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
    const payoutPct = ((plan.payoutTiers[0]?.traderShare ?? 1) * 100).toFixed(
        0,
    );
    const hasConsistency = plan.consistency !== null;
    const consistencyPct = hasConsistency
        ? (plan.consistency.maxBestDayShare * 100).toFixed(0)
        : null;
    const dailyLossLimitValue = dailyLossLimitLabel(plan.fundedDailyLossLimit);

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
            <Badge label="Payout" value={`${payoutPct}%`} />
            {plan.minTradingDays > 0 && (
                <Badge label="Min days" value={String(plan.minTradingDays)} />
            )}
            {consistencyPct !== null && (
                <Badge label="Consistency" value={`${consistencyPct}% rule`} />
            )}
            {dailyLossLimitValue !== null && (
                <Badge label="Daily loss" value={dailyLossLimitValue} />
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

function dailyLossLimitLabel(config: DailyLossLimitConfig): null | string {
    return describeLabel(describeDailyLossLimit(config));
}

function describeLabel(descriptor: DailyLossLimitDescriptor): null | string {
    switch (descriptor.kind) {
        case DailyLossLimitShape.Fixed: {
            return `$${descriptor.amount.toLocaleString()}`;
        }
        case DailyLossLimitShape.None: {
            return null;
        }
        case DailyLossLimitShape.Range: {
            if (descriptor.max <= descriptor.min) {
                return `$${descriptor.min.toLocaleString()}`;
            }
            return `$${descriptor.min.toLocaleString()}–$${descriptor.max.toLocaleString()} (scales)`;
        }
        case DailyLossLimitShape.ShareOfPeak: {
            return `${(descriptor.share * 100).toFixed(0)}% of peak`;
        }
        case DailyLossLimitShape.Staged: {
            const before = describeLabel(descriptor.before);
            const after = describeLabel(descriptor.after);
            if (before === null) return after;
            if (after === null) return before;
            return `${before} → ${after}`;
        }
    }
}

function drawdownLabel(kind: DrawdownKind): string {
    if (kind === DrawdownKind.EodTrailing) return 'EOD trailing';
    if (kind === DrawdownKind.IntradayTrailing) return 'Intraday trailing';
    return 'Static';
}
