import { describe, expect, it } from 'vitest';

import {
    FeaturedProjectId,
    PortfolioProjectNavigation,
} from '~/lib/site/PortfolioProjectNavigation';

describe('portfolio project navigation', () => {
    it.each(Object.values(FeaturedProjectId))(
        'restores the selected %s project from its URL',
        (project) => {
            const href = new PortfolioProjectNavigation().href(project);
            const url = new URL(href, 'https://sadra.nl');
            expect(new PortfolioProjectNavigation(url.search).selected()).toBe(
                project,
            );
            expect(url.hash).toBe('#portfolio');
        },
    );

    it.each(['', 'project=unknown', 'project='])(
        'opens TradingBot for an absent or invalid selection: %s',
        (search) => {
            expect(new PortfolioProjectNavigation(search).selected()).toBe(
                FeaturedProjectId.TradingBot,
            );
        },
    );

    it('preserves unrelated parameters while replacing the selected project', () => {
        expect(
            new PortfolioProjectNavigation(
                'source=menu&project=mino-markt',
            ).href(FeaturedProjectId.SensorHub),
        ).toBe('/?source=menu&project=sensor-hub#portfolio');
    });
});
