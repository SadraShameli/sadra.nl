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
    PiggyBank,
    Radio,
    Scale,
    Target,
    TestTubes,
    Wallet,
} from 'lucide-react';

import { BankrollUrlParameter } from '~/lib/schemas/bankrollUrlParameter';
import { routes } from '~/lib/site/routes';

import { PageStateBlob } from './types';

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
    Bankroll = 'bankroll',
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
    featured: boolean;
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

export interface ToolGroupTools {
    group: ToolGroup;
    label: string;
    tools: readonly [ToolCatalogEntry, ...ToolCatalogEntry[]];
}

type ToolDefinition = Omit<
    ToolCatalogEntry,
    'id' | 'ownUrlCodec' | 'sharesState' | 'usesCalculatorInputs'
>;

const TOOL_GROUP_LABELS: Readonly<Record<ToolGroup, string>> = {
    [ToolGroup.Analyse]: 'Analyse',
    [ToolGroup.Compare]: 'Compare',
    [ToolGroup.Labs]: 'Labs',
    [ToolGroup.Plan]: 'Plan',
    [ToolGroup.Simulate]: 'Simulate',
    [ToolGroup.Size]: 'Size',
};

const TOOL_GROUP_ORDER: readonly ToolGroup[] = [
    ToolGroup.Simulate,
    ToolGroup.Analyse,
    ToolGroup.Size,
    ToolGroup.Compare,
    ToolGroup.Plan,
    ToolGroup.Labs,
];

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
        featured: false,
        group: ToolGroup.Analyse,
        hasPage: true,
        icon: Activity,
        label: 'Analysis',
        route: routes.propCalculator.analysis,
    }),
    [ToolId.Bankroll]: calculatorTool({
        blurb: 'How likely a batch ends net negative or runs dry, the budget your loss-risk threshold needs, and a reinvesting projection.',
        featured: true,
        group: ToolGroup.Plan,
        hasPage: true,
        icon: PiggyBank,
        label: 'Bankroll',
        route: routes.propCalculator.bankroll,
    }),
    [ToolId.CashFlow]: calculatorTool({
        blurb: 'Cash flow over time: eval buys and retries, funded payouts and re-buys, with the P10 to P90 spread of cumulative net.',
        featured: false,
        group: ToolGroup.Plan,
        hasPage: true,
        icon: Wallet,
        label: 'Cash flow',
        route: routes.propCalculator.cashFlow,
    }),
    [ToolId.Compare]: calculatorTool({
        blurb: 'Every plan of the selected firm and every firm at your account size, simulated on your inputs and ranked by expected monthly net.',
        featured: true,
        group: ToolGroup.Compare,
        hasPage: true,
        icon: GitCompareArrows,
        label: 'Compare',
        route: routes.propCalculator.compare,
    }),
    [ToolId.FundedOptimizer]: calculatorTool({
        blurb: 'Ranks funded-stage candidates under your retained cushion and payout request, in the same order as the command-line optimizer.',
        featured: false,
        group: ToolGroup.Plan,
        hasPage: true,
        icon: Target,
        label: 'Funded optimizer',
        route: routes.propCalculator.fundedOptimizer,
    }),
    [ToolId.LadderLab]: calculatorTool({
        blurb: 'Searches within-day risk ladders on a grid and scores each on days to funded, cost per funded account and pass rate.',
        featured: false,
        group: ToolGroup.Labs,
        hasPage: true,
        icon: FlaskConical,
        label: 'Ladder lab',
        route: routes.propCalculator.ladderLab,
    }),
    [ToolId.Live]: calculatorTool({
        blurb: 'Simulates the live stage for plans with a modeled live account, and says so where the model is only a firm-level approximation.',
        featured: false,
        group: ToolGroup.Simulate,
        hasPage: true,
        icon: Radio,
        label: 'Live account',
        route: routes.propCalculator.live,
    }),
    [ToolId.PayoutPlanner]: ownCodecTool(
        {
            blurb: 'From a balance, peak and past payouts: readiness, the blocking gate, the rule-capped withdrawable and the net after the split.',
            featured: false,
            group: ToolGroup.Plan,
            hasPage: true,
            icon: Banknote,
            label: 'Payout planner',
            route: routes.propCalculator.payoutPlanner,
        },
        ToolUrlCodec.PayoutPlanner,
    ),
    [ToolId.Planner]: calculatorTool({
        blurb: 'A basket of accounts across any mix of firms and plans, with combined monthly income, total eval spend and portfolio ROI.',
        featured: false,
        group: ToolGroup.Plan,
        hasPage: true,
        icon: LayoutGrid,
        label: 'Multi-firm planner',
        route: routes.propCalculator.planner,
    }),
    [ToolId.PositionSize]: ownCodecTool(
        {
            blurb: 'Contracts for a dollar risk at a stop, the leftover dollars, the stop that lands the risk exactly and the plan contract cap.',
            featured: false,
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
        featured: false,
        group: ToolGroup.Compare,
        hasPage: true,
        icon: BookOpen,
        label: 'Plan rules',
        route: routes.propCalculator.rules,
    }),
    [ToolId.Simulator]: calculatorTool({
        blurb: 'Monte Carlo of a firm and plan against its real drawdown, daily-loss and consistency rules: pass odds, costs, payouts and charts.',
        featured: true,
        group: ToolGroup.Simulate,
        hasPage: true,
        icon: Dices,
        label: 'Simulator',
        route: routes.propCalculator.simulator,
    }),
    [ToolId.Sizing]: calculatorTool({
        blurb: 'Risk-per-trade sweep from 0.25% to 5% and a winrate by reward-to-risk heatmap of pass odds, funded survival and monthly net.',
        featured: false,
        group: ToolGroup.Size,
        hasPage: true,
        icon: Scale,
        label: 'Sizing',
        route: routes.propCalculator.sizing,
    }),
    [ToolId.StrategyLab]: calculatorTool({
        blurb: 'Compares copy-traded, grouped and independent multi-account strategies side by side on the current plan.',
        featured: true,
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
    ToolId.Bankroll,
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

const PAGE_STATE_BLOBS: Readonly<
    Partial<Record<ToolId, readonly PageStateBlob[]>>
> = {
    [ToolId.Planner]: [PageStateBlob.Portfolio],
    [ToolId.StrategyLab]: [PageStateBlob.LabScenarios],
};

const PAGE_OWNED_PARAMETERS: Readonly<
    Partial<Record<ToolId, readonly string[]>>
> = {
    [ToolId.Bankroll]: Object.values(BankrollUrlParameter),
};

export function isCalculatorInputsPath(pathname: string): boolean {
    return toolForPathname(pathname)?.usesCalculatorInputs ?? false;
}

export function pageOwnedParametersOf(id: ToolId): readonly string[] {
    return PAGE_OWNED_PARAMETERS[id] ?? [];
}

export function pageOwnedParametersOnPath(pathname: string): readonly string[] {
    const tool = toolForPathname(pathname);
    return tool === null ? [] : pageOwnedParametersOf(tool.id);
}

export function pageStateBlobsOf(id: ToolId): readonly PageStateBlob[] {
    return PAGE_STATE_BLOBS[id] ?? [];
}

export function pageStateBlobsOnPath(
    pathname: string,
): readonly PageStateBlob[] {
    const tool = toolForPathname(pathname);
    return tool === null ? [] : pageStateBlobsOf(tool.id);
}

export function toolCatalogEntry(id: ToolId): ToolCatalogEntry {
    return { id, ...TOOL_DEFINITIONS[id] };
}

export function toolForPathname(pathname: string): null | ToolCatalogEntry {
    return TOOLS_BY_ROUTE.get(pathname) ?? null;
}

export function toolsByGroup(
    catalog: readonly ToolCatalogEntry[],
): readonly ToolGroupTools[] {
    const groups: ToolGroupTools[] = [];
    for (const group of TOOL_GROUP_ORDER) {
        const [first, ...rest] = catalog.filter(
            (entry) => entry.group === group,
        );
        if (first !== undefined) {
            groups.push({
                group,
                label: TOOL_GROUP_LABELS[group],
                tools: [first, ...rest],
            });
        }
    }
    return groups;
}
