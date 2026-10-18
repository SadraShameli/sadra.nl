'use client';

import { DetailList, type DetailListItem } from '~/components/DetailList';
import { Badge } from '~/components/ui/badge';
import { type Plan, TradingPhase } from '~/lib/prop-calculator';
import { DRAWDOWN_KIND_TEXT } from '~/lib/prop-calculator/describe';
import { cn } from '~/lib/utilities';

import { describeConsistencyBadge } from './consistencyBadge';
import { dailyLossLimitLabel } from './dailyLossLimitLabel';
import { formatPtdd, planPtdd, ptddBench } from './ptddBench';

enum PlanStatId {
    Consistency = 'consistency',
    DailyLoss = 'daily-loss',
    Drawdown = 'drawdown',
    MinDays = 'min-days',
    Payout = 'payout',
    ProfitTargetToDrawdown = 'ptdd',
}

interface PlanStat {
    id: PlanStatId;
    label: string;
    value: string;
    valueClassName?: string;
}

interface PlanStatsBadgesProperties {
    plan: Plan;
}

export default function PlanStatsBadges({ plan }: PlanStatsBadgesProperties) {
    const stats = planStats(plan);
    return (
        <div
            className={cn(
                'app-prop-calculator__plan-stats-badges',
                '@container',
            )}
        >
            <DetailList
                className="@2xl:hidden"
                items={stats.map(detailItem)}
                label="Plan rules"
            />
            <div className="flex flex-wrap items-center gap-2 @max-2xl:hidden">
                {stats.map((stat) => (
                    <Badge className="gap-1.5 font-normal" key={stat.id}>
                        <span className="text-muted-foreground">
                            {stat.label}
                        </span>
                        <PlanStatValue
                            className="font-mono font-semibold"
                            stat={stat}
                        />
                    </Badge>
                ))}
            </div>
        </div>
    );
}

function detailItem(stat: PlanStat): DetailListItem {
    return {
        id: stat.id,
        label: stat.label,
        value: <PlanStatValue stat={stat} />,
    };
}

function payoutShareLabel(plan: Plan): string {
    const schedule = plan.payoutSplit.schedule;
    const first = schedule[0]?.tiers[0]?.traderShare ?? 1;
    const last = schedule.at(-1)?.tiers[0]?.traderShare ?? first;
    const firstPct = (first * 100).toFixed(0);
    const lastPct = (last * 100).toFixed(0);
    return firstPct === lastPct ? `${firstPct}%` : `${firstPct}–${lastPct}%`;
}

function planStats(plan: Plan): PlanStat[] {
    const ptdd = planPtdd(plan);
    const consistencyLabel = describeConsistencyBadge(plan);
    const dailyLossLimitValue = dailyLossLimitLabel(plan.fundedDailyLossLimit);
    const isDailyLossLimitHard = plan.isDailyLossLimitTerminating(
        TradingPhase.Funded,
    );
    return [
        {
            id: PlanStatId.ProfitTargetToDrawdown,
            label: 'PT:DD',
            value: `${formatPtdd(ptdd)} (${ptddBench(ptdd)})`,
        },
        {
            id: PlanStatId.Drawdown,
            label: 'Drawdown',
            value: DRAWDOWN_KIND_TEXT[plan.drawdown.kind],
            valueClassName: 'inline-block first-letter:uppercase',
        },
        {
            id: PlanStatId.Payout,
            label: 'Payout',
            value: payoutShareLabel(plan),
        },
        ...(plan.minTradingDays > 0
            ? [
                  {
                      id: PlanStatId.MinDays,
                      label: 'Min days',
                      value: String(plan.minTradingDays),
                  },
              ]
            : []),
        ...(consistencyLabel === null
            ? []
            : [
                  {
                      id: PlanStatId.Consistency,
                      label: 'Consistency',
                      value: consistencyLabel,
                  },
              ]),
        ...(dailyLossLimitValue === null
            ? []
            : [
                  {
                      id: PlanStatId.DailyLoss,
                      label: 'Daily loss',
                      value: isDailyLossLimitHard
                          ? `${dailyLossLimitValue} (hard, ends account)`
                          : dailyLossLimitValue,
                  },
              ]),
    ];
}

function PlanStatValue({
    className,
    stat,
}: {
    className?: string;
    stat: PlanStat;
}) {
    return (
        <span className={cn(className, stat.valueClassName)}>{stat.value}</span>
    );
}
