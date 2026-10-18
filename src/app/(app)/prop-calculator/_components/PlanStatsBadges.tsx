'use client';

import { Badge } from '~/components/ui/badge';
import { type Plan, TradingPhase } from '~/lib/prop-calculator';
import { DRAWDOWN_KIND_TEXT } from '~/lib/prop-calculator/describe';
import { cn } from '~/lib/utilities';

import { describeConsistencyBadge } from './consistencyBadge';
import { dailyLossLimitLabel } from './dailyLossLimitLabel';
import { ptddColor } from './metricColors';

interface PlanStatProperties {
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
                'flex flex-wrap items-center gap-2',
            )}
        >
            <PlanStat
                label="PT:DD"
                value={`${ptdd.toFixed(2)}×`}
                valueClassName={ptddColor(ptdd)}
            />
            <PlanStat
                label="Drawdown"
                value={DRAWDOWN_KIND_TEXT[plan.drawdown.kind]}
                valueClassName="inline-block first-letter:uppercase"
            />
            <PlanStat label="Payout" value={payoutLabel} />
            {plan.minTradingDays > 0 && (
                <PlanStat
                    label="Min days"
                    value={String(plan.minTradingDays)}
                />
            )}
            {consistencyLabel !== null && (
                <PlanStat label="Consistency" value={consistencyLabel} />
            )}
            {dailyLossLimitValue !== null && (
                <PlanStat
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

function payoutShareLabel(plan: Plan): string {
    const schedule = plan.payoutSplit.schedule;
    const first = schedule[0]?.tiers[0]?.traderShare ?? 1;
    const last = schedule.at(-1)?.tiers[0]?.traderShare ?? first;
    const firstPct = (first * 100).toFixed(0);
    const lastPct = (last * 100).toFixed(0);
    return firstPct === lastPct ? `${firstPct}%` : `${firstPct}–${lastPct}%`;
}

function PlanStat({ label, value, valueClassName }: PlanStatProperties) {
    return (
        <Badge className="gap-1.5 font-normal" variant="outline">
            <span className="text-muted-foreground">{label}</span>
            <span className={cn('font-mono font-semibold', valueClassName)}>
                {value}
            </span>
        </Badge>
    );
}
