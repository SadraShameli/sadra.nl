import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import {
    hubCardHref,
    hubToolGroups,
} from '~/app/(app)/prop-calculator/_components/HubToolCards';
import {
    PanelSkeleton,
    PanelSkeletonSize,
} from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import {
    TOOL_CATALOG,
    toolCatalogEntry,
    ToolGroup,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import {
    LegacySection,
    legacySectionTarget,
} from '~/lib/site/legacyCalculatorLinks';
import { indexableRoutes, routes } from '~/lib/site/routes';

import { aliasPathOf } from '../../importSpecifiers';
import {
    collapsedSourceText,
    preloadSourceTexts,
    sourceFilesUnder,
    sourceText,
} from './toolPageFiles';

const CALCULATOR_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
);
const COMPONENTS_ROOT = path.join(CALCULATOR_ROOT, '_components');
const HUB_PAGE_PATH = path.join(CALCULATOR_ROOT, 'page.tsx');
const HUB_CARDS_PATH = path.join(COMPONENTS_ROOT, 'HubToolCards.tsx');
const HUB_REDIRECT_PATH = path.join(
    COMPONENTS_ROOT,
    'HubLegacySectionRedirect.tsx',
);
const PROVIDER_PATH = path.join(COMPONENTS_ROOT, 'CalculatorProvider.tsx');
const RETIRED_MODULES = ['CalculatorShell', 'SectionNav'];
const SUBNAV_SLOT_QUERY = "'#navbar-subnav-slot'";
const SRC_ROOT = path.join(process.cwd(), 'src');
const TOOLS_LAYOUT_PATH = path.join(CALCULATOR_ROOT, '(tools)', 'layout.tsx');
const LADDER_SEARCH_PATH = path.join(COMPONENTS_ROOT, 'useLadderSearch.ts');
const LADDER_SEARCH_TYPES_PATH = path.join(
    COMPONENTS_ROOT,
    'ladderSearchTypes.ts',
);
const LADDER_WORKER_REFERENCE = /new URL\(\s*'[^']*_workers\/ladderWorker\.ts'/;
const FUNDED_SWEEP_WORKER_REFERENCE =
    /new URL\(\s*'[^']*_workers\/fundedSweepWorker\.ts'/;
const USE_FUNDED_SWEEP_PATH = path.join(
    COMPONENTS_ROOT,
    'fundedOptimizer',
    'useFundedSweep.ts',
);
const NOTICE_COMPONENT = 'AppliedEvalLadderNotice';
const NOTICE_PATH = path.join(COMPONENTS_ROOT, `${NOTICE_COMPONENT}.tsx`);
const NOTICE_LEAD = 'Eval ladder applied from the ladder lab';
const NOT_USED_HERE_SCOPE = 'EvalLadderScope.NotUsedHere';
const DROPS_EVAL_DAY_POLICY = 'evalDayPolicy: undefined';
const DAY_STOP_LABEL_MODULE = path.join(
    COMPONENTS_ROOT,
    'describeDayStopRule.ts',
);
const RUNG_SIZING_LABEL_MODULE = path.join(
    COMPONENTS_ROOT,
    'rungSizingLabels.ts',
);
const LADDER_LAB_PANEL_PATH = path.join(COMPONENTS_ROOT, 'LadderLabPanel.tsx');
const LADDER_LAB_POPOVER_OPENER = '<InfoPopover title="Ladder Lab">';
const DAY_STOP_LABELS = [
    'Stop after K losses',
    'Stop after $ target',
    'Stop when day is green',
    'Stop after first win',
    'No stop',
    'Stop when green',
    'Stop on win',
    'Take all',
    'stops once the day is green',
    'stops after the first win',
    'no day stop',
];
const RUNG_SIZING_LABELS = [
    'Cap to cushion',
    'Skip trade',
    'Unaffordable rung',
];
const RUNG_SIZING_VALUES = ['capToCushion', 'skipIfUnaffordable'];
const EVAL_DAY_POLICY_PAGES = [
    'simulator',
    'analysis',
    'sizing',
    'compare',
    'cash-flow',
    'ladder-lab',
    'planner',
];

const LADDER_READING_PAGES_OUTSIDE_PAGES = [
    { folder: 'funded-optimizer', view: 'FundedOptimizerView' },
    { folder: 'bankroll', view: 'BankrollView' },
] as const;

interface ToolPageSpec {
    consumesBaseResult: boolean;
    folder: string;
    hidesPendingResult: boolean;
    innerSections: readonly LegacySection[];
    panels: readonly string[];
    route: string;
    toolId: ToolId;
    toolIdMember: string;
    view: string;
}

const PAGES: readonly ToolPageSpec[] = [
    {
        consumesBaseResult: true,
        folder: 'simulator',
        hidesPendingResult: false,
        innerSections: [],
        panels: ['ResultsPanel', 'PercentileBar', 'ChartPanel'],
        route: routes.propCalculator.simulator,
        toolId: ToolId.Simulator,
        toolIdMember: 'Simulator',
        view: 'SimulatorView',
    },
    {
        consumesBaseResult: true,
        folder: 'analysis',
        hidesPendingResult: true,
        innerSections: [],
        panels: [
            'StrategyAnalysis',
            'TailRiskPanel',
            'DrawdownDurationPanel',
            'ResiliencePanel',
            'RuleStressTestPanel',
        ],
        route: routes.propCalculator.analysis,
        toolId: ToolId.Analysis,
        toolIdMember: 'Analysis',
        view: 'AnalysisView',
    },
    {
        consumesBaseResult: false,
        folder: 'sizing',
        hidesPendingResult: false,
        innerSections: [],
        panels: ['OptimalRiskTable', 'SensitivityHeatmap'],
        route: routes.propCalculator.sizing,
        toolId: ToolId.Sizing,
        toolIdMember: 'Sizing',
        view: 'SizingView',
    },
    {
        consumesBaseResult: false,
        folder: 'compare',
        hidesPendingResult: false,
        innerSections: [],
        panels: ['PlanComparisonTable', 'FirmComparisonTable'],
        route: routes.propCalculator.compare,
        toolId: ToolId.Compare,
        toolIdMember: 'Compare',
        view: 'CompareView',
    },
    {
        consumesBaseResult: false,
        folder: 'cash-flow',
        hidesPendingResult: false,
        innerSections: [],
        panels: ['CashFlowPanel'],
        route: routes.propCalculator.cashFlow,
        toolId: ToolId.CashFlow,
        toolIdMember: 'CashFlow',
        view: 'CashFlowView',
    },
    {
        consumesBaseResult: false,
        folder: 'ladder-lab',
        hidesPendingResult: false,
        innerSections: [LegacySection.LadderLab],
        panels: ['LadderLabPanel'],
        route: routes.propCalculator.ladderLab,
        toolId: ToolId.LadderLab,
        toolIdMember: 'LadderLab',
        view: 'LadderLabView',
    },
    {
        consumesBaseResult: false,
        folder: 'strategy-lab',
        hidesPendingResult: false,
        innerSections: [],
        panels: ['StrategyLabPanel'],
        route: routes.propCalculator.strategyLab,
        toolId: ToolId.StrategyLab,
        toolIdMember: 'StrategyLab',
        view: 'StrategyLabView',
    },
    {
        consumesBaseResult: false,
        folder: 'planner',
        hidesPendingResult: false,
        innerSections: [],
        panels: ['PortfolioPanel'],
        route: routes.propCalculator.planner,
        toolId: ToolId.Planner,
        toolIdMember: 'Planner',
        view: 'PlannerView',
    },
];

const INNER_SECTION_PANELS: Readonly<Partial<Record<LegacySection, string>>> = {
    [LegacySection.LadderLab]: 'LadderLabPanel',
};

const ALL_TOOL_PANELS = [
    'CashFlowPanel',
    'ChartPanel',
    'DrawdownDurationPanel',
    'FirmComparisonTable',
    'LadderLabPanel',
    'OptimalRiskTable',
    'PercentileBar',
    'PlanComparisonTable',
    'PortfolioPanel',
    'ResiliencePanel',
    'ResultsPanel',
    'RuleStressTestPanel',
    'SensitivityHeatmap',
    'StrategyAnalysis',
    'StrategyLabPanel',
    'TailRiskPanel',
];

const HEAVY_PANELS = new Set([
    'CashFlowPanel',
    'ChartPanel',
    'DrawdownDurationPanel',
    'FirmComparisonTable',
    'LadderLabPanel',
    'OptimalRiskTable',
    'PlanComparisonTable',
    'PortfolioPanel',
    'ResiliencePanel',
    'ResultsPanel',
    'RuleStressTestPanel',
    'SensitivityHeatmap',
    'StrategyAnalysis',
    'StrategyLabPanel',
    'TailRiskPanel',
]);

const PINNED_PANEL_PROPS: Readonly<Record<string, readonly string[]>> = {
    CashFlowPanel: [
        'baseInputs={simInputs}firmDisplayName={state.firm.displayName}maxAccounts={state.firm.maxFundedAccounts(state.plan)}',
    ],
    ChartPanel: [
        'chartType={chartType}maxEvalDays={state.maxEvalDays}onChartTypeChange={setChartType}result={result}totalTrials={state.trials}',
    ],
    DrawdownDurationPanel: ['result={result}'],
    FirmComparisonTable: [
        'activeFirmId={state.firm.id}bankrollCents={bankrollCents}baseInputs={simInputs}firms={firms}isBankrollPending={isBankrollPending}objective={state.objective}planOptIns={planOptIns}targetAccountSize={state.plan.accountSize}',
    ],
    LadderLabPanel: [
        'activePolicy={state.evalDayPolicy}baseInputs={simInputs}onApply={setEvalDayPolicy}',
    ],
    OptimalRiskTable: [
        'bankroll={roundBudgetCents===null?null:dollars(roundBudgetCents/CENTS_PER_DOLLAR)}baseInputs={simInputs}currentRiskPercent={state.sizingMode===SizingMode.Percent?state.riskPercent:riskDollarsToPercent(state.riskDollars,state.plan.accountSize)}plan={state.plan}',
    ],
    PercentileBar: [
        'description={kpiDescriptions.finalBalance}formatValue={formatCompactCurrency}label="Finalbalancedistribution"p5={result.finalBalanceP5}p25={result.finalBalanceP25}p50={result.finalBalanceP50}p75={result.finalBalanceP75}p95={result.finalBalanceP95}referenceLine={{label:\'Startingbalance\',value:state.plan.accountSize}}',
        'description={kpiDescriptions.daysToPass}formatValue={formatDays}label="Daystopassdistribution"p5={result.daysToPassP5}p25={result.daysToPassP25}p50={result.daysToPassP50}p75={result.daysToPassP75}p95={result.daysToPassP95}',
    ],
    PlanComparisonTable: [
        'activePlan={state.plan}bankrollCents={bankrollCents}baseInputs={simInputs}firm={state.firm}isBankrollPending={isBankrollPending}objective={state.objective}planOptIns={planOptIns}',
    ],
    PortfolioPanel: [
        'baseInputs={simInputs}currentFirm={state.firm}currentPlan={state.plan}firms={firms}onPortfolioChange={setPortfolio}planOptIns={planOptIns}portfolio={state.portfolio}',
    ],
    ResiliencePanel: ['baseInputs={simInputs}result={result}'],
    ResultsPanel: [
        'fundedHorizonDays={state.fundedHorizonDays}isPending={isPending}onPin={()=>pinScenario(result)}onUnpin={unpinScenario}pinned={pinned?.result??null}plan={state.plan}result={result}',
    ],
    RuleStressTestPanel: ['baseInputs={simInputs}'],
    SensitivityHeatmap: [
        'baseInputs={simInputs}currentRR={state.rrRatio}currentWinrate={state.winrate}',
    ],
    StrategyAnalysis: ['baseInputs={simInputs}result={result}'],
    StrategyLabPanel: [
        'activationDiscountPercent={state.activationDiscountPercent}commissionPerRoundTrip={state.commissionPerRoundTrip}evalDiscountPercent={state.evalDiscountPercent}fundedHorizonDays={state.fundedHorizonDays}labLink={state.labLink}linkActivationDiscount={state.linkActivationDiscount}liveTransferHazard={state.liveTransferHazard}maxEvalDays={state.maxEvalDays}minRetainedCushion={simInputs.minRetainedCushion}monthlySubscriptionDiscountPercent={state.monthlySubscriptionDiscountPercent}onAdd={addLabScenario}onRemove={removeLabScenario}onReset={resetLabScenarios}onUpdate={updateLabScenario}payoutRequestSize={simInputs.payoutRequestSize}plan={simInputs.plan}resetDiscountPercent={state.resetDiscountPercent}rungSizing={simInputs.rungSizing}scenarios={state.labScenarios}seed={state.seed}',
    ],
    TailRiskPanel: ['result={result}'],
};

const RESOLVED_IMPORTS = new Map<string, null | string>();
const STATIC_IMPORTS = new Map<string, string[]>();

const PANEL_SKELETON_IMPORT =
    /^import \{[^}]*\bPanelSkeleton\b[^}]*\} from '~\/app\/\(app\)\/prop-calculator\/_components\/PanelSkeleton';$/m;

function actionHandlers(props: string): string[] {
    return props
        .matchAll(/on\w+=\{(?:\(\)=>)?(\w+)[(}]/g)
        .map((match) => match[1] ?? '')
        .toArray();
}

function byText(a: string, b: string): number {
    return a.localeCompare(b);
}

function calculatorFiles(): readonly string[] {
    return sourceFiles(CALCULATOR_ROOT);
}

function destructuredActions(view: string): Set<string> {
    const match = /const \{([^}]*)\} = useCalculatorActions\(\);/.exec(view);
    return new Set(
        (match?.[1] ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length > 0),
    );
}

function dynamicImports(source: string): string[] {
    return source
        .matchAll(/\bimport\(\s*'([^']+)'/g)
        .map((match) => match[1] ?? '')
        .toArray();
}

function filesWriting(text: string): string[] {
    return calculatorFiles()
        .filter((file) => collapsedSourceText(file).includes(text))
        .map((file) => path.relative(CALCULATOR_ROOT, file))
        .toSorted(byText);
}

function firstJsxTagAfterReturn(source: string): string {
    const match = /return \(\s*<>\s*<(\w+)/.exec(source);
    return match?.[1] ?? '';
}

function importClosure(
    entries: readonly string[],
    shouldFollowDynamic: boolean,
): Set<string> {
    const seen = new Set<string>();
    const queue = [...entries];
    while (queue.length > 0) {
        const file = queue.pop();
        if (file === undefined || seen.has(file)) continue;
        seen.add(file);
        const source = sourceText(file);
        const specifiers = [
            ...staticImports(source),
            ...(shouldFollowDynamic ? dynamicImports(source) : []),
        ];
        for (const specifier of specifiers) {
            const resolved = resolveImport(file, specifier);
            if (resolved?.startsWith(CALCULATOR_ROOT)) queue.push(resolved);
        }
    }
    return seen;
}

function isEvalDayPolicyDropped(component: string): boolean {
    const file = path.join(COMPONENTS_ROOT, `${component}.tsx`);
    return existsSync(file) && sourceText(file).includes(DROPS_EVAL_DAY_POLICY);
}

function isEvalDayPolicyReader(view: string): boolean {
    return (
        view.includes('useBaseResult()') ||
        view.includes('state.evalDayPolicy') ||
        simInputsPanels(view).some((panel) => !isEvalDayPolicyDropped(panel))
    );
}

function isPlainNoticeShown(file: string, seen: Set<string>): boolean {
    if (seen.has(file)) return false;
    seen.add(file);
    const source = sourceText(file);
    if (jsxAttributes(source, NOTICE_COMPONENT).some(isPlainScope)) {
        return true;
    }
    return staticImports(source).some((specifier) => {
        const resolved = resolveImport(file, specifier);
        if (
            resolved?.startsWith(COMPONENTS_ROOT) !== true ||
            !resolved.endsWith('.tsx')
        ) {
            return false;
        }
        const component = path.basename(resolved, '.tsx');
        return (
            jsxAttributes(source, component).some(isPlainScope) &&
            isPlainNoticeShown(resolved, seen)
        );
    });
}

function isPlainScope(attributes: string): boolean {
    return !attributes.includes(NOT_USED_HERE_SCOPE);
}

function jsxAttributes(source: string, tag: string): string[] {
    const opener = new RegExp(String.raw`<${tag}(?=[\s/>])`, 'g');
    return source
        .matchAll(opener)
        .map((match) => {
            const start = match.index + match[0].length;
            return source.slice(start, openingTagEnd(source, start));
        })
        .toArray();
}

function normalizedProps(attributes: string): string {
    return attributes
        .replaceAll(/\s+/g, '')
        .replaceAll(/,(?=[)\]}])/g, '')
        .replaceAll(/\bactions\./g, '');
}

function openingTagEnd(source: string, start: number): number {
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
        else if (
            depth === 0 &&
            (char === '>' || source.startsWith('/>', index))
        )
            return index;
    }
    return source.length;
}

function pageSource(spec: ToolPageSpec): string {
    return readSource('(tools)', spec.folder, 'page.tsx');
}

function pageSpec(toolId: ToolId): ToolPageSpec {
    const spec = PAGES.find((candidate) => candidate.toolId === toolId);
    if (spec === undefined) throw new Error(`no page spec for ${toolId}`);
    return spec;
}

function popoverBody(): string {
    const source = sourceText(LADDER_LAB_PANEL_PATH);
    const start = source.indexOf(LADDER_LAB_POPOVER_OPENER);
    const end = source.indexOf('</InfoPopover>', start);
    return source.slice(start, end).replaceAll(/\s+/g, ' ');
}

function readSource(...segments: string[]): string {
    return sourceText(path.join(CALCULATOR_ROOT, ...segments));
}

function resolveImport(from: string, specifier: string): null | string {
    const key = `${path.dirname(from)}|${specifier}`;
    const known = RESOLVED_IMPORTS.get(key);
    if (known !== undefined) return known;
    const resolved = resolveImportUncached(from, specifier);
    RESOLVED_IMPORTS.set(key, resolved);
    return resolved;
}

function resolveImportUncached(from: string, specifier: string): null | string {
    let base: string;
    const aliased = aliasPathOf(specifier, SRC_ROOT);
    if (aliased !== null) {
        base = aliased;
    } else if (specifier.startsWith('.')) {
        base = path.resolve(path.dirname(from), specifier);
    } else {
        return null;
    }
    const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
    ];
    return (
        candidates.find(
            (candidate) =>
                existsSync(candidate) && statSync(candidate).isFile(),
        ) ?? null
    );
}

function resultGuard(spec: ToolPageSpec): string {
    return spec.hidesPendingResult
        ? 'result === null || isPending ?'
        : 'result === null ?';
}

function sectionAttributes(source: string): string[] {
    return jsxAttributes(source, 'ToolSection');
}

function sectionIds(source: string): string[] {
    return jsxAttributes(source, 'ToolSection').map((attributes) => {
        const match = /id=\{LegacySection\.(\w+)\}/.exec(attributes);
        if (match === null) throw new Error('ToolSection without a legacy id');
        const member = match[1] as keyof typeof LegacySection;
        return LegacySection[member];
    });
}

function sectionsOnRoute(route: string): string[] {
    return Object.values(LegacySection).filter(
        (section) => legacySectionTarget(`#${section}`)?.route === route,
    );
}

function simInputsPanels(view: string): string[] {
    const tags = new Set(
        view.matchAll(/<([A-Z]\w*)(?=[\s/>])/g).map((match) => match[1] ?? ''),
    );
    return [...tags]
        .filter((tag) =>
            jsxAttributes(view, tag).some((attributes) =>
                attributes.includes('={simInputs}'),
            ),
        )
        .toSorted(byText);
}

function skeletonIndex(source: string, from: number): number {
    const match = /<\w*Skeleton[\s/>]/.exec(source.slice(from));
    return match === null ? -1 : from + match.index;
}

function sourceFiles(root: string): readonly string[] {
    return sourceFilesUnder(root);
}

function staticImportersOf(target: string): string[] {
    return calculatorFiles()
        .filter((file) =>
            staticImports(sourceText(file)).some(
                (specifier) => resolveImport(file, specifier) === target,
            ),
        )
        .map((file) => path.relative(CALCULATOR_ROOT, file))
        .toSorted(byText);
}

function staticImports(source: string): string[] {
    const known = STATIC_IMPORTS.get(source);
    if (known !== undefined) return known;
    const found = source
        .matchAll(
            /^\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?'([^']+)';?$/gm,
        )
        .map((match) => match[1] ?? '')
        .toArray();
    STATIC_IMPORTS.set(source, found);
    return found;
}

function viewPath(spec: ToolPageSpec): string {
    return path.join(
        CALCULATOR_ROOT,
        '(tools)',
        spec.folder,
        `${spec.view}.tsx`,
    );
}

function viewSource(spec: ToolPageSpec): string {
    return sourceText(viewPath(spec));
}

beforeAll(async () => {
    await preloadSourceTexts(SRC_ROOT);
});

describe.each(PAGES)('the $folder tool page', (spec) => {
    it('exports metadata from buildToolMetadata for its ToolId and renders its view', () => {
        const page = pageSource(spec);
        expect(page).toContain(
            `export const metadata: Metadata = buildToolMetadata(ToolId.${spec.toolIdMember});`,
        );
        expect(page).toContain(`<${spec.view} />`);
        expect(spec.toolId).toBe(
            ToolId[spec.toolIdMember as keyof typeof ToolId],
        );
    });

    it('renders no <main>: the tools layout owns the landmark', () => {
        expect(pageSource(spec)).not.toMatch(/<main[\s>]/);
        expect(viewSource(spec)).not.toMatch(/<main[\s>]/);
    });

    it('starts with ToolPageHeading for its tool, so the <h1> and the toolbar come first', () => {
        const view = viewSource(spec);
        expect(firstJsxTagAfterReturn(view)).toBe('ToolPageHeading');
        expect(view).toContain(
            `<ToolPageHeading toolId={ToolId.${spec.toolIdMember}} />`,
        );
        expect(view).not.toMatch(/<h1[\s>]/);
    });

    it('wraps exactly the legacy sections mapped to its route, each once, in a ToolSection with a title', () => {
        const view = viewSource(spec);
        const ids = sectionIds(view);
        expect(ids.toSorted(byText)).toEqual(
            sectionsOnRoute(spec.route)
                .filter(
                    (section) =>
                        !new Set<string>(spec.innerSections).has(section),
                )
                .toSorted(byText),
        );
        expect(new Set(ids).size).toBe(ids.length);
        for (const attributes of sectionAttributes(view)) {
            expect(attributes).toMatch(/title="[^"]+"/);
        }
    });

    it('shows each section <h2> on a multi-section page and hides it only on a single-section page (PD-7)', () => {
        const sections = sectionAttributes(viewSource(spec));
        const srOnly = sections.filter((attributes) =>
            /\bsrOnlyHeading\b/.test(attributes),
        );
        expect(sections.length).toBeGreaterThan(0);
        expect(srOnly).toHaveLength(sections.length === 1 ? 1 : 0);
    });

    it('keeps every inner legacy id inside its panel with scroll-mt-26, so a legacy fragment lands below the navbar', () => {
        for (const section of spec.innerSections) {
            const panel = INNER_SECTION_PANELS[section];
            expect(panel).toBeDefined();
            expect(spec.panels).toContain(panel);
            const source = readSource('_components', `${panel ?? ''}.tsx`);
            const opener = new RegExp(
                String.raw`<\w+(?=[^>]*\bid="${section}")[^>]*>`,
            ).exec(source);
            expect(opener?.[0]).toMatch(/scroll-mt-26/);
        }
    });

    it('reads every handler it passes to a panel from useCalculatorActions()', () => {
        const view = viewSource(spec);
        const hasActionsObject = view.includes(
            'const actions = useCalculatorActions();',
        );
        const destructured = destructuredActions(view);
        for (const panel of spec.panels) {
            for (const props of jsxAttributes(view, panel)) {
                const handlers = actionHandlers(normalizedProps(props));
                for (const handler of handlers) {
                    expect(
                        destructured.has(handler) ||
                            (hasActionsObject &&
                                props.includes(`actions.${handler}`)),
                    ).toBe(true);
                }
            }
        }
    });

    it('imports only its own panels', () => {
        const view = viewSource(spec);
        for (const panel of ALL_TOOL_PANELS) {
            const isOwn = spec.panels.includes(panel);
            expect(view.includes(`_components/${panel}'`)).toBe(isOwn);
        }
    });

    it('loads heavy panels through next/dynamic with a Skeleton fallback', () => {
        const view = viewSource(spec);
        expect(view).toContain("import dynamic from 'next/dynamic';");
        const heavyPanels = spec.panels.filter((p) => HEAVY_PANELS.has(p));
        for (const panel of heavyPanels) {
            expect(view).toMatch(
                new RegExp(
                    String.raw`const ${panel} = dynamic\(\s*\(\) =>\s*import\(\s*'~/app/\(app\)/prop-calculator/_components/${panel}',?\s*\),\s*\{\s*loading: \(\) => <\w*Skeleton`,
                ),
            );
            expect(view).not.toMatch(new RegExp(`^import ${panel} from`, 'm'));
        }
    });

    it('passes each panel the same props as the post-wave-19 shell', () => {
        const view = viewSource(spec);
        for (const panel of spec.panels) {
            expect(
                jsxAttributes(view, panel).map((a) => normalizedProps(a)),
            ).toEqual(PINNED_PANEL_PROPS[panel]);
        }
    });

    it(`${spec.consumesBaseResult ? 'reads' : 'never reads'} the shared base result`, () => {
        expect(viewSource(spec).includes('useBaseResult()')).toBe(
            spec.consumesBaseResult,
        );
    });

    it('renders a Skeleton for every result-consuming panel until the result exists', () => {
        const view = viewSource(spec);
        const guard = resultGuard(spec);
        const guards = view.split(guard).slice(1);
        const consumers = spec.panels.filter((panel) =>
            (PINNED_PANEL_PROPS[panel] ?? []).some((props) =>
                props.includes('result'),
            ),
        );
        if (consumers.length === 0) {
            expect(guards).toHaveLength(0);
            return;
        }
        expect(guards.length).toBeGreaterThan(0);
        for (const panel of consumers) {
            const at = view.indexOf(`<${panel}`);
            const guardAt = view.lastIndexOf(guard, at);
            const skeletonAt = skeletonIndex(view, guardAt);
            expect(guardAt).toBeGreaterThan(-1);
            expect(skeletonAt).toBeGreaterThan(guardAt);
            expect(skeletonAt).toBeLessThan(at);
        }
    });

    it(`${spec.hidesPendingResult ? 'hides' : 'does not hide'} result panels while the base result is out of date`, () => {
        const view = viewSource(spec);
        expect(view.includes('result === null || isPending ?')).toBe(
            spec.hidesPendingResult,
        );
        if (!spec.hidesPendingResult) return;
        expect(view).toContain(
            'const { error, isPending, result } = useBaseResult();',
        );
        expect(view).not.toMatch(/result === null \?/);
    });

    it('uses the shared PanelSkeleton and writes no skeleton markup of its own', () => {
        const view = viewSource(spec);
        expect(view).toMatch(PANEL_SKELETON_IMPORT);
        expect(view).not.toMatch(/function PanelSkeleton/);
        expect(view).not.toMatch(/<Skeleton[\s/>]/);
        expect(view).not.toContain("from '~/components/ui/Skeleton'");
    });

    it('shows the inputs summary with the edit dialog exactly when the catalog says it uses the calculator inputs and the page does not own the form', () => {
        const entry = toolCatalogEntry(spec.toolId);
        expect(
            jsxAttributes(viewSource(spec), 'InputsSummary').length > 0,
        ).toBe(entry.usesCalculatorInputs && spec.toolId !== ToolId.Simulator);
    });
});

describe('the simulator page', () => {
    const spec = pageSpec(ToolId.Simulator);

    it('renders the shared inputs form with the results panel beside it', () => {
        const view = viewSource(spec);
        expect(view).toContain('<CalculatorInputsForm');
        const form = jsxAttributes(view, 'CalculatorInputsForm')[0] ?? '';
        expect(form).toContain('<ResultsPanel');
    });

    it('has no Strategy, Tail Risk or Portfolio section', () => {
        const ids = sectionIds(viewSource(spec));
        expect(ids).not.toContain(LegacySection.Strategy);
        expect(ids).not.toContain(LegacySection.TailRisk);
        expect(ids).not.toContain(LegacySection.Portfolio);
    });
});

describe('every legacy section of the eight tool pages', () => {
    it('lives on exactly one of them', () => {
        const all = PAGES.flatMap((spec) => [
            ...sectionIds(viewSource(spec)),
            ...spec.innerSections,
        ]);
        expect(new Set(all).size).toBe(all.length);
        expect(all.toSorted(byText)).toEqual(
            Object.values(LegacySection).toSorted(byText),
        );
    });
});

describe('the position-size tool page (PT-25a)', () => {
    const folder = 'position-size';
    const view = () => readSource('(tools)', folder, 'PositionSizeView.tsx');
    const viewFile = path.join(
        CALCULATOR_ROOT,
        '(tools)',
        folder,
        'PositionSizeView.tsx',
    );

    it('exports metadata from buildToolMetadata for ToolId.PositionSize and renders its view', () => {
        const page = readSource('(tools)', folder, 'page.tsx');
        expect(page).toContain(
            'export const metadata: Metadata = buildToolMetadata(ToolId.PositionSize);',
        );
        expect(page).toContain('<PositionSizeView />');
    });

    it('renders no <main>: the tools layout owns the landmark', () => {
        expect(readSource('(tools)', folder, 'page.tsx')).not.toMatch(
            /<main[\s>]/,
        );
        expect(view()).not.toMatch(/<main[\s>]/);
    });

    it('starts with ToolPageHeading for position size, sharing its own query', () => {
        const source = view();
        expect(firstJsxTagAfterReturn(source)).toBe('ToolPageHeading');
        const heading = normalizedProps(
            jsxAttributes(source, 'ToolPageHeading')[0] ?? '',
        );
        expect(heading).toContain('toolId={ToolId.PositionSize}');
        expect(heading).toMatch(
            /ownQuery=\{encodePositionSize\(\w+(?:,[^)]*)?\)\}/,
        );
        expect(source).not.toMatch(/<h1[\s>]/);
    });

    it('decodes its initial state from the query with its own codec', () => {
        const source = view();
        expect(source).toContain('decodePositionSize(');
        expect(source).toContain('useSearchParams()');
    });

    it('uses its own inputs, never the calculator inputs or the base result', () => {
        const source = view();
        expect(source).not.toContain('useCalculatorInputs');
        expect(source).not.toContain('useBaseResult');
        expect(
            importClosure([TOOLS_LAYOUT_PATH, viewFile], true),
        ).not.toContain(LADDER_SEARCH_PATH);
    });

    it('wraps each section in a <section aria-labelledby> with an <h2>', () => {
        const source = view();
        const sections = jsxAttributes(source, 'section');
        expect(sections.length).toBeGreaterThan(0);
        for (const attributes of sections) {
            expect(attributes).toMatch(/aria-labelledby=/);
        }
        expect(source.match(/<h2[\s>]/g)).toHaveLength(sections.length);
    });

    it('is linked from the catalog and listed for crawlers', () => {
        expect(toolCatalogEntry(ToolId.PositionSize).hasPage).toBe(true);
        expect(indexableRoutes).toContain(routes.propCalculator.positionSize);
    });
});

describe('the funded-optimizer tool page (PT-25b)', () => {
    const folder = 'funded-optimizer';
    const view = () => readSource('(tools)', folder, 'FundedOptimizerView.tsx');

    it('exports metadata from buildToolMetadata for ToolId.FundedOptimizer and renders its view', () => {
        const page = readSource('(tools)', folder, 'page.tsx');
        expect(page).toContain(
            'export const metadata: Metadata = buildToolMetadata(ToolId.FundedOptimizer);',
        );
        expect(page).toContain('<FundedOptimizerView />');
    });

    it('renders no <main>: the tools layout owns the landmark', () => {
        expect(readSource('(tools)', folder, 'page.tsx')).not.toMatch(
            /<main[\s>]/,
        );
        expect(view()).not.toMatch(/<main[\s>]/);
    });

    it('starts with ToolPageHeading for the funded optimizer, sharing the calculator inputs', () => {
        const source = view();
        expect(firstJsxTagAfterReturn(source)).toBe('ToolPageHeading');
        const heading = normalizedProps(
            jsxAttributes(source, 'ToolPageHeading')[0] ?? '',
        );
        expect(heading).toContain('toolId={ToolId.FundedOptimizer}');
        expect(source).not.toMatch(/<h1[\s>]/);
    });

    it('shows the shared inputs summary and runs the sweep off the main thread', () => {
        const source = view();
        expect(source).toContain('useCalculatorInputs');
        expect(source).toContain('<InputsSummary');
        expect(source).toContain('useFundedSweep(');
    });

    it('wraps its result in a <section aria-labelledby> with an <h2>', () => {
        const source = view();
        const sections = jsxAttributes(source, 'section');
        expect(sections.length).toBeGreaterThan(0);
        for (const attributes of sections) {
            expect(attributes).toMatch(/aria-labelledby=/);
        }
        expect(source.match(/<h2[\s>]/g)).toHaveLength(sections.length);
    });

    it('is linked from the catalog and listed for crawlers', () => {
        expect(toolCatalogEntry(ToolId.FundedOptimizer).hasPage).toBe(true);
        expect(indexableRoutes).toContain(
            routes.propCalculator.fundedOptimizer,
        );
    });
});

describe('the funded sweep worker (PT-25b)', () => {
    it('is referenced only from the funded sweep hook', () => {
        const referencing = calculatorFiles()
            .filter((file) =>
                FUNDED_SWEEP_WORKER_REFERENCE.test(sourceText(file)),
            )
            .map((file) => path.relative(CALCULATOR_ROOT, file));
        expect(referencing).toEqual([
            path.relative(CALCULATOR_ROOT, USE_FUNDED_SWEEP_PATH),
        ]);
    });

    it('is loaded by the tools layout only through the funded-optimizer page', () => {
        expect(importClosure([TOOLS_LAYOUT_PATH], false)).not.toContain(
            USE_FUNDED_SWEEP_PATH,
        );
    });
});

describe('the ladder worker (F-21)', () => {
    const ladderPage = pageSpec(ToolId.LadderLab);

    it('keeps the ladder run types in a worker-free module', () => {
        const source = sourceText(LADDER_SEARCH_TYPES_PATH);
        expect(source).not.toMatch(/^'use client';/m);
        expect(source).not.toMatch(/\bWorker\b/);
        expect(source).not.toContain('_workers');
        expect(staticImports(source)).not.toContain('./useLadderSearch');
        for (const name of [
            'enum LadderRunPhase',
            'interface LadderProgress',
            'interface LadderSearchInputs',
            'interface LadderSearchRun',
            'type LadderSearchState',
        ]) {
            expect(source).toContain(`export ${name}`);
        }
    });

    it.each([
        'ladderResultSlot.ts',
        'ladderUnscorable.ts',
        'ladderLabRestore.ts',
    ])(
        '%s takes the ladder types from ladderSearchTypes, not the hook',
        (file) => {
            const imports = staticImports(readSource('_components', file));
            expect(imports).not.toContain('./useLadderSearch');
            expect(imports).toContain('./ladderSearchTypes');
        },
    );

    it('is referenced only from the ladder search hook', () => {
        const referencing = calculatorFiles()
            .filter((file) => LADDER_WORKER_REFERENCE.test(sourceText(file)))
            .map((file) => path.relative(CALCULATOR_ROOT, file));
        expect(referencing).toEqual([
            path.relative(CALCULATOR_ROOT, LADDER_SEARCH_PATH),
        ]);
        expect(staticImportersOf(LADDER_SEARCH_PATH)).toEqual([
            path.join('_components', 'LadderLabPanel.tsx'),
        ]);
    });

    it('is loaded by the tools layout only through the ladder lab page', () => {
        expect(
            staticImportersOf(path.join(COMPONENTS_ROOT, 'LadderLabPanel.tsx')),
        ).toEqual([]);
        expect(importClosure([TOOLS_LAYOUT_PATH], false)).not.toContain(
            LADDER_SEARCH_PATH,
        );
    });

    it.each(PAGES.filter((spec) => spec !== ladderPage))(
        'never reaches the $folder page, even through its lazy panels',
        (spec) => {
            expect(
                importClosure([TOOLS_LAYOUT_PATH, viewPath(spec)], true),
            ).not.toContain(LADDER_SEARCH_PATH);
        },
    );

    it('reaches the ladder lab page only through its lazy panel', () => {
        expect(
            importClosure([TOOLS_LAYOUT_PATH, viewPath(ladderPage)], false),
        ).not.toContain(LADDER_SEARCH_PATH);
        expect(
            importClosure([TOOLS_LAYOUT_PATH, viewPath(ladderPage)], true),
        ).toContain(LADDER_SEARCH_PATH);
    });
});

describe('the applied eval ladder notice (F-14)', () => {
    it('is needed on every page whose results read the eval day policy', () => {
        expect(
            PAGES.filter((spec) => isEvalDayPolicyReader(viewSource(spec))).map(
                (spec) => spec.folder,
            ),
        ).toEqual(EVAL_DAY_POLICY_PAGES);
    });

    it('does not count a panel that drops the eval day policy as a reader', () => {
        const sizing = viewSource(pageSpec(ToolId.Sizing));
        expect(simInputsPanels(sizing)).toEqual([
            'OptimalRiskTable',
            'SensitivityHeatmap',
        ]);
        expect(isEvalDayPolicyDropped('OptimalRiskTable')).toBe(true);
        expect(isEvalDayPolicyDropped('SensitivityHeatmap')).toBe(false);
        expect(
            isEvalDayPolicyReader(
                sizing.replaceAll(
                    /<SensitivityHeatmap(?=[\s/>])/g,
                    '<OptimalRiskTable',
                ),
            ),
        ).toBe(false);
    });

    it.each(
        PAGES.filter((spec) => EVAL_DAY_POLICY_PAGES.includes(spec.folder)),
    )('is shown on the $folder page', (spec) => {
        expect(isPlainNoticeShown(viewPath(spec), new Set())).toBe(true);
    });

    it.each(LADDER_READING_PAGES_OUTSIDE_PAGES)(
        'is shown on the $folder page, whose results read the eval ladder',
        ({ folder, view }) => {
            const file = path.join(
                CALCULATOR_ROOT,
                '(tools)',
                folder,
                `${view}.tsx`,
            );
            expect(isPlainNoticeShown(file, new Set())).toBe(true);
        },
    );

    it.each(
        PAGES.filter((spec) => !EVAL_DAY_POLICY_PAGES.includes(spec.folder)),
    )(
        'never says the ladder is applied to the $folder page results',
        (spec) => {
            expect(isPlainNoticeShown(viewPath(spec), new Set())).toBe(false);
        },
    );

    it.each(
        calculatorFiles()
            .filter((file) => sourceText(file).includes(DROPS_EVAL_DAY_POLICY))
            .map((file) => path.relative(CALCULATOR_ROOT, file)),
    )('%s says the applied ladder is not used in its results', (file) => {
        const source = readSource(file);
        expect(
            jsxAttributes(source, NOTICE_COMPONENT).some(
                (attributes) => !isPlainScope(attributes),
            ),
        ).toBe(true);
    });

    it('is shown with the shared inputs form, the inputs summary and the edit dialog', () => {
        for (const file of [
            'CalculatorInputsForm.tsx',
            'InputsSummary.tsx',
            'EditInputsDialog.tsx',
        ]) {
            expect(
                isPlainNoticeShown(path.join(COMPONENTS_ROOT, file), new Set()),
            ).toBe(true);
        }
    });

    it('has one source for its wording', () => {
        const writers = calculatorFiles()
            .filter((file) => sourceText(file).includes(NOTICE_LEAD))
            .map((file) => path.relative(CALCULATOR_ROOT, file));
        expect(writers).toEqual([path.relative(CALCULATOR_ROOT, NOTICE_PATH)]);
    });
});

describe('the stop-rule and rung-sizing labels', () => {
    it.each(DAY_STOP_LABELS)(
        'writes the stop-rule label "%s" in describeDayStopRule only',
        (label) => {
            expect(filesWriting(label)).toEqual([
                path.relative(CALCULATOR_ROOT, DAY_STOP_LABEL_MODULE),
            ]);
        },
    );

    it.each(RUNG_SIZING_LABELS)(
        'writes the rung-sizing label "%s" in rungSizingLabels only',
        (label) => {
            expect(filesWriting(label)).toEqual([
                path.relative(CALCULATOR_ROOT, RUNG_SIZING_LABEL_MODULE),
            ]);
        },
    );

    it.each(RUNG_SIZING_VALUES)(
        'never hardcodes the rung-sizing value "%s" in an option list',
        (value) => {
            expect(filesWriting(`"${value}"`)).toEqual([]);
            expect(filesWriting(`'${value}'`)).toEqual([]);
        },
    );

    it.each(['LadderLabPanel.tsx', 'TradingInputs.tsx'])(
        '%s builds its rung-sizing options from the shared list',
        (file) => {
            const source = readSource('_components', file);
            expect(source).toMatch(/RUNG_SIZING_OPTIONS\.map\(/);
            expect(source).toContain('RUNG_SIZING_LABELS[');
        },
    );
});

describe('the ladder lab InfoPopover', () => {
    it('finds the popover', () => {
        expect(
            sourceText(LADDER_LAB_PANEL_PATH).indexOf(
                LADDER_LAB_POPOVER_OPENER,
            ),
        ).toBeGreaterThan(-1);
    });

    it('says what each unaffordable rung choice does, from the shared outcomes', () => {
        const body = popoverBody();
        expect(body).toMatch(/RUNG_SIZING_OPTIONS\.map\(/);
        expect(body).toContain('RUNG_SIZING_LABELS[');
        expect(body).toContain('RUNG_SIZING_OUTCOMES[');
    });

    it('no longer claims every rung is capped to the cushion', () => {
        expect(popoverBody()).not.toContain('Each rung is capped');
    });
});

describe('the hub page (F-8)', () => {
    it('exports the hub metadata and renders its own <main> with one <h1>', () => {
        const page = sourceText(HUB_PAGE_PATH);
        expect(page).toContain(
            'export const metadata: Metadata = buildHubMetadata();',
        );
        expect(page.match(/<main[\s>]/g)).toHaveLength(1);
        expect(page.match(/<h1[\s>]/g)).toHaveLength(1);
        expect(page).toContain('<HubToolCards />');
        expect(page).toContain('<HubLegacySectionRedirect />');
    });

    it('never mounts the calculator provider or the ladder search', () => {
        const closure = importClosure([HUB_PAGE_PATH], true);
        expect(closure).toContain(HUB_CARDS_PATH);
        expect(closure).toContain(HUB_REDIRECT_PATH);
        expect(closure).not.toContain(PROVIDER_PATH);
        expect(closure).not.toContain(LADDER_SEARCH_PATH);
    });

    it('renders an <h2> per tool group', () => {
        expect(sourceText(HUB_CARDS_PATH)).toMatch(/<h2[\s>]/);
    });
});

describe('hubToolGroups', () => {
    it('orders the groups as the hub screen lists them, each labelled', () => {
        const groups = hubToolGroups(TOOL_CATALOG);
        expect(groups.map((entry) => entry.group)).toEqual([
            ToolGroup.Simulate,
            ToolGroup.Analyse,
            ToolGroup.Size,
            ToolGroup.Compare,
            ToolGroup.Plan,
            ToolGroup.Labs,
        ]);
        expect(groups.map((entry) => entry.label)).toEqual([
            'Simulate',
            'Analyse',
            'Size',
            'Compare',
            'Plan',
            'Labs',
        ]);
    });

    it('shows every catalog tool once, under its own group, in catalog order', () => {
        const groups = hubToolGroups(TOOL_CATALOG);
        const shown = groups.flatMap((entry) => entry.tools);
        expect(shown.map((tool) => tool.id).toSorted(byText)).toEqual(
            TOOL_CATALOG.map((tool) => tool.id).toSorted(byText),
        );
        for (const entry of groups) {
            expect(entry.tools.length).toBeGreaterThan(0);
            expect(
                entry.tools.every((tool) => tool.group === entry.group),
            ).toBe(true);
            expect(entry.tools).toEqual(
                TOOL_CATALOG.filter((tool) => tool.group === entry.group),
            );
        }
    });

    it('drops a group with no tools', () => {
        expect(
            hubToolGroups(
                TOOL_CATALOG.filter((tool) => tool.group !== ToolGroup.Labs),
            ).map((entry) => entry.group),
        ).not.toContain(ToolGroup.Labs);
    });
});

describe('hubCardHref (F-38)', () => {
    const simulator = toolCatalogEntry(ToolId.Simulator);
    const positionSize = toolCatalogEntry(ToolId.PositionSize);
    const rules = toolCatalogEntry(ToolId.Rules);

    it('appends the last tool query to a tool that uses the calculator inputs', () => {
        expect(hubCardHref(simulator, 'firm=apex&wr=0.4')).toBe(
            `${routes.propCalculator.simulator}?firm=apex&wr=0.4`,
        );
    });

    it('links the bare route when there is no last query', () => {
        expect(hubCardHref(simulator, null)).toBe(
            routes.propCalculator.simulator,
        );
        expect(hubCardHref(simulator, '')).toBe(
            routes.propCalculator.simulator,
        );
    });

    it('never gives the calculator query to a tool with its own inputs', () => {
        expect(hubCardHref(positionSize, 'firm=apex')).toBe(
            routes.propCalculator.positionSize,
        );
        expect(hubCardHref(rules, 'firm=apex')).toBe(
            routes.propCalculator.rules,
        );
    });
});

describe('the retired shell (F-22)', () => {
    it.each(RETIRED_MODULES)(
        '%s is deleted and nothing refers to it',
        (name) => {
            expect(existsSync(path.join(COMPONENTS_ROOT, `${name}.tsx`))).toBe(
                false,
            );
            const referencing = sourceFiles(SRC_ROOT).filter((file) =>
                new RegExp(String.raw`\b${name}\b`).test(sourceText(file)),
            );
            expect(referencing).toEqual([]);
        },
    );

    it('leaves one component that portals into the navbar subnav slot', () => {
        const portals = sourceFiles(SRC_ROOT)
            .filter((file) => sourceText(file).includes(SUBNAV_SLOT_QUERY))
            .map((file) => path.relative(SRC_ROOT, file));
        expect(portals).toEqual([
            path.join('app', '(app)', '_components', 'RouteSubnav.tsx'),
        ]);
    });
});

describe('PanelSkeleton', () => {
    it.each([
        [PanelSkeletonSize.Panel, 'h-96'],
        [PanelSkeletonSize.Aside, 'min-h-96'],
        [PanelSkeletonSize.Bar, 'h-40'],
    ])(
        'renders the %s placeholder at %s, full width and rounded',
        (size, height) => {
            const element = PanelSkeleton({ size });
            const className = (element.props as { className: string })
                .className;
            expect(className.split(' ')).toEqual(
                expect.arrayContaining([height, 'w-full', 'rounded-xl']),
            );
        },
    );

    it('defaults to the panel size', () => {
        const element = PanelSkeleton({});
        const className = (element.props as { className: string }).className;
        expect(className.split(' ')).toContain('h-96');
        expect(className.split(' ')).not.toContain('min-h-96');
    });
});
