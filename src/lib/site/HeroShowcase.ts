import { z } from 'zod';

const CENTS_PER_DOLLAR = 100;
const HUNDREDTHS_PER_R = 100;
const MAX_PROFIT_AND_LOSS_DOLLARS = 10_000_000;
const MAX_AVERAGE_R = 50;

const USD = new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
});

const profitAndLossDollarsSchema = z
    .number()
    .min(-MAX_PROFIT_AND_LOSS_DOLLARS)
    .max(MAX_PROFIT_AND_LOSS_DOLLARS)
    .multipleOf(0.01);

export const heroShowcaseInputSchema = z.object({
    averageR: z.number().min(0).max(MAX_AVERAGE_R).multipleOf(0.01),
    todayProfitAndLossDollars: profitAndLossDollarsSchema,
    totalPayoutDollars: z
        .number()
        .min(0)
        .max(MAX_PROFIT_AND_LOSS_DOLLARS)
        .multipleOf(0.01),
    winRatePercent: z.number().int().min(0).max(100),
});

export type HeroShowcaseInput = z.infer<typeof heroShowcaseInputSchema>;

export const DEFAULT_HERO_SHOWCASE: HeroShowcaseInput = {
    averageR: 2,
    todayProfitAndLossDollars: 5000,
    totalPayoutDollars: 30_000,
    winRatePercent: 40,
};

export interface HeroShowcaseRecord {
    readonly averageRHundredths: number;
    readonly todayProfitAndLossCents: number;
    readonly totalPayoutCents: number;
    readonly winRatePercent: number;
}

export interface HeroShowcaseView {
    readonly averageR: string;
    readonly today: string;
    readonly totalPayout: string;
    readonly winRate: string;
}

export class HeroShowcase {
    static fromInput(input: HeroShowcaseInput): HeroShowcase {
        return new HeroShowcase({
            averageRHundredths: Math.round(input.averageR * HUNDREDTHS_PER_R),
            todayProfitAndLossCents: Math.round(
                input.todayProfitAndLossDollars * CENTS_PER_DOLLAR,
            ),
            totalPayoutCents: Math.round(
                input.totalPayoutDollars * CENTS_PER_DOLLAR,
            ),
            winRatePercent: input.winRatePercent,
        });
    }

    constructor(readonly record: HeroShowcaseRecord) {}

    toInput(): HeroShowcaseInput {
        return {
            averageR: this.record.averageRHundredths / HUNDREDTHS_PER_R,
            todayProfitAndLossDollars:
                this.record.todayProfitAndLossCents / CENTS_PER_DOLLAR,
            totalPayoutDollars: this.record.totalPayoutCents / CENTS_PER_DOLLAR,
            winRatePercent: this.record.winRatePercent,
        };
    }

    toView(): HeroShowcaseView {
        return {
            averageR: `${(this.record.averageRHundredths / HUNDREDTHS_PER_R).toFixed(1)}R`,
            today: signedUsd(this.record.todayProfitAndLossCents),
            totalPayout: USD.format(
                this.record.totalPayoutCents / CENTS_PER_DOLLAR,
            ),
            winRate: `${String(this.record.winRatePercent)}%`,
        };
    }
}

function signedUsd(cents: number): string {
    const sign = cents < 0 ? '−' : '+';
    return `${sign}${USD.format(Math.abs(cents) / CENTS_PER_DOLLAR)}`;
}
