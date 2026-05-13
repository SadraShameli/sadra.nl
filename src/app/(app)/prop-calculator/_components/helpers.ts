export function formatCurrency(n: number, fractionDigits = 0): string {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    return `${sign}$${abs.toLocaleString('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    })}`;
}

export function formatPercent(p: number, fractionDigits = 1): string {
    return `${(p * 100).toFixed(fractionDigits)}%`;
}

export function formatDays(d: number): string {
    if (!Number.isFinite(d) || d <= 0) return '—';
    return `${d.toFixed(1)} d`;
}

export function formatCompactCurrency(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) {
        return `${sign}$${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 2)}M`;
    }
    if (abs >= 1000) {
        return `${sign}$${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}K`;
    }
    return formatCurrency(n);
}

export function formatR(r: number, digits = 2): string {
    const sign = r > 0 ? '+' : '';
    return `${sign}${r.toFixed(digits)}R`;
}

export function formatRatio(ratio: number, digits = 2): string {
    if (!Number.isFinite(ratio)) return '∞';
    return `${ratio.toFixed(digits)}x`;
}

export function formatStreak(streak: number): string {
    return `${Math.round(streak)}`;
}

export type DeltaKind = 'currency' | 'percent' | 'r' | 'days' | 'number';

export function formatDelta(
    current: number,
    pinned: number,
    kind: DeltaKind,
): { text: string; positive: boolean | null } {
    const diff = current - pinned;
    if (Math.abs(diff) < 1e-6) return { text: '·', positive: null };
    const sign = diff > 0 ? '+' : '';
    let text: string;
    switch (kind) {
        case 'currency':
            text = `${sign}${formatCurrency(diff)}`;
            break;
        case 'percent':
            text = `${sign}${(diff * 100).toFixed(1)}pp`;
            break;
        case 'r':
            text = `${sign}${diff.toFixed(2)}R`;
            break;
        case 'days':
            text = `${sign}${diff.toFixed(1)}d`;
            break;
        case 'number':
            text = `${sign}${diff.toFixed(2)}`;
            break;
    }
    return { text, positive: diff > 0 };
}
