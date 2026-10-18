import { describe, expect, it } from 'vitest';

import {
    DEFAULT_HERO_SHOWCASE,
    HeroShowcase,
    heroShowcaseInputSchema,
} from '~/lib/site/HeroShowcase';

describe('HeroShowcase', () => {
    it('stores the input in whole cents and hundredths and formats it for the hero card', () => {
        const showcase = HeroShowcase.fromInput({
            averageR: 1.85,
            todayProfitAndLossDollars: 1234.5,
            totalPayoutDollars: 12_345.67,
            winRatePercent: 62,
        });

        expect(showcase.record).toEqual({
            averageRHundredths: 185,
            todayProfitAndLossCents: 123_450,
            totalPayoutCents: 1_234_567,
            winRatePercent: 62,
        });
        expect(showcase.toView()).toEqual({
            averageR: '1.9R',
            today: '+$1,234.50',
            totalPayout: '$12,345.67',
            winRate: '62%',
        });
    });

    it('shows the defaults as +$5,000 today and $30,000 in payouts', () => {
        expect(HeroShowcase.fromInput(DEFAULT_HERO_SHOWCASE).toView()).toEqual({
            averageR: '2.0R',
            today: '+$5,000.00',
            totalPayout: '$30,000.00',
            winRate: '40%',
        });
    });

    it('signs a loss with a minus', () => {
        const view = new HeroShowcase({
            averageRHundredths: 90,
            todayProfitAndLossCents: -50_000,
            totalPayoutCents: 10_000,
            winRatePercent: 40,
        }).toView();

        expect(view.today).toBe('−$500.00');
        expect(view.totalPayout).toBe('$100.00');
    });

    it('round-trips through the form input', () => {
        const input = {
            averageR: 2.4,
            todayProfitAndLossDollars: -812.5,
            totalPayoutDollars: 41_000,
            winRatePercent: 55,
        };
        expect(HeroShowcase.fromInput(input).toInput()).toEqual(input);
    });

    it('rejects a negative payout total', () => {
        expect(
            heroShowcaseInputSchema.safeParse({
                ...DEFAULT_HERO_SHOWCASE,
                totalPayoutDollars: -1,
            }).success,
        ).toBe(false);
    });

    it('rejects a win rate above 100 percent', () => {
        expect(
            heroShowcaseInputSchema.safeParse({
                ...DEFAULT_HERO_SHOWCASE,
                winRatePercent: 101,
            }).success,
        ).toBe(false);
    });
});
