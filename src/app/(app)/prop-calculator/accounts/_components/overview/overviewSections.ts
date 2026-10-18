import { type Route } from 'next';

import { routes } from '~/lib/site/routes';

export enum OverviewSectionId {
    Accounts = 'accounts',
    Alerts = 'alerts',
    AttemptEconomics = 'attempt-economics',
    AttemptThroughput = 'attempt-throughput',
    Bankroll = 'bankroll',
    CapUsage = 'cap-usage',
    Costs = 'costs',
    CushionBoard = 'cushion-board',
    DataNotes = 'notes',
    Diversification = 'diversification',
    EvSources = 'ev-sources',
    ExpectedNet = 'expected-net',
    Exposure = 'exposure',
    FirmReturns = 'firm-returns',
    Firms = 'firms',
    FreshStartProjection = 'fresh-start-projection',
    FundedPayouts = 'funded-payouts',
    Funnel = 'funnel',
    Kpis = 'kpis',
    LiveProximity = 'live-proximity',
    NextPayout = 'next-payout',
    Outcomes = 'outcomes',
    PayoutSizes = 'payout-sizes',
    PayoutTiming = 'payout-timing',
    PooledCaps = 'pooled-caps',
    ProfitConcentration = 'profit-concentration',
    ReadinessBoard = 'readiness-board',
    Repeatability = 'repeatability',
    Replacement = 'replacement',
    Setup = 'setup',
    Statement = 'statement',
    TiltVariance = 'tilt-variance',
    Timeline = 'timeline',
    Violations = 'violations',
}

export const OVERVIEW_SECTION_TITLE: Readonly<
    Record<OverviewSectionId, string>
> = {
    [OverviewSectionId.Accounts]: 'Accounts',
    [OverviewSectionId.Alerts]: 'Alerts',
    [OverviewSectionId.AttemptEconomics]: 'Your attempt economics',
    [OverviewSectionId.AttemptThroughput]: 'Attempt throughput',
    [OverviewSectionId.Bankroll]: 'Bankroll',
    [OverviewSectionId.CapUsage]: 'Plan cap usage',
    [OverviewSectionId.Costs]: 'Costs',
    [OverviewSectionId.CushionBoard]: 'Cushion board',
    [OverviewSectionId.DataNotes]: 'Data notes',
    [OverviewSectionId.Diversification]: 'Diversification',
    [OverviewSectionId.EvSources]: 'Where EV comes from',
    [OverviewSectionId.ExpectedNet]: 'Expected net',
    [OverviewSectionId.Exposure]: 'Exposure',
    [OverviewSectionId.FirmReturns]: 'Firm returns',
    [OverviewSectionId.Firms]: 'Firms',
    [OverviewSectionId.FreshStartProjection]: 'Fresh-start projection',
    [OverviewSectionId.FundedPayouts]: 'Payouts per funded account',
    [OverviewSectionId.Funnel]: 'Stage funnel',
    [OverviewSectionId.Kpis]: 'Key figures',
    [OverviewSectionId.LiveProximity]: 'Live proximity',
    [OverviewSectionId.NextPayout]: "Next payout and value from today's state",
    [OverviewSectionId.Outcomes]: 'Realized outcomes',
    [OverviewSectionId.PayoutSizes]: 'Payout sizes',
    [OverviewSectionId.PayoutTiming]: 'Payout timing',
    [OverviewSectionId.PooledCaps]: 'Pooled caps',
    [OverviewSectionId.ProfitConcentration]: 'Profit concentration',
    [OverviewSectionId.ReadinessBoard]: 'Payout readiness',
    [OverviewSectionId.Repeatability]: 'Repeatability',
    [OverviewSectionId.Replacement]: 'Replacement',
    [OverviewSectionId.Setup]: 'Setup checklist',
    [OverviewSectionId.Statement]: 'Monthly statement',
    [OverviewSectionId.TiltVariance]: 'Tilt vs variance',
    [OverviewSectionId.Timeline]: 'Timeline',
    [OverviewSectionId.Violations]: 'Rule violations',
};

export enum OverviewTab {
    Costs = 'costs',
    Money = 'money',
    Payouts = 'payouts',
    Timeline = 'timeline',
    Today = 'today',
}

export const OVERVIEW_TABS: readonly OverviewTab[] = [
    OverviewTab.Today,
    OverviewTab.Money,
    OverviewTab.Payouts,
    OverviewTab.Costs,
    OverviewTab.Timeline,
];

export const OVERVIEW_DEFAULT_TAB = OverviewTab.Today;

export const OVERVIEW_TAB_PARAMETER = 'tab';

export const OVERVIEW_TAB_LABEL: Readonly<Record<OverviewTab, string>> = {
    [OverviewTab.Costs]: 'Costs',
    [OverviewTab.Money]: 'Money',
    [OverviewTab.Payouts]: 'Payouts',
    [OverviewTab.Timeline]: 'Timeline',
    [OverviewTab.Today]: 'Today',
};

const OVERVIEW_SECTION_TAB: Readonly<Record<OverviewSectionId, OverviewTab>> = {
    [OverviewSectionId.Accounts]: OverviewTab.Today,
    [OverviewSectionId.Alerts]: OverviewTab.Today,
    [OverviewSectionId.AttemptEconomics]: OverviewTab.Costs,
    [OverviewSectionId.AttemptThroughput]: OverviewTab.Costs,
    [OverviewSectionId.Bankroll]: OverviewTab.Money,
    [OverviewSectionId.CapUsage]: OverviewTab.Payouts,
    [OverviewSectionId.Costs]: OverviewTab.Costs,
    [OverviewSectionId.CushionBoard]: OverviewTab.Today,
    [OverviewSectionId.DataNotes]: OverviewTab.Timeline,
    [OverviewSectionId.Diversification]: OverviewTab.Money,
    [OverviewSectionId.EvSources]: OverviewTab.Money,
    [OverviewSectionId.ExpectedNet]: OverviewTab.Money,
    [OverviewSectionId.Exposure]: OverviewTab.Money,
    [OverviewSectionId.FirmReturns]: OverviewTab.Money,
    [OverviewSectionId.Firms]: OverviewTab.Money,
    [OverviewSectionId.FreshStartProjection]: OverviewTab.Money,
    [OverviewSectionId.FundedPayouts]: OverviewTab.Payouts,
    [OverviewSectionId.Funnel]: OverviewTab.Costs,
    [OverviewSectionId.Kpis]: OverviewTab.Today,
    [OverviewSectionId.LiveProximity]: OverviewTab.Money,
    [OverviewSectionId.NextPayout]: OverviewTab.Payouts,
    [OverviewSectionId.Outcomes]: OverviewTab.Timeline,
    [OverviewSectionId.PayoutSizes]: OverviewTab.Payouts,
    [OverviewSectionId.PayoutTiming]: OverviewTab.Payouts,
    [OverviewSectionId.PooledCaps]: OverviewTab.Payouts,
    [OverviewSectionId.ProfitConcentration]: OverviewTab.Money,
    [OverviewSectionId.ReadinessBoard]: OverviewTab.Today,
    [OverviewSectionId.Repeatability]: OverviewTab.Costs,
    [OverviewSectionId.Replacement]: OverviewTab.Costs,
    [OverviewSectionId.Setup]: OverviewTab.Today,
    [OverviewSectionId.Statement]: OverviewTab.Costs,
    [OverviewSectionId.TiltVariance]: OverviewTab.Money,
    [OverviewSectionId.Timeline]: OverviewTab.Timeline,
    [OverviewSectionId.Violations]: OverviewTab.Today,
};

export const OVERVIEW_READY_LAYOUT: readonly OverviewSectionId[] = [
    OverviewSectionId.Setup,
    OverviewSectionId.Kpis,
    OverviewSectionId.Alerts,
    OverviewSectionId.Accounts,
    OverviewSectionId.CushionBoard,
    OverviewSectionId.ReadinessBoard,
    OverviewSectionId.Violations,
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
    OverviewSectionId.NextPayout,
    OverviewSectionId.CapUsage,
    OverviewSectionId.PooledCaps,
    OverviewSectionId.PayoutSizes,
    OverviewSectionId.FundedPayouts,
    OverviewSectionId.PayoutTiming,
    OverviewSectionId.Costs,
    OverviewSectionId.AttemptEconomics,
    OverviewSectionId.Replacement,
    OverviewSectionId.Statement,
    OverviewSectionId.Funnel,
    OverviewSectionId.AttemptThroughput,
    OverviewSectionId.Repeatability,
    OverviewSectionId.Outcomes,
    OverviewSectionId.Timeline,
    OverviewSectionId.DataNotes,
];

export function overviewSectionAnchor(section: OverviewSectionId): string {
    return `prop-overview-${section}`;
}

export function overviewSectionHeadingId(section: OverviewSectionId): string {
    return `${overviewSectionAnchor(section)}-heading`;
}

export function overviewSectionHref(section: OverviewSectionId): Route {
    const anchor = `#${overviewSectionAnchor(section)}` as const;
    const tab = OVERVIEW_SECTION_TAB[section];
    if (tab === OVERVIEW_DEFAULT_TAB) {
        return `${routes.propCalculator.accounts.index}${anchor}`;
    }
    const query = new URLSearchParams([[OVERVIEW_TAB_PARAMETER, tab]]);
    return `${routes.propCalculator.accounts.index}?${query.toString()}${anchor}`;
}

export function overviewTabSections(
    tab: OverviewTab,
): readonly OverviewSectionId[] {
    return OVERVIEW_READY_LAYOUT.filter(
        (section) => OVERVIEW_SECTION_TAB[section] === tab,
    );
}
