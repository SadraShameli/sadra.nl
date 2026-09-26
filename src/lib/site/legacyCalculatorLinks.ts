import { routes } from '~/lib/site/routes';

export enum LegacySection {
    CashFlow = 'cash-flow',
    Charts = 'charts',
    Drawdown = 'drawdown',
    FirmComparison = 'firm-comparison',
    LadderLab = 'ladder-lab',
    LadderLabSection = 'ladder-lab-section',
    OptimalRisk = 'optimal-risk',
    PlanComparison = 'plan-comparison',
    Portfolio = 'portfolio',
    Resilience = 'resilience',
    RuleStressTest = 'rule-stress-test',
    Sensitivity = 'sensitivity',
    Simulator = 'simulator',
    Strategy = 'strategy',
    StrategyLab = 'strategy-lab',
    TailRisk = 'tail-risk',
}

export interface LegacySectionTarget {
    fragment: LegacySection;
    route: string;
}

const LEGACY_SECTION_ROUTES: Readonly<Record<LegacySection, string>> = {
    [LegacySection.CashFlow]: routes.propCalculator.cashFlow,
    [LegacySection.Charts]: routes.propCalculator.simulator,
    [LegacySection.Drawdown]: routes.propCalculator.analysis,
    [LegacySection.FirmComparison]: routes.propCalculator.compare,
    [LegacySection.LadderLab]: routes.propCalculator.ladderLab,
    [LegacySection.LadderLabSection]: routes.propCalculator.ladderLab,
    [LegacySection.OptimalRisk]: routes.propCalculator.sizing,
    [LegacySection.PlanComparison]: routes.propCalculator.compare,
    [LegacySection.Portfolio]: routes.propCalculator.planner,
    [LegacySection.Resilience]: routes.propCalculator.analysis,
    [LegacySection.RuleStressTest]: routes.propCalculator.analysis,
    [LegacySection.Sensitivity]: routes.propCalculator.sizing,
    [LegacySection.Simulator]: routes.propCalculator.simulator,
    [LegacySection.Strategy]: routes.propCalculator.analysis,
    [LegacySection.StrategyLab]: routes.propCalculator.strategyLab,
    [LegacySection.TailRisk]: routes.propCalculator.analysis,
};

const LEGACY_SECTIONS = new Map<string, LegacySection>(
    Object.values(LegacySection).map((section) => [section, section]),
);

export function legacyQueryRedirect(
    pathname: string,
    search: string,
): null | string {
    if (
        pathname !== routes.propCalculator.index ||
        !new URLSearchParams(search).has('firm')
    ) {
        return null;
    }
    const rawSearch = search.startsWith('?') ? search : `?${search}`;
    return `${routes.propCalculator.simulator}${rawSearch}`;
}

export function legacySectionRoute(
    hash: string,
    currentPathname: string,
): LegacySectionTarget | null {
    const target = legacySectionTarget(hash);
    return target?.route === currentPathname ? null : target;
}

export function legacySectionTarget(hash: string): LegacySectionTarget | null {
    const id = hash.startsWith('#') ? hash.slice(1) : hash;
    const section = LEGACY_SECTIONS.get(id);
    return section === undefined
        ? null
        : { fragment: section, route: LEGACY_SECTION_ROUTES[section] };
}
