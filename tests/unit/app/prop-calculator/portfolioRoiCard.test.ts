import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { portfolioRoiItem } from '~/app/(app)/prop-calculator/_components/PortfolioPanel';
import {
    StatStrip,
    type StatStripItem,
    StatTone,
} from '~/components/StatStrip';
import { annualisedRoiOnCost } from '~/lib/prop-calculator';

function renderedRoiCard(monthlyNet: number, totalCost: number): string {
    return renderToStaticMarkup(
        createElement(StatStrip, { items: [roiItem(monthlyNet, totalCost)] }),
    );
}

function roiItem(monthlyNet: number, totalCost: number): StatStripItem {
    return portfolioRoiItem(annualisedRoiOnCost(monthlyNet, totalCost));
}

describe('portfolioRoiItem: the portfolio "Annual ROI on fees" figure (R1-29)', () => {
    it('renders a missing value, not n/a text, with the neutral tone when the total eval cost is $0 and the portfolio is profitable', () => {
        expect(renderedRoiCard(1500, 0)).toContain('>Not available<');
        expect(renderedRoiCard(1500, 0)).not.toContain('n/a');
        expect(roiItem(1500, 0).tone).toBe(StatTone.Default);
    });

    it('renders a missing value, not n/a text, with the neutral tone at $0 cost and a loss', () => {
        expect(renderedRoiCard(-200, 0)).toContain('>Not available<');
        expect(renderedRoiCard(-200, 0)).not.toContain('n/a');
        expect(roiItem(-200, 0).tone).toBe(StatTone.Default);
    });

    it('holds a skeleton in place of the figure while the portfolio is still computing', () => {
        const item = portfolioRoiItem(null);
        expect(item.isLoading).toBe(true);
        expect(item.label).toBe('Annual ROI on fees');
        expect(
            renderToStaticMarkup(createElement(StatStrip, { items: [item] })),
        ).toContain('data-slot="skeleton"');
    });

    it('renders a positive annual ROI with the positive tone', () => {
        expect(renderedRoiCard(100, 600)).toContain('>200.0%<');
        expect(roiItem(100, 600).tone).toBe(StatTone.Positive);
    });

    it('renders a negative annual ROI with the negative tone', () => {
        expect(renderedRoiCard(-25, 600)).toContain('>-50.0%<');
        expect(roiItem(-25, 600).tone).toBe(StatTone.Negative);
    });

    it('says how the figure is worked out under the value', () => {
        const markup = renderedRoiCard(100, 600);
        expect(markup).toContain('Annual ROI on fees');
        expect(markup).toContain('monthly net × 12 ÷ total eval cost');
    });

    it('renders an exact break-even with the neutral tone, like the results and cash-flow panels', () => {
        expect(renderedRoiCard(0, 600)).toContain('>0.0%<');
        expect(roiItem(0, 600).tone).toBe(StatTone.Default);
    });
});
