import {
    Activity,
    Banknote,
    BookOpen,
    Crosshair,
    Dices,
    FlaskConical,
    GitCompareArrows,
    LayoutGrid,
    type LucideIcon,
    Radio,
    Scale,
    Target,
    TestTubes,
    Wallet,
} from 'lucide-react';

import { routes } from '~/lib/site/routes';

import { panelDescriptions } from './kpiDescriptions';

export enum ToolGroup {
    Analyse = 'analyse',
    Compare = 'compare',
    Labs = 'labs',
    Plan = 'plan',
    Simulate = 'simulate',
    Size = 'size',
}

export enum ToolId {
    Analysis = 'analysis',
    CashFlow = 'cash-flow',
    Compare = 'compare',
    FundedOptimizer = 'funded-optimizer',
    LadderLab = 'ladder-lab',
    Live = 'live',
    PayoutPlanner = 'payout-planner',
    Planner = 'planner',
    PositionSize = 'position-size',
    Rules = 'rules',
    Simulator = 'simulator',
    Sizing = 'sizing',
    StrategyLab = 'strategy-lab',
}

export enum ToolUrlCodec {
    PayoutPlanner = 'payout-planner',
    PositionSize = 'position-size',
}

export interface ToolCatalogEntry {
    blurb: string;
    group: ToolGroup;
    hasPage: boolean;
    icon: LucideIcon;
    id: ToolId;
    label: string;
    ownUrlCodec: null | ToolUrlCodec;
    route: string;
    sharesState: boolean;
    usesCalculatorInputs: boolean;
}

type ToolDefinition = Omit<
    ToolCatalogEntry,
    'id' | 'ownUrlCodec' | 'sharesState' | 'usesCalculatorInputs'
>;

function calculatorTool(definition: ToolDefinition) {
    return {
        ...definition,
        ownUrlCodec: null,
        sharesState: true,
        usesCalculatorInputs: true,
    };
}

function ownCodecTool(definition: ToolDefinition, codec: ToolUrlCodec) {
    return {
        ...definition,
        ownUrlCodec: codec,
        sharesState: true,
        usesCalculatorInputs: false,
    };
}

function statelessTool(definition: ToolDefinition) {
    return {
        ...definition,
        ownUrlCodec: null,
        sharesState: false,
        usesCalculatorInputs: false,
    };
}

const TOOL_DEFINITIONS = {
    [ToolId.Analysis]: calculatorTool({
        blurb: 'Strategy edge with Kelly sizing, tail risk, drawdown duration, loss-streak resilience and a stress test of the plan rules.',
        group: ToolGroup.Analyse,
        hasPage: true,
        icon: Activity,
        label: 'Analysis',
        route: routes.propCalculator.analysis,
    }),
    [ToolId.CashFlow]: calculatorTool({
        blurb: 'Rules-aware cash flow over time: eval purchases and retries, funded payouts and re-buys, with the P10 to P90 spread of cumulative net.',
        group: ToolGroup.Plan,
        hasPage: true,
        icon: Wallet,
        label: 'Cash flow',
        route: routes.propCalculator.cashFlow,
    }),
    [ToolId.Compare]: calculatorTool({
        blurb: 'Every plan of the selected firm and every firm at your account size, simulated on your inputs and ranked by expected monthly net.',
        group: ToolGroup.Compare,
        hasPage: true,
        icon: GitCompareArrows,
        label: 'Compare',
        route: routes.propCalculator.compare,
    }),
    [ToolId.FundedOptimizer]: calculatorTool({
        blurb: 'Ranks the funded-stage candidates of the CLI funded optimizer under your retained cushion and payout request, in the CLI order and columns.',
        group: ToolGroup.Plan,
        hasPage: true,
        icon: Target,
        label: 'Funded optimizer',
        route: routes.propCalculator.fundedOptimizer,
    }),
    [ToolId.LadderLab]: calculatorTool({
        blurb: 'Searches within-day risk ladders on a grid and scores each on days to funded, cost per funded account and pass rate.',
        group: ToolGroup.Labs,
        hasPage: true,
        icon: FlaskConical,
        label: 'Ladder lab',
        route: routes.propCalculator.ladderLab,
    }),
    [ToolId.Live]: calculatorTool({
        blurb: 'Simulates the live stage for plans with a modeled live account, and says so where the model is only a firm-level approximation.',
        group: ToolGroup.Simulate,
        hasPage: true,
        icon: Radio,
        label: 'Live account',
        route: routes.propCalculator.live,
    }),
    [ToolId.PayoutPlanner]: ownCodecTool(
        {
            blurb: 'From a balance, a peak and past payouts: payout readiness, the blocking gate, the rule-capped withdrawable and the net after the split.',
            group: ToolGroup.Plan,
            hasPage: false,
            icon: Banknote,
            label: 'Payout planner',
            route: routes.propCalculator.payoutPlanner,
        },
        ToolUrlCodec.PayoutPlanner,
    ),
    [ToolId.Planner]: calculatorTool({
        blurb: panelDescriptions.portfolio,
        group: ToolGroup.Plan,
        hasPage: true,
        icon: LayoutGrid,
        label: 'Multi-firm planner',
        route: routes.propCalculator.planner,
    }),
    [ToolId.PositionSize]: ownCodecTool(
        {
            blurb: 'Contracts for a dollar risk at a stop, the leftover dollars, the stop that lands the risk exactly and the plan contract cap.',
            group: ToolGroup.Size,
            hasPage: true,
            icon: Crosshair,
            label: 'Position size',
            route: routes.propCalculator.positionSize,
        },
        ToolUrlCodec.PositionSize,
    ),
    [ToolId.Rules]: statelessTool({
        blurb: 'Browse the modeled rules of every plan: drawdown, daily loss limit, consistency, payout structure and fees.',
        group: ToolGroup.Compare,
        hasPage: true,
        icon: BookOpen,
        label: 'Plan rules',
        route: routes.propCalculator.rules,
    }),
    [ToolId.Simulator]: calculatorTool({
        blurb: 'Monte Carlo of a firm and plan against its real drawdown, daily-loss and consistency rules: pass odds, costs, payouts and charts.',
        group: ToolGroup.Simulate,
        hasPage: true,
        icon: Dices,
        label: 'Simulator',
        route: routes.propCalculator.simulator,
    }),
    [ToolId.Sizing]: calculatorTool({
        blurb: 'Risk-per-trade sweep from 0.25% to 5% and a winrate by reward-to-risk heatmap of pass odds, funded survival and monthly net.',
        group: ToolGroup.Size,
        hasPage: true,
        icon: Scale,
        label: 'Sizing',
        route: routes.propCalculator.sizing,
    }),
    [ToolId.StrategyLab]: calculatorTool({
        blurb: 'Compares copy-traded, grouped and independent multi-account strategies side by side on the current plan.',
        group: ToolGroup.Labs,
        hasPage: true,
        icon: TestTubes,
        label: 'Strategy lab',
        route: routes.propCalculator.strategyLab,
    }),
} satisfies Readonly<Record<ToolId, Omit<ToolCatalogEntry, 'id'>>>;

export type OwnCodecToolId = {
    [Id in ToolId]: (typeof TOOL_DEFINITIONS)[Id]['ownUrlCodec'] extends null
        ? never
        : Id;
}[ToolId];

const TOOL_ORDER: readonly ToolId[] = [
    ToolId.Simulator,
    ToolId.Analysis,
    ToolId.Sizing,
    ToolId.Compare,
    ToolId.CashFlow,
    ToolId.LadderLab,
    ToolId.StrategyLab,
    ToolId.Planner,
    ToolId.PositionSize,
    ToolId.FundedOptimizer,
    ToolId.Live,
    ToolId.Rules,
    ToolId.PayoutPlanner,
];

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = TOOL_ORDER.map(
    (id) => ({ id, ...TOOL_DEFINITIONS[id] }),
);

const TOOLS_BY_ROUTE = new Map<string, ToolCatalogEntry>(
    TOOL_CATALOG.map((entry) => [entry.route, entry]),
);

export const LINKED_TOOL_CATALOG: readonly ToolCatalogEntry[] =
    TOOL_CATALOG.filter((entry) => entry.hasPage);

export function isCalculatorInputsPath(pathname: string): boolean {
    return toolForPathname(pathname)?.usesCalculatorInputs ?? false;
}

export function toolCatalogEntry(id: ToolId): ToolCatalogEntry {
    return { id, ...TOOL_DEFINITIONS[id] };
}

export function toolForPathname(pathname: string): null | ToolCatalogEntry {
    return TOOLS_BY_ROUTE.get(pathname) ?? null;
}
