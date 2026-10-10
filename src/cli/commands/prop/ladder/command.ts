import { type ArgsDef, defineCommand, parseArgs } from 'citty';

import type { KnownUnsupportedFlag } from '~/cli/unknownFlagGuard';

import {
    describeStopRule,
    edgePlausibilityNote,
    evalPolicyArguments,
    type LiveTransferHazardArguments,
    monteCarloArguments,
    objectiveArgument,
    objectiveHeadingLine,
    ObjectiveNotApplicable,
    planArguments,
    planResolver,
    printEdgePlausibilityNotes,
    purchaseArguments,
    readInstrument,
    readObjective,
    readPositiveInteger,
    readPositiveNumber,
    RUIN_FIRST_NOT_APPLICABLE_MESSAGE,
    type TableColumn,
    TablePrinter,
    tradingArguments,
    type TradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import {
    unpricedTriggerLine,
    UnpricedTriggerSurface,
} from '~/cli/commands/prop/unpricedTrigger';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    assertLadderGridSize,
    defaultLadderGridMax,
    evalContractLimit,
    fraction,
    LADDER_EVAL_PASS_FLOOR,
    LADDER_IGNORED_INPUT_REASONS,
    type LadderGridConfig,
    LadderGridError,
    type LadderGridLabels,
    ladderGridSize,
    LadderIgnoredInput,
    type LadderScore,
    type LadderSearchOptions,
    type LadderSearchResult,
    MAX_LADDER_GRID_SIZE,
    minStopPoints,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
    runLadderSearch,
    validateLadderGrid,
} from '~/lib/prop-calculator';
import {
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { RankingSurface } from '~/lib/prop-calculator/advisor/actions';
import { describeShare } from '~/lib/prop-calculator/describe';

type LadderArguments = LadderGridArguments &
    Partial<Record<UnsupportedLadderFlag, unknown>> &
    Pick<TradingArguments, LadderTradingFlag>;

interface LadderGridArguments {
    lo: string;
    max?: string;
    'max-grid': string;
    rungs: string;
    step: string;
    top: string;
}

interface LadderGridSelection {
    grid: LadderGridConfig;
    gridSize: number;
    maxGridSize: number;
    topN: number;
}

interface LadderRanking {
    select: (result: LadderSearchResult) => readonly LadderScore[];
    title: string;
}

type LadderTradingFlag = Extract<
    keyof TradingArguments,
    keyof typeof ladderArguments
>;

type UnsupportedLadderFlag = Exclude<
    keyof (LiveTransferHazardArguments & TradingArguments),
    keyof typeof ladderArguments
>;

const LADDER_WORK_WARNING = 500_000_000;

interface UnsupportedLadderFlagInfo {
    readonly reason: LadderIgnoredInput;
    readonly takesValue: boolean;
}

const UNSUPPORTED_LADDER_FLAGS: Readonly<
    Record<UnsupportedLadderFlag, UnsupportedLadderFlagInfo>
> = {
    'early-withdrawal': {
        reason: LadderIgnoredInput.FundedPhase,
        takesValue: false,
    },
    'funded-days': { reason: LadderIgnoredInput.FundedPhase, takesValue: true },
    'funded-reset': {
        reason: LadderIgnoredInput.FundedPhase,
        takesValue: false,
    },
    'funded-risk': { reason: LadderIgnoredInput.FundedPhase, takesValue: true },
    'funded-rr': { reason: LadderIgnoredInput.FundedPhase, takesValue: true },
    'funded-tpd': { reason: LadderIgnoredInput.FundedPhase, takesValue: true },
    'idle-day-probability': {
        reason: LadderIgnoredInput.IdleDays,
        takesValue: true,
    },
    ladder: { reason: LadderIgnoredInput.OwnLadder, takesValue: true },
    'live-transfer-hazard': {
        reason: LadderIgnoredInput.FundedPhase,
        takesValue: true,
    },
    'max-attempts': {
        reason: LadderIgnoredInput.MaxAttempts,
        takesValue: true,
    },
    'max-lifetime-payouts': {
        reason: LadderIgnoredInput.FundedPhase,
        takesValue: true,
    },
    'path-granularity': {
        reason: LadderIgnoredInput.PathGranularity,
        takesValue: true,
    },
    'rebuy-lag-days': { reason: LadderIgnoredInput.RebuyLag, takesValue: true },
    'request-size': {
        reason: LadderIgnoredInput.FundedPhase,
        takesValue: true,
    },
    'retain-cushion': {
        reason: LadderIgnoredInput.FundedPhase,
        takesValue: true,
    },
    risk: { reason: LadderIgnoredInput.OwnLadder, takesValue: true },
    tpd: { reason: LadderIgnoredInput.OwnLadder, takesValue: true },
};

const UNSUPPORTED_LADDER_FLAG_NAMES = Object.keys(
    UNSUPPORTED_LADDER_FLAGS,
) as UnsupportedLadderFlag[];

const UNSUPPORTED_LADDER_FLAG_SPECS: readonly KnownUnsupportedFlag[] =
    UNSUPPORTED_LADDER_FLAG_NAMES.map((name) => ({
        name,
        takesValue: UNSUPPORTED_LADDER_FLAGS[name].takesValue,
    }));

const LADDER_TABLE_COLUMNS: readonly TableColumn[] = [
    { align: 'left', label: 'ladder', width: 26 },
    { label: 'eval pass', width: 9 },
    { label: '+/- pass', width: 8 },
    { label: 'days', width: 7 },
    { label: '+/- days', width: 8 },
    { label: '$/acct', width: 8 },
    { label: '+/- $', width: 8 },
    { label: 'min stop', width: 9 },
];

export const LADDER_TABLE_LABELS: readonly string[] = LADDER_TABLE_COLUMNS.map(
    (column) => column.label,
);

const STANDARD_ERROR_LEGEND =
    '  +/- = one standard error of Monte Carlo noise; rows within about 2 SE of #1 are statistically tied (raise --trials to separate them)';

const LADDER_GRID_FLAGS: LadderGridLabels = {
    limit: '--max-grid',
    lo: '--lo',
    max: '--max',
    slots: '--rungs',
    step: '--step',
};

export const LADDER_RANKINGS: readonly LadderRanking[] = [
    { select: (result) => result.bySpeed, title: 'FASTEST TO FUNDED' },
    {
        select: (result) => result.byCost,
        title: 'CHEAPEST PER FUNDED ACCOUNT',
    },
    {
        select: (result) => result.byPassRate,
        title: 'HIGHEST EVAL PASS RATE',
    },
];

export const ladderArguments = {
    ...planArguments,
    ...monteCarloArguments,
    ...purchaseArguments,
    ...evalPolicyArguments,
    ...objectiveArgument,
    lo: {
        default: '100',
        description: 'Smallest rung to search',
        type: 'string',
    },
    max: {
        description: 'Largest rung to search (default: 40% of cushion)',
        type: 'string',
    },
    'max-grid': {
        default: String(MAX_LADDER_GRID_SIZE),
        description:
            'Largest raw ladder grid to search; bigger grids are rejected before any work starts',
        type: 'string',
    },
    rungs: {
        default: '4',
        description: 'Ladder length',
        type: 'string',
    },
    step: {
        default: '100',
        description: 'Grid step between rungs',
        type: 'string',
    },
    top: {
        default: '10',
        description: 'Rows to show per ranking',
        type: 'string',
    },
} as const satisfies ArgsDef;

export function buildLadderSearchOptions(
    plan: Plan,
    arguments_: LadderArguments,
): LadderSearchOptions {
    assertSupportedLadderFlags(arguments_);
    const inputs = TradingInputs.parse({
        ...parseArgs<typeof tradingArguments>([], tradingArguments),
        ...arguments_,
    });
    const { grid, maxGridSize, topN } = readLadderGrid(
        arguments_,
        plan.drawdown.amount,
    );
    return {
        grid,
        maxGridSize,
        score: {
            commission: inputs.commissionPerRoundTrip,
            cushion: plan.drawdown.amount,
            discounts: plan.purchaseDiscounts(
                inputs.toCouponDiscounts(),
                inputs.copyAccounts,
            ),
            maxDays: inputs.maxEvalDays,
            plan,
            positionSizing: resolvePositionSizing(
                inputs.instrument,
                inputs.stopPoints,
            ),
            rrRatio: inputs.rrRatio,
            rungSizing: inputs.rungSizing,
            seedOffset: 0,
            sims: inputs.trials,
            stopRule: inputs.dayStop,
            winrate: inputs.winrate,
        },
        seed: inputs.seed,
        topN,
    };
}

export function describeEvalWindow(plan: Plan, requestedDays: number): string {
    const days = plan.evalDayCap(requestedDays);
    return days < requestedDays
        ? `eval days ${days} (plan cap)`
        : `eval days ${days}`;
}

export function describeInstantFundedPlan(
    plan: Plan,
): readonly [warning: string, hint: string] {
    return [
        `${plan.label} has no real evaluation phase: it funds instantly (profit target $0), so there is no eval to grid-search a ladder against.`,
        '  Use `cli prop sim` instead: it applies flat funded sizing from day one for this plan.',
    ];
}

export function describeLadderSizing(
    plan: Plan,
    positionSizing: null | PositionSizingConfig,
): string {
    if (positionSizing === null) {
        return 'sizing uncapped (set --stop-points to apply contract limits)';
    }
    const { instrument, stopPoints } = positionSizing;
    const sizing = `sizing ${instrument.symbol} @ ${stopPoints}pt`;
    const limit = evalContractLimit(plan.contractLimits, instrument.isMicro);
    return limit === null
        ? `${sizing}, no eval contract limit`
        : `${sizing}, eval cap ${limit} contracts (${formatCurrency(limit * instrument.pointValue * stopPoints)} max risk)`;
}

export function describeUnscorableLadders(
    result: Pick<LadderSearchResult, 'laddersScored' | 'unscorableCount'>,
): null | string {
    const { laddersScored, unscorableCount } = result;
    if (unscorableCount === 0) return null;
    const floor = formatPercent(LADDER_EVAL_PASS_FLOOR, 0);
    return unscorableCount >= laddersScored
        ? `all ${laddersScored} ladders passed the eval in under ${floor} of trials, below the eval pass floor the search needs to rank a ladder, so there is nothing to rank: check --winrate, --rr, --stop-points and the grid bounds`
        : `${unscorableCount} of ${laddersScored} ladders passed the eval in under ${floor} of trials and are left out of every ranking`;
}

export function ladderRankingsFor(
    objective: SizingObjective,
): readonly LadderRanking[] {
    const [speed, cost, passRate] = LADDER_RANKINGS;
    if (speed === undefined || cost === undefined || passRate === undefined) {
        throw new Error('LADDER_RANKINGS must list speed, cost and pass rate');
    }
    const reference: LadderRanking = {
        ...passRate,
        title: `${passRate.title} (reference only, not an objective)`,
    };
    switch (objective) {
        case SizingObjective.CycleCash: {
            return [proxyRanking(cost, objective), speed, reference];
        }
        case SizingObjective.MonthlyNet: {
            return [proxyRanking(speed, objective), cost, reference];
        }
        case SizingObjective.RuinFirst: {
            throw new ObjectiveNotApplicable(RUIN_FIRST_NOT_APPLICABLE_MESSAGE);
        }
    }
}

export function ladderTableRow(
    score: LadderScore,
    contractLimit: null | number,
    pointValue: number,
): string[] {
    const stop =
        contractLimit === null
            ? null
            : minStopPoints(
                  Math.max(...score.ladder),
                  contractLimit,
                  pointValue,
              );
    return [
        score.ladder.join(' / '),
        formatPercent(score.passRate),
        formatPercent(score.passRateStandardError, 2),
        score.expectedDaysToFunded.toFixed(1),
        score.expectedDaysToFundedStandardError.toFixed(2),
        formatCurrency(score.costPerFunded),
        formatCurrency(score.costPerFundedStandardError, 2),
        stop === null ? NOT_APPLICABLE : `${stop.toFixed(1)}pt`,
    ];
}

export function ladderWorkWarning(
    gridSize: number,
    trials: number,
): null | string {
    return gridSize * trials > LADDER_WORK_WARNING
        ? `scoring ${gridSize.toLocaleString('en-US')} ladders x ${trials.toLocaleString('en-US')} trials; expect a long run (reduce --rungs/--trials or raise --step)`
        : null;
}

export function readLadderGrid(
    arguments_: LadderGridArguments,
    cushion: number,
): LadderGridSelection {
    const grid: LadderGridConfig = {
        lo: readPositiveNumber(arguments_.lo, 'lo'),
        max: readPositiveNumber(
            arguments_.max ?? defaultLadderGridMax(cushion),
            'max',
        ),
        slots: readPositiveInteger(arguments_.rungs, 'rungs'),
        step: readPositiveNumber(arguments_.step, 'step'),
    };
    withLadderGridFlags(() => validateLadderGrid(grid));
    const maxGridSize = readPositiveInteger(arguments_['max-grid'], 'max-grid');
    return {
        grid,
        gridSize: withLadderGridFlags(() =>
            assertLadderGridSize(grid, maxGridSize),
        ),
        maxGridSize,
        topN: readPositiveInteger(arguments_.top, 'top'),
    };
}

function unsupportedLadderFlagReason(flag: UnsupportedLadderFlag): string {
    const reason =
        LADDER_IGNORED_INPUT_REASONS[UNSUPPORTED_LADDER_FLAGS[flag].reason];
    return `--${flag} is not supported by prop ladder: the ladder search ${reason}, so drop the flag or use prop sim`;
}

const command = defineCommand({
    args: ladderArguments,
    meta: {
        description:
            'Grid-search the optimal within-day risk ladder for one plan (--firm, --variant).',
        knownUnsupportedFlags: UNSUPPORTED_LADDER_FLAG_SPECS,
        name: 'ladder',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const objective = readObjective(
                context.args,
                RankingSurface.Ladder,
            );
            const plan = planResolver.resolveOne(context.args);
            if (plan.isInstantFunded) {
                const [warning, hint] = describeInstantFundedPlan(plan);
                ui.warn(warning);
                ui.muted(hint);
                return;
            }
            const options = buildLadderSearchOptions(plan, context.args);
            const { grid, maxGridSize = MAX_LADDER_GRID_SIZE, score } = options;
            const unpricedTrigger = unpricedTriggerLine(
                plan,
                UnpricedTriggerSurface.Ladder,
            );
            if (unpricedTrigger !== null) ui.warn(unpricedTrigger);
            printEdgePlausibilityNotes([
                edgePlausibilityNote({
                    rrRatio: score.rrRatio,
                    tradesPerDay: grid.slots,
                    winrate: fraction(score.winrate),
                }),
            ]);
            const gridSize = ladderGridSize(grid);
            const instrument = readInstrument(context.args.instrument);
            ui.muted(
                `  grid ${gridSize.toLocaleString('en-US')} raw ladders (limit ${maxGridSize.toLocaleString('en-US')})`,
            );
            const workWarning = ladderWorkWarning(gridSize, score.sims);
            if (workWarning !== null) ui.warn(workWarning);

            spinner = ui.spinner(`searching ${plan.label}`).start();
            const started = performance.now();
            const result = runLadderSearch(options);
            const elapsed = (performance.now() - started) / 1000;
            spinner.succeed(`searched ${plan.label} in ${elapsed.toFixed(1)}s`);

            ui.heading(plan.label);
            ui.muted(`  ${objectiveHeadingLine(objective)}`);
            ui.muted(
                `  cushion ${formatCurrency(score.cushion)} | drawdown ${plan.drawdown.kind} | target ${formatCurrency(plan.profitTarget)} | consistency ${describeShare(plan.evalConsistencyRule())} | min days ${plan.minTradingDays} | ${describeEvalWindow(plan, score.maxDays)}`,
            );
            ui.muted(
                `  grid ${formatCurrency(grid.lo)}-${formatCurrency(grid.max)} step ${formatCurrency(grid.step)} x${grid.slots} | ${score.sims} sims | stop ${describeStopRule(score.stopRule)} | commission ${formatCurrency(score.commission)} | ${describeLadderSizing(plan, score.positionSizing)}`,
            );
            ui.muted(
                `  ${result.gridSize} raw -> ${result.laddersScored} distinct (${result.droppedAliasCount} aliases removed) in ${elapsed.toFixed(1)}s\n`,
            );
            const unscorableLine = describeUnscorableLadders(result);
            if (unscorableLine !== null) ui.warn(unscorableLine);
            if (result.unscorableCount >= result.laddersScored) return;

            const contractLimit = evalContractLimit(
                plan.contractLimits,
                instrument.isMicro,
            );
            for (const { select, title } of ladderRankingsFor(objective)) {
                printTable(
                    title,
                    select(result),
                    contractLimit,
                    instrument.pointValue,
                );
            }

            ui.heading(
                `EFFICIENT FRONTIER (${result.frontier.length} non-dominated)`,
            );
            for (const frontierScore of result.frontier) {
                ui.muted(
                    `  ${frontierScore.ladder.join(' / ').padEnd(26)} ${frontierScore.expectedDaysToFunded.toFixed(1).padStart(6)}d +/- ${frontierScore.expectedDaysToFundedStandardError.toFixed(2)}  ${formatCurrency(frontierScore.costPerFunded).padStart(7)} +/- ${formatCurrency(frontierScore.costPerFundedStandardError, 2)}`,
                );
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export default command;

function assertSupportedLadderFlags(
    arguments_: LadderArguments,
): asserts arguments_ is LadderArguments &
    Partial<Record<UnsupportedLadderFlag, undefined>> {
    for (const flag of UNSUPPORTED_LADDER_FLAG_NAMES) {
        if (arguments_[flag] !== undefined) {
            throw new TypeError(unsupportedLadderFlagReason(flag));
        }
    }
}

function printTable(
    title: string,
    rows: readonly LadderScore[],
    contractLimit: null | number,
    pointValue: number,
): void {
    ui.heading(title);
    ui.muted(STANDARD_ERROR_LEGEND);
    const table = new TablePrinter(LADDER_TABLE_COLUMNS);
    table.printHeader();
    for (const score of rows) {
        table.printRow(ladderTableRow(score, contractLimit, pointValue));
    }
}

function proxyRanking(
    ranking: LadderRanking,
    objective: SizingObjective,
): LadderRanking {
    return {
        ...ranking,
        title: `${ranking.title} (eval-stage proxy for ${SIZING_OBJECTIVE_LABEL[objective]})`,
    };
}

function withLadderGridFlags<T>(action: () => T): T {
    try {
        return action();
    } catch (error) {
        if (error instanceof LadderGridError) {
            throw new TypeError(error.describe(LADDER_GRID_FLAGS), {
                cause: error,
            });
        }
        throw error;
    }
}
