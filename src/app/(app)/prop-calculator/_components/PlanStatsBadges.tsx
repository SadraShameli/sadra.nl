'use client';

import { type Plan } from '~/lib/prop-calculator';

interface BadgeProps {
    label: string;
    value: string;
    valueClassName?: string;
}

interface PlanStatsBadgesProps {
    plan: Plan;
}

export default function PlanStatsBadges({ plan }: PlanStatsBadgesProps) {
    const ptdd = plan.profitTarget / plan.drawdown.amount;
    const payoutPct = ((plan.payoutTiers[0]?.traderShare ?? 1) * 100).toFixed(
        0,
    );
    const hasConsistency = plan.consistency !== null;
    const consistencyPct = hasConsistency
        ? (plan.consistency.maxBestDayShare * 100).toFixed(0)
        : null;

    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
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
            {plan.dailyLossLimit !== null && (
                <Badge
                    label="Daily loss"
                    value={`$${plan.dailyLossLimit.toLocaleString()}`}
                />
            )}
        </div>
    );
}

function Badge({ label, value, valueClassName }: BadgeProps) {
    return (
        <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-mono font-semibold ${valueClassName ?? ''}`}>
                {value}
            </span>
        </span>
    );
}

function drawdownLabel(kind: string): string {
    if (kind === 'eod-trailing') return 'EOD trailing';
    if (kind === 'intraday-trailing') return 'Intraday trailing';
    return 'Static';
}

function ptddColor(ratio: number): string {
    if (ratio <= 1) return 'text-emerald-400';
    if (ratio <= 1.5) return 'text-foreground';
    if (ratio <= 2) return 'text-amber-400';
    return 'text-rose-400';
}
