import { formatCount, formatCurrency, formatPercent } from '~/lib/format';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

export function estimateCurrency(estimate: UncertainValue): string {
    return estimate.standardError === null
        ? formatCurrency(estimate.value)
        : `${formatCurrency(estimate.value)} (SE ${formatCurrency(estimate.standardError)})`;
}

export function estimatePercent(estimate: UncertainValue): string {
    return estimate.standardError === null
        ? formatPercent(estimate.value)
        : `${formatPercent(estimate.value)} (SE ${formatPercent(estimate.standardError)})`;
}

export function formatTrials(trials: number): string {
    return `${formatCount(trials)} trials`;
}
