import { formatCompactCurrency, formatGateCurrency } from '~/lib/format';
import { describePayoutDayGate, type Plan } from '~/lib/prop-calculator';

export function describeFirstPayoutGate(plan: Plan): string {
    const gate = `${describePayoutDayGate(plan)} · ${formatCompactCurrency(plan.minPayoutProfit)} profit`;
    const perCycle = plan.minPayoutProfitPerCycle;
    const withCycle =
        perCycle === null
            ? gate
            : `${gate} · ${formatGateCurrency(perCycle, { compact: true })}/cycle`;
    const bufferBalance = plan.payoutBufferBalance();
    return bufferBalance === null
        ? withCycle
        : `${withCycle} · balance at least ${formatCompactCurrency(bufferBalance)}`;
}
