import { type Roi } from '~/lib/prop-calculator';

export enum KpiAccent {
    Negative = 'negative',
    Neutral = 'neutral',
    Positive = 'positive',
}

export const KPI_ACCENT_TEXT_CLASS: Record<KpiAccent, string> = {
    [KpiAccent.Negative]: 'text-rose-400',
    [KpiAccent.Neutral]: 'text-foreground',
    [KpiAccent.Positive]: 'text-emerald-400',
};

export function probabilityAccent(probability: number): KpiAccent {
    if (probability >= 0.6) return KpiAccent.Positive;
    return probability < 0.3 ? KpiAccent.Negative : KpiAccent.Neutral;
}

export function roiAccent({ value }: Roi): KpiAccent {
    return signAccent(value);
}

export function signAccent(value: null | number): KpiAccent {
    if (value === null) return KpiAccent.Neutral;
    if (value > 0) return KpiAccent.Positive;
    return value < 0 ? KpiAccent.Negative : KpiAccent.Neutral;
}
