import type { UnitDistance, UnitLength, UnitWeight } from '~/lib/lifting/types';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const M_PER_MI = 1609.344;

export const DistanceUnit = {
    fromDisplay(value: number, unit: UnitDistance): number {
        return unit === 'm' ? value : value * M_PER_MI;
    },

    toDisplay(valueMeters: number, unit: UnitDistance): number {
        return unit === 'm' ? valueMeters : valueMeters / M_PER_MI;
    },
};

export const DurationFormat = {
    elapsedSince(startMs: number, nowMs: number): string {
        return DurationFormat.seconds((nowMs - startMs) / 1000);
    },

    ms(milliseconds: number): string {
        if (!Number.isFinite(milliseconds)) return '0ms';
        const safe = Math.max(0, milliseconds);
        if (safe < 1000) return `${Math.round(safe)}ms`;
        const seconds = safe / 1000;
        return seconds < 60
            ? `${seconds.toFixed(1)}s`
            : DurationFormat.seconds(seconds);
    },

    seconds(totalSeconds: number): string {
        if (!Number.isFinite(totalSeconds)) return '0s';
        const safe = Math.max(0, Math.round(totalSeconds));
        if (safe >= 3600) {
            const h = Math.floor(safe / 3600);
            const m = Math.floor((safe % 3600) / 60);
            return m === 0 ? `${h}h` : `${h}h ${m}m`;
        }
        if (safe >= 60) {
            const m = Math.floor(safe / 60);
            const s = safe % 60;
            return s === 0 ? `${m}m` : `${m}m ${s}s`;
        }
        return `${safe}s`;
    },
};

export const LengthUnit = {
    format(valueCm: number, unit: UnitLength): string {
        const display = LengthUnit.toDisplay(valueCm, unit);
        return `${Math.round(display * 10) / 10} ${unit}`;
    },

    fromDisplay(value: number, unit: UnitLength): number {
        return unit === 'cm' ? value : value * CM_PER_IN;
    },

    toDisplay(valueCm: number, unit: UnitLength): number {
        return unit === 'cm' ? valueCm : valueCm / CM_PER_IN;
    },
};

export const TonnageFormat = {
    format(tonnageKg: number, unit: UnitWeight): string {
        const display = WeightUnit.toDisplay(tonnageKg, unit);
        return display >= 1000
            ? `${(display / 1000).toFixed(1)}k ${unit}`
            : `${Math.round(display)} ${unit}`;
    },
};

export const WeightUnit = {
    format(valueKg: number, unit: UnitWeight): string {
        const display = WeightUnit.toDisplay(valueKg, unit);
        const rounded =
            Math.abs(display) < 100
                ? Math.round(display * 10) / 10
                : Math.round(display);
        return `${rounded} ${unit}`;
    },

    fromDisplay(value: number, unit: UnitWeight): number {
        return unit === 'kg' ? value : value * KG_PER_LB;
    },

    toDisplay(valueKg: number, unit: UnitWeight): number {
        return unit === 'kg' ? valueKg : valueKg / KG_PER_LB;
    },
};
