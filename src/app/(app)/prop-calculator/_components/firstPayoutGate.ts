import { formatCompactCurrency, formatCurrency } from '~/lib/format';
import { type Plan } from '~/lib/prop-calculator';

export function describeFirstPayoutGate(plan: Plan): string {
    const gate = `${plan.minDaysAfterPassForPayout}d min · ${formatCompactCurrency(plan.minPayoutProfit)} buffer`;
    const perCycle = plan.minPayoutProfitPerCycle;
    return perCycle === null
        ? gate
        : `${gate} · ${formatPerCycleGate(perCycle)}/cycle`;
}

function formatPerCycleGate(amount: number): string {
    return Number.isSafeInteger(amount)
        ? formatCompactCurrency(amount)
        : formatCurrency(amount, 2);
}
