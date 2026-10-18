import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import { type UncertainValue } from '~/lib/prop-calculator/stats';

export function estimateCurrency(estimate: UncertainValue): string {
    const standardError =
        estimate.standardError === null
            ? NOT_APPLICABLE
            : formatCurrency(estimate.standardError);
    return `${formatCurrency(estimate.value)} (SE ${standardError})`;
}

export function estimatePercent(estimate: UncertainValue): string {
    const standardError =
        estimate.standardError === null
            ? NOT_APPLICABLE
            : formatPercent(estimate.standardError);
    return `${formatPercent(estimate.value)} (SE ${standardError})`;
}

export function formatTrials(trials: number): string {
    return `${trials.toLocaleString('en-US')} trials`;
}
