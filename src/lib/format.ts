import { format, isSameDay, isSameYear, parseISO } from 'date-fns';

export type DeltaKind = 'currency' | 'days' | 'number' | 'percent' | 'r';

export const NOT_APPLICABLE = 'n/a';

const CONJUNCTION_LIST = new Intl.ListFormat('en-GB', {
    style: 'long',
    type: 'conjunction',
});

const CURRENCY_NUMBER_FORMATS = new Map<number, Intl.NumberFormat>();

export function formatCompactCurrency(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) {
        return `${sign}$${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 2)}M`;
    }
    return abs >= 1000
        ? `${sign}$${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}K`
        : formatCurrency(n);
}

export function formatConjunctionList(items: readonly string[]): string {
    return CONJUNCTION_LIST.format(items);
}

export function formatCurrency(n: number, fractionDigits = 0): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${currencyNumberFormat(fractionDigits).format(Math.abs(n))}`;
}

export function formatDays(d: number): string {
    return !Number.isFinite(d) || d <= 0 ? NOT_APPLICABLE : `${d.toFixed(1)} d`;
}

export function formatDelta(
    current: number,
    pinned: number,
    kind: DeltaKind,
): { positive: boolean | null; text: string } {
    const diff = current - pinned;
    if (Math.abs(diff) < 1e-6) return { positive: null, text: '·' };
    const sign = diff > 0 ? '+' : '';
    let text: string;
    switch (kind) {
        case 'currency': {
            text = `${sign}${formatCurrency(diff)}`;
            break;
        }
        case 'days': {
            text = `${sign}${diff.toFixed(1)}d`;
            break;
        }
        case 'number': {
            text = `${sign}${diff.toFixed(2)}`;
            break;
        }
        case 'percent': {
            text = `${sign}${(diff * 100).toFixed(1)}pp`;
            break;
        }
        case 'r': {
            text = `${sign}${diff.toFixed(2)}R`;
            break;
        }
    }
    return { positive: diff > 0, text };
}

export function formatFiniteCurrency(n: number, fractionDigits = 0): string {
    return Number.isFinite(n)
        ? formatCurrency(n, fractionDigits)
        : NOT_APPLICABLE;
}

export function formatGateCurrency(
    amount: number,
    { compact = false }: { compact?: boolean } = {},
): string {
    if (!Number.isSafeInteger(amount)) return formatCurrency(amount, 2);
    return compact ? formatCompactCurrency(amount) : formatCurrency(amount);
}

export function formatOptionalPercent(
    p: null | number,
    fractionDigits = 1,
): string {
    return p === null ? NOT_APPLICABLE : formatPercent(p, fractionDigits);
}

export function formatPercent(p: number, fractionDigits = 1): string {
    return `${(p * 100).toFixed(fractionDigits)}%`;
}

export function formatR(r: number, digits = 2): string {
    const sign = r > 0 ? '+' : '';
    return `${sign}${r.toFixed(digits)}R`;
}

export function formatRatio(ratio: number, digits = 2): string {
    return Number.isFinite(ratio) ? `${ratio.toFixed(digits)}x` : '∞';
}

export function formatStreak(streak: number): string {
    return String(Math.round(streak));
}

function currencyNumberFormat(fractionDigits: number): Intl.NumberFormat {
    const cached = CURRENCY_NUMBER_FORMATS.get(fractionDigits);
    if (cached !== undefined) return cached;
    const created = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
    });
    CURRENCY_NUMBER_FORMATS.set(fractionDigits, created);
    return created;
}

const DISPLAY_DATE_PATTERN = 'd MMM yyyy';
const DISPLAY_DAY_MONTH_PATTERN = 'd MMM';
const DISPLAY_DATE_TIME_PATTERN = 'd MMM yyyy, HH:mm';
const DISPLAY_MONTH_PATTERN = 'MMM yyyy';
const DISPLAY_TIME_PATTERN = 'HH:mm';
const DISPLAY_WEEKDAY_DATE_PATTERN = 'EEEE d MMM yyyy';
const DISPLAY_TIME_WITH_SECONDS_PATTERN = 'HH:mm:ss';
const DISPLAY_RANGE_SEPARATOR = ' – ';

export function formatDisplayDate(value: Date | string): string {
    return format(displayDateOf(value), DISPLAY_DATE_PATTERN);
}

export function formatDisplayDateRange(
    from: Date | string,
    to: Date | string,
): string {
    const start = displayDateOf(from);
    const end = displayDateOf(to);
    if (isSameDay(start, end)) return formatDisplayDate(end);
    const startText = format(
        start,
        isSameYear(start, end)
            ? DISPLAY_DAY_MONTH_PATTERN
            : DISPLAY_DATE_PATTERN,
    );
    return `${startText}${DISPLAY_RANGE_SEPARATOR}${formatDisplayDate(end)}`;
}

export function formatDisplayDateTime(value: Date | string): string {
    return format(displayDateOf(value), DISPLAY_DATE_TIME_PATTERN);
}

export function formatDisplayMonth(value: Date | string): string {
    return format(displayDateOf(value), DISPLAY_MONTH_PATTERN);
}

export function formatDisplayTime(value: Date | string): string {
    return format(displayDateOf(value), DISPLAY_TIME_PATTERN);
}

export function formatDisplayTimeWithSeconds(value: Date | string): string {
    return format(displayDateOf(value), DISPLAY_TIME_WITH_SECONDS_PATTERN);
}

export function formatDisplayWeekdayDate(value: Date | string): string {
    return format(displayDateOf(value), DISPLAY_WEEKDAY_DATE_PATTERN);
}

function displayDateOf(value: Date | string): Date {
    return typeof value === 'string' ? parseISO(value) : value;
}
