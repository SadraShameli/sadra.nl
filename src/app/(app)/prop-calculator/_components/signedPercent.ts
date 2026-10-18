import { formatPercent } from '~/lib/format';

export function formatSignedPercent(p: number, fractionDigits = 1): string {
    const sign = p > 0 ? '+' : '';
    return `${sign}${formatPercent(p, fractionDigits)}`;
}
