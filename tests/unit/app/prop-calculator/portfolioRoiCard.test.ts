import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
    KPI_ACCENT_TEXT_CLASS,
    KpiAccent,
} from '~/app/(app)/prop-calculator/_components/kpiAccent';
import { PortfolioRoiCard } from '~/app/(app)/prop-calculator/_components/PortfolioPanel';
import { annualisedRoiOnCost } from '~/lib/prop-calculator';

function renderedRoiCard(monthlyNet: number, totalCost: number): string {
    return renderToStaticMarkup(
        createElement(PortfolioRoiCard, {
            roi: annualisedRoiOnCost(monthlyNet, totalCost),
        }),
    );
}

const ACCENT_CLASSES = Object.values(KPI_ACCENT_TEXT_CLASS);

function accentClassesIn(markup: string): string[] {
    return ACCENT_CLASSES.filter((accentClass) => markup.includes(accentClass));
}

describe('PortfolioRoiCard: the portfolio "Annual ROI on fees" card (R1-29)', () => {
    it('renders n/a with the neutral accent when the total eval cost is $0 and the portfolio is profitable, not in red', () => {
        const markup = renderedRoiCard(1500, 0);
        expect(markup).toContain('>n/a<');
        expect(accentClassesIn(markup)).toStrictEqual([
            KPI_ACCENT_TEXT_CLASS[KpiAccent.Neutral],
        ]);
    });

    it('renders n/a with the neutral accent at $0 cost and a loss', () => {
        const markup = renderedRoiCard(-200, 0);
        expect(markup).toContain('>n/a<');
        expect(accentClassesIn(markup)).toStrictEqual([
            KPI_ACCENT_TEXT_CLASS[KpiAccent.Neutral],
        ]);
    });

    it('renders a positive annual ROI with the positive accent', () => {
        const markup = renderedRoiCard(100, 600);
        expect(markup).toContain('>200.0%<');
        expect(accentClassesIn(markup)).toStrictEqual([
            KPI_ACCENT_TEXT_CLASS[KpiAccent.Positive],
        ]);
    });

    it('renders a negative annual ROI with the negative accent', () => {
        const markup = renderedRoiCard(-25, 600);
        expect(markup).toContain('>-50.0%<');
        expect(accentClassesIn(markup)).toStrictEqual([
            KPI_ACCENT_TEXT_CLASS[KpiAccent.Negative],
        ]);
    });

    it('renders an exact break-even with the neutral accent, like the results and cash-flow panels', () => {
        const markup = renderedRoiCard(0, 600);
        expect(markup).toContain('>0.0%<');
        expect(accentClassesIn(markup)).toStrictEqual([
            KPI_ACCENT_TEXT_CLASS[KpiAccent.Neutral],
        ]);
    });
});
