import { formatCompactCurrency, formatGateCurrency } from '~/lib/format';
import { type Plan } from '~/lib/prop-calculator';

export function describeFirstPayoutGate(plan: Plan): string {
    const gate = `${plan.minDaysAfterPassForPayout}d min · ${formatCompactCurrency(plan.minPayoutProfit)} buffer`;
    const perCycle = plan.minPayoutProfitPerCycle;
    return perCycle === null
        ? gate
        : `${gate} · ${formatGateCurrency(perCycle, { compact: true })}/cycle`;
}
