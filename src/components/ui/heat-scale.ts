export const HEAT_STEP_CLASSES = [
    'bg-[color-mix(in_oklab,var(--camel)_4%,var(--card))] dark:bg-[color-mix(in_oklab,var(--camel)_4%,var(--card))]',
    'bg-[color-mix(in_oklab,var(--camel)_12%,var(--card))] dark:bg-[color-mix(in_oklab,var(--camel)_10%,var(--card))]',
    'bg-[color-mix(in_oklab,var(--camel)_20%,var(--card))] dark:bg-[color-mix(in_oklab,var(--camel)_17%,var(--card))]',
    'bg-[color-mix(in_oklab,var(--camel)_28%,var(--card))] dark:bg-[color-mix(in_oklab,var(--camel)_23%,var(--card))]',
    'bg-[color-mix(in_oklab,var(--camel)_36%,var(--card))] dark:bg-[color-mix(in_oklab,var(--camel)_29%,var(--card))]',
    'bg-[color-mix(in_oklab,var(--camel)_44%,var(--card))] dark:bg-[color-mix(in_oklab,var(--camel)_36%,var(--card))]',
    'bg-[color-mix(in_oklab,var(--camel)_52%,var(--card))] dark:bg-[color-mix(in_oklab,var(--camel)_42%,var(--card))]',
    'bg-[color-mix(in_oklab,var(--camel)_60%,var(--card))] dark:bg-[color-mix(in_oklab,var(--camel)_48%,var(--card))]',
] as const;

const LAST_STEP = HEAT_STEP_CLASSES.length - 1;

export class HeatScale {
    static readonly PROBABILITY = new HeatScale(0, 1);

    static between(low: number, high: number): HeatScale {
        return new HeatScale(low, high);
    }

    static spanning(values: readonly number[]): HeatScale {
        return values.length === 0
            ? new HeatScale(0, 0)
            : new HeatScale(Math.min(...values), Math.max(...values));
    }

    private constructor(
        readonly low: number,
        readonly high: number,
    ) {}

    step(value: number): number {
        const span = this.high - this.low;
        if (span <= 0) return 0;
        const position = Math.min(1, Math.max(0, (value - this.low) / span));
        return Math.min(
            LAST_STEP,
            Math.floor(position * HEAT_STEP_CLASSES.length),
        );
    }

    tileClassName(value: number): string {
        return HEAT_STEP_CLASSES[this.step(value)] ?? HEAT_STEP_CLASSES[0];
    }
}
