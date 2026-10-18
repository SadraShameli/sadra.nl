import { describe, expect, it } from 'vitest';

import {
    OVERVIEW_DEFAULT_TAB,
    OVERVIEW_READY_LAYOUT,
    OVERVIEW_TAB_LABEL,
    OVERVIEW_TABS,
    overviewSectionAnchor,
    overviewSectionHref,
    OverviewSectionId,
    OverviewTab,
    overviewTabSections,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewSections';
import { routes } from '~/lib/site/routes';

function sorted(values: readonly string[]): string[] {
    return values.toSorted((left, right) => left.localeCompare(right));
}

describe('the overview sections', () => {
    it('lays out every section exactly once', () => {
        expect(new Set(OVERVIEW_READY_LAYOUT).size).toBe(
            OVERVIEW_READY_LAYOUT.length,
        );
        expect(sorted(OVERVIEW_READY_LAYOUT)).toEqual(
            sorted(Object.values(OverviewSectionId)),
        );
    });

    it('puts every section of the layout in exactly one tab', () => {
        for (const section of OVERVIEW_READY_LAYOUT) {
            expect(
                OVERVIEW_TABS.filter((tab) =>
                    overviewTabSections(tab).includes(section),
                ),
            ).toHaveLength(1);
        }
        expect(
            OVERVIEW_TABS.flatMap((tab) => overviewTabSections(tab)),
        ).toHaveLength(OVERVIEW_READY_LAYOUT.length);
    });

    it('lists every tab once, today first and as the default, each with a label and at least one section', () => {
        expect(OVERVIEW_TABS).toEqual([
            OverviewTab.Today,
            OverviewTab.Money,
            OverviewTab.Payouts,
            OverviewTab.Costs,
            OverviewTab.Timeline,
        ]);
        expect(sorted(OVERVIEW_TABS)).toEqual(
            sorted(Object.values(OverviewTab)),
        );
        expect(OVERVIEW_DEFAULT_TAB).toBe(OverviewTab.Today);
        expect(OVERVIEW_TABS.map((tab) => OVERVIEW_TAB_LABEL[tab])).toEqual([
            'Today',
            'Money',
            'Payouts',
            'Costs',
            'Timeline',
        ]);
        for (const tab of OVERVIEW_TABS) {
            expect(overviewTabSections(tab).length).toBeGreaterThan(0);
        }
    });

    it('splits the sections into the tabs in the order the page shows them', () => {
        expect(overviewTabSections(OverviewTab.Today)).toEqual([
            OverviewSectionId.Setup,
            OverviewSectionId.Kpis,
            OverviewSectionId.Alerts,
            OverviewSectionId.Accounts,
            OverviewSectionId.CushionBoard,
            OverviewSectionId.ReadinessBoard,
            OverviewSectionId.Violations,
        ]);
        expect(overviewTabSections(OverviewTab.Money)).toEqual([
            OverviewSectionId.Bankroll,
            OverviewSectionId.Exposure,
            OverviewSectionId.ExpectedNet,
            OverviewSectionId.EvSources,
            OverviewSectionId.FreshStartProjection,
            OverviewSectionId.Firms,
            OverviewSectionId.FirmReturns,
            OverviewSectionId.ProfitConcentration,
            OverviewSectionId.Diversification,
            OverviewSectionId.TiltVariance,
            OverviewSectionId.LiveProximity,
        ]);
        expect(overviewTabSections(OverviewTab.Payouts)).toEqual([
            OverviewSectionId.NextPayout,
            OverviewSectionId.CapUsage,
            OverviewSectionId.PooledCaps,
            OverviewSectionId.PayoutSizes,
            OverviewSectionId.FundedPayouts,
            OverviewSectionId.PayoutTiming,
        ]);
        expect(overviewTabSections(OverviewTab.Costs)).toEqual([
            OverviewSectionId.Costs,
            OverviewSectionId.AttemptEconomics,
            OverviewSectionId.Replacement,
            OverviewSectionId.Statement,
            OverviewSectionId.Funnel,
            OverviewSectionId.AttemptThroughput,
            OverviewSectionId.Repeatability,
        ]);
        expect(overviewTabSections(OverviewTab.Timeline)).toEqual([
            OverviewSectionId.Outcomes,
            OverviewSectionId.Timeline,
            OverviewSectionId.DataNotes,
        ]);
    });

    it('links a section on another tab through the tab parameter and its anchor', () => {
        expect(overviewSectionHref(OverviewSectionId.ExpectedNet)).toBe(
            `${routes.propCalculator.accounts.index}?tab=money#prop-overview-expected-net`,
        );
        expect(overviewSectionHref(OverviewSectionId.DataNotes)).toBe(
            `${routes.propCalculator.accounts.index}?tab=timeline#prop-overview-notes`,
        );
    });

    it('links a section on the default tab by its anchor alone', () => {
        expect(overviewSectionHref(OverviewSectionId.Alerts)).toBe(
            `${routes.propCalculator.accounts.index}#prop-overview-alerts`,
        );
    });

    it('links every section to its own tab and anchor', () => {
        for (const tab of OVERVIEW_TABS) {
            for (const section of overviewTabSections(tab)) {
                const href = new URL(
                    overviewSectionHref(section),
                    'http://localhost',
                );
                expect(href.pathname).toBe(
                    routes.propCalculator.accounts.index,
                );
                expect(href.hash).toBe(`#${overviewSectionAnchor(section)}`);
                expect(href.searchParams.get('tab')).toBe(
                    tab === OverviewTab.Today ? null : tab,
                );
            }
        }
    });
});
