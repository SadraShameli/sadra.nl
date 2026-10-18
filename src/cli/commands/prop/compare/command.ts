import { defineCommand } from 'citty';
import { z } from 'zod';

import {
    formatDaysToPass,
    groupByAvailabilityLabel,
    hasEvalPass,
    includeCallUpArgument,
    objectiveArgument,
    ObjectiveFlag,
    objectiveHeadingLine,
    planArguments,
    planResolver,
    pricedTriggerLines,
    printEdgePlausibilityNotes,
    readBankroll,
    readObjective,
    readPositiveInteger,
    readPositiveNumber,
    readScreenTime,
    type ScreenTime,
    screenTimeArguments,
    singlePathGranularityArgument,
    SortObjectiveConflict,
    type TableColumn,
    TablePrinter,
    tradingArguments,
    tradingEdgeNotes,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    formatCurrency,
    formatFiniteCurrency,
    formatOptionalPercent,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    CENTS_PER_DOLLAR,
    type Dollars,
    dollars,
    findFirm,
    FirmId,
    type Plan,
    points,
    type SimInputs,
    type SimOutputs,
    simulate,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { RankingSurface } from '~/lib/prop-calculator/advisor/actions';
import {
    COPY_SPLIT_NOISE_SIGMAS,
    type CopySplitResult,
    type CopySplitRow,
    CopySplitRowKind,
    type EnginePolicy,
    enginePolicySchema,
    runCopySplit,
} from '~/lib/prop-calculator/advisor/policy';
import {
    bankrollAttempts,
    bankrollNoPayout,
    type BankrollRiskFigures,
    type BatchLossPricing,
    BatchLossStatus,
    hasPositiveEvPerAttempt,
    netPerScreenHour,
    noPayoutProbabilityFromDistribution,
    priceBatchLoss,
    rankRuinFirst,
    type RuinFirstFallback,
} from '~/lib/prop-calculator/economics';

export enum CompareSortKey {
    Cost = 'cost',
    Cycle = 'cycle',
    Days = 'days',
    Hour = 'hour',
    Net = 'net',
    Pass = 'pass',
    RuinFirst = 'ruin-first',
    Spend = 'spend',
}

export interface CompareRanking {
    readonly objective: null | SizingObjective;
    readonly sort: CompareSortKey;
}

export interface CompareRankingArguments {
    bankroll?: string;
    objective?: string;
    sort?: string;
}

export type OrderedSortKey = Exclude<CompareSortKey, CompareSortKey.RuinFirst>;

export interface RankableRow {
    readonly batchLoss?: BatchLossPricing | null;
    readonly out: RankedMetrics;
}

export type RankedMetrics = Pick<
    SimOutputs,
    | 'costPerFundedAccount'
    | 'daysToPassP50'
    | 'evalPassProbability'
    | 'expectedMonthlyNet'
    | 'expectedNet'
    | 'expectedNetPerAttempt'
    | 'expectedTotalCost'
>;

export interface RankedRows<T> {
    readonly fallback: null | RuinFirstFallback;
    readonly note: null | string;
    readonly rows: T[];
}

export interface TopLimitArguments {
    top?: string;
}

export const SORT_KEYS: readonly CompareSortKey[] =
    Object.values(CompareSortKey);

const ABSENT_PRICING: BatchLossPricing = { status: BatchLossStatus.NoAttempt };

const UNIT_SCREEN_TIME: ScreenTime = {
    accountsPerSession: 1,
    sessionHoursPerDay: 1,
};

const command = defineCommand({
    args: {
        ...planArguments,
        ...tradingArguments,
        ...singlePathGranularityArgument,
        ...includeCallUpArgument,
        ...screenTimeArguments,
        ...objectiveArgument,
        bankroll: {
            description:
                'Bankroll in account currency: adds P(no payout, bankroll) and P(batch < 0) columns priced at the attempts it affords, and is needed by --objective ruin-first',
            type: 'string',
        },
        sort: {
            description:
                'Rank by: net (monthly net, the default), cycle (expected net of one eval-to-funded cycle), ruin-first (needs --bankroll: plans with EV per attempt above zero by lower P(batch net < 0), then monthly net; non-positive EV plans last), cost (expected cost per funded account, eval pass rate included), spend (expected spend per trial), pass (eval pass), days (median days to pass the eval) or hour (monthly net per screen hour; needs --hours-per-day and --accounts-per-session). Mutually exclusive with --objective',
            options: [...SORT_KEYS],
            type: 'enum',
        },
        splits: {
            description:
                'Account counts to split --total-risk across, comma separated (e.g. 1,2,10): one row per split on the same seed for one plan, ranked by the objective, with the whole group as the unit (needs --total-risk, one plan and no --copy-accounts)',
            type: 'string',
        },
        top: {
            description:
                'Keep only the best N plans after ranking, for your screen time (a whole number >= 1; needs --hours-per-day and --accounts-per-session). Does not apply to --splits',
            type: 'string',
        },
        'total-risk': {
            description:
                'Total risk per trade across the copied accounts (e.g. 2000): each split puts total / accounts on every account, under the same engine policy (needs --splits)',
            type: 'string',
        },
    },
    meta: {
        description:
            'Run every matching plan on identical inputs and rank them. Narrow with --firm and --variant.',
        name: 'compare',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const { excluded, plans } = planResolver.resolveRankable(
                context.args,
                context.args['include-callup'],
            );
            const inputs = TradingInputs.parse(context.args);
            const ranking = resolveCompareRanking(context.args);
            const { sort } = ranking;
            const screenTime = readScreenTime(context.args);
            requireScreenTimeForSort(sort, screenTime);
            const top = readTopLimit(context.args, screenTime);
            const bankroll = readBankroll(context.args.bankroll);
            const splitRequest = readSplitRequest(context.args);
            if (splitRequest !== null) {
                if (top !== null) {
                    throw new TypeError(
                        '--top ranks plans: it does not apply to --splits, which compares splits of one plan',
                    );
                }
                runSplitComparison(
                    planResolver.resolveOne(context.args),
                    inputs,
                    ranking,
                    splitRequest,
                );
                return;
            }

            spinner = ui
                .spinner(
                    `simulating ${plans.length} plan(s) x ${inputs.trials} trials`,
                )
                .start();
            const simulated = plans.map((plan) => {
                const simInputs = inputs.toSimInputs(plan);
                const out = simulate(simInputs);
                const batchLoss =
                    bankroll === null
                        ? null
                        : priceBatchLoss(out, bankroll, inputs.seed);
                return {
                    batchLoss,
                    figures:
                        bankroll === null || batchLoss === null
                            ? null
                            : bankrollFiguresOf(out, bankroll, batchLoss),
                    out,
                    plan,
                    simInputs,
                };
            });
            spinner.succeed(
                `simulated ${plans.length} plan(s) x ${inputs.trials} trials`,
            );

            const ranked = rankRows(simulated, sort, screenTime, bankroll);
            const rows = top === null ? ranked.rows : ranked.rows.slice(0, top);

            ui.heading(
                `${plans.length} plan(s) · ${(inputs.winrate * 100).toFixed(0)}% WR · 1:${inputs.rrRatio} · ${inputs.fundedHorizonDays} funded days · sorted by ${sort}`,
            );
            ui.muted(`  ${compareRankingHeadingLine(ranking)}`);
            for (const { plan, simInputs } of rows) {
                for (const line of pricedTriggerLines(simInputs, plan.label)) {
                    ui.muted(line);
                }
            }
            printEdgePlausibilityNotes(
                tradingEdgeNotes({
                    fundedRrRatio: inputs.fundedRrRatio,
                    fundedTradesPerDay: inputs.fundedTradesPerDay,
                    rrRatio: inputs.rrRatio,
                    tradesPerDay: inputs.tradesPerDay,
                    winrate: inputs.winrate,
                }),
            );
            const table = new TablePrinter(
                compareColumns(
                    inputs.copyAccounts,
                    screenTime,
                    bankroll !== null,
                ),
            );
            table.printHeader();
            for (const { figures, out, plan } of rows) {
                table.printRow(compareRow(plan, out, screenTime, figures));
            }

            const basisLine = describeColumnBasis(inputs.copyAccounts);
            if (basisLine !== null) ui.muted(basisLine);
            for (const line of describeEconomicsColumns(screenTime)) {
                ui.muted(line);
            }
            if (bankroll !== null) {
                ui.muted(BANKROLL_COLUMNS_NOTE);
            }
            if (top !== null) {
                ui.muted(
                    `showing the top ${rows.length} of ${ranked.rows.length} plan(s) for your hours, after ranking by ${sort}`,
                );
            }
            if (sort === CompareSortKey.RuinFirst && ranked.fallback === null) {
                for (const line of nonPositiveEvPlanLines(rows)) {
                    ui.muted(line);
                }
            }

            const excludedLine = describeExcludedPlans(excluded);
            if (excludedLine !== null) ui.muted(excludedLine);

            const best = rows[0];
            if (best) {
                if (ranked.note === null) {
                    ui.success(
                        `best by ${sort}: ${best.plan.label} (${best.plan.id.firm})`,
                    );
                } else {
                    ui.warn(ranked.note);
                }
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export default command;

const FIRM_COLUMN_WIDTH = Math.max(
    ...Object.values(FirmId).map((id) => id.length),
);

interface SplitArguments {
    splits?: string;
    'total-risk'?: string;
}

interface SplitRequest {
    readonly splits: number[];
    readonly totalRisk: number;
}

export function compareColumns(
    copyAccounts: number,
    screenTime: null | ScreenTime = null,
    hasBankroll = false,
): TableColumn[] {
    const totalled = (label: string, width: number): TableColumn => {
        const text = copyAccounts > 1 ? `${label} x${copyAccounts}` : label;
        return { label: text, width: Math.max(width, text.length) };
    };
    const columns: TableColumn[] = [
        { align: 'left', label: 'firm', width: FIRM_COLUMN_WIDTH },
        { align: 'left', label: 'plan', width: 44 },
        { label: 'eval pass', width: 9 },
        { label: 'survive', width: 7 },
        { label: 'days', width: 6 },
        { label: '$/funded', width: 9 },
        totalled('spend', 8),
        totalled('payout', 9),
        totalled('monthly', 9),
        totalled('cycle net', 9),
        { label: 'ROI', width: 7 },
        { label: 'bustF', width: 7 },
        { label: 'P(no payout)', width: 12 },
    ];
    if (screenTime !== null) {
        columns.push({ label: '$/screen hour', width: 13 });
    }
    if (hasBankroll) {
        columns.push(
            { label: 'P(no payout, bankroll)', width: 22 },
            { label: 'P(batch < 0)', width: 12 },
        );
    }
    return columns;
}

export function compareOutputs(
    a: RankedMetrics,
    b: RankedMetrics,
    sort: OrderedSortKey,
    screenTime: null | ScreenTime = null,
): number {
    return compareRows({ out: a }, { out: b }, sort, screenTime);
}

export function compareRankingHeadingLine(ranking: CompareRanking): string {
    return ranking.objective === null
        ? `objective: none. Rows are sorted by ${ranking.sort}, which is not an objective ranking.`
        : objectiveHeadingLine(ranking.objective);
}

export function compareRow(
    plan: Plan,
    out: SimOutputs,
    screenTime: null | ScreenTime = null,
    bankroll: BankrollRiskFigures | null = null,
): string[] {
    return [
        plan.id.firm,
        plan.label,
        ...compareRowCells(out, screenTime, bankroll),
    ];
}

export function compareRowCells(
    out: SimOutputs,
    screenTime: null | ScreenTime = null,
    bankroll: BankrollRiskFigures | null = null,
): string[] {
    const cells = [
        formatPercent(out.evalPassProbability),
        formatPercent(out.fundedSurvivalProbability),
        formatDaysToPass(out, out.daysToPassP50, 0),
        formatFiniteCurrency(out.costPerFundedAccount),
        formatCurrency(out.expectedTotalCost),
        formatCurrency(out.expectedGrossPayout),
        formatCurrency(out.expectedMonthlyNet),
        formatCurrency(out.expectedNet),
        formatOptionalPercent(out.roiOnCost.value),
        formatPercent(out.fundedBustProbability),
        formatNoPayoutProbability(out),
    ];
    if (screenTime !== null) {
        cells.push(formatScreenHour(out.expectedMonthlyNet, screenTime));
    }
    if (bankroll !== null) {
        cells.push(
            formatOptionalProbability(bankroll.noPayoutProbability),
            formatOptionalProbability(bankroll.lossProbability),
        );
    }
    return cells;
}

export function describeColumnBasis(copyAccounts: number): null | string {
    return copyAccounts > 1
        ? `spend, payout, monthly and cycle net total all ${copyAccounts} copies; eval pass, survive, days, $/funded, ROI, bustF and P(no payout) are per account`
        : null;
}

export function describeEconomicsColumns(
    screenTime: null | ScreenTime,
): string[] {
    const lines = [
        'P(no payout) = share of trials that reached funded and took no payout within the funded horizon',
    ];
    if (screenTime !== null) {
        lines.push(
            `$/screen hour = monthly net x ${screenTime.accountsPerSession} accounts per session / (${TRADING_DAYS_PER_MONTH} trading days x ${screenTime.sessionHoursPerDay} h per day); a copy group counts as one account`,
        );
    }
    return lines;
}

export function describeExcludedPlans(
    excluded: readonly Plan[],
): null | string {
    if (excluded.length === 0) return null;
    const parts: string[] = [];
    for (const [label, plans] of groupByAvailabilityLabel(excluded)) {
        parts.push(
            `${plans.length} ${label} plan(s): ${plans.map((plan) => plan.label).join(', ')}`,
        );
    }
    return `excluded ${parts.join('; ')} (pass --include-callup to rank them)`;
}

export function nonPositiveEvPlanLines(
    rows: readonly {
        readonly out: RankedMetrics;
        readonly plan: Pick<Plan, 'label'>;
    }[],
): string[] {
    const labels = rows
        .filter((row) => !hasPositiveEvPerAttempt(row.out))
        .map((row) => row.plan.label);
    return labels.length === 0
        ? []
        : [
              `listed last, EV per attempt is not above zero, so ruin-first does not rank them: ${labels.join(', ')}`,
          ];
}

export function rankRows<T extends RankableRow>(
    rows: readonly T[],
    sort: CompareSortKey,
    screenTime: null | ScreenTime = null,
    bankroll: Dollars | null = null,
): RankedRows<T> {
    if (sort === CompareSortKey.RuinFirst) {
        return rankRuinFirst(rows, {
            bankroll,
            batchLoss: (row) => row.batchLoss ?? ABSENT_PRICING,
        });
    }
    return {
        fallback: null,
        note: null,
        rows: rows.toSorted((a, b) => compareRows(a, b, sort, screenTime)),
    };
}

export function readTopLimit(
    arguments_: TopLimitArguments,
    screenTime: null | ScreenTime,
): null | number {
    if (arguments_.top === undefined) return null;
    const top = readPositiveInteger(arguments_.top, 'top');
    if (screenTime !== null) return top;
    throw new TypeError(
        '--top needs --hours-per-day and --accounts-per-session: it keeps the best N plans for your screen time',
    );
}

export function requireScreenTimeForSort(
    sort: CompareSortKey,
    screenTime: null | ScreenTime,
): void {
    if (screenTime === null && sort === CompareSortKey.Hour) {
        throw new TypeError(
            '--sort hour needs --hours-per-day and --accounts-per-session',
        );
    }
}

export function resolveCompareRanking(
    arguments_: CompareRankingArguments,
): CompareRanking {
    const { objective: objectiveFlag, sort: sortFlag } = arguments_;
    if (objectiveFlag !== undefined && sortFlag !== undefined) {
        throw new SortObjectiveConflict(
            '--sort and --objective are mutually exclusive: --objective picks the ranking key itself (monthly is net, cycle is cycle, ruin-first is ruin-first)',
        );
    }
    if (sortFlag === undefined) {
        const objective = readObjective(arguments_, RankingSurface.Compare);
        return { objective, sort: sortKeyOf(objective) };
    }
    const sort = z.enum(CompareSortKey).parse(sortFlag);
    const sortObjective = objectiveFlagOf(sort);
    return {
        objective:
            sortObjective === null
                ? null
                : readObjective(
                      {
                          bankroll: arguments_.bankroll,
                          objective: sortObjective,
                      },
                      RankingSurface.Compare,
                  ),
        sort,
    };
}

export function splitTableRow(
    row: CopySplitRow,
    isIndistinguishable: boolean,
): string[] {
    if (row.kind === CopySplitRowKind.Refused) {
        return [
            String(row.splitCount),
            formatCurrency(row.riskPerAccount, 2),
            'refused',
            row.reason,
        ];
    }
    const { placement } = row;
    return [
        String(row.splitCount),
        formatCurrency(row.riskPerAccount, 2),
        placement === null ? NOT_APPLICABLE : String(placement.contracts),
        placement === null
            ? NOT_APPLICABLE
            : formatCurrency(placement.placedRiskPerAccount, 2),
        placement === null
            ? NOT_APPLICABLE
            : formatCurrency(
                  placement.placedRiskPerAccount * row.splitCount,
                  2,
              ),
        formatPercent(row.passRate),
        formatDaysToPass(
            { evalPassProbability: row.passRate },
            row.daysToPassP50,
            0,
        ),
        formatCurrency(row.totalFees),
        formatUncertainCurrency(row.totalMonthlyNet),
        formatUncertainCurrency(row.cycleNet),
        row.netPerFeeDollar === null
            ? NOT_APPLICABLE
            : row.netPerFeeDollar.toFixed(2),
        isIndistinguishable ? 'within noise' : '',
    ];
}

function readSplitRequest(arguments_: SplitArguments): null | SplitRequest {
    const totalRisk = arguments_['total-risk'];
    const splits = arguments_.splits;
    if (totalRisk === undefined && splits === undefined) return null;
    if (totalRisk === undefined || splits === undefined) {
        throw new TypeError(
            '--total-risk and --splits go together: pass both or neither',
        );
    }
    return {
        splits: splits
            .split(',')
            .map((part) => readPositiveInteger(part.trim(), 'splits')),
        totalRisk: readPositiveNumber(totalRisk, 'total-risk'),
    };
}

const BANKROLL_COLUMNS_NOTE =
    'P(no payout, bankroll) and P(batch < 0) are priced at the attempts the bankroll affords (bankroll / cost per attempt), per plan, on the shared seed';

export const SPLIT_COLUMNS: readonly TableColumn[] = [
    { label: 'accounts', width: 8 },
    { label: 'risk/account', width: 12 },
    { label: 'eval contracts', width: 14 },
    { label: 'placed/account', width: 14 },
    { label: 'placed group', width: 12 },
    { label: 'eval pass', width: 9 },
    { label: 'days P50', width: 8 },
    { label: 'total fees', width: 10 },
    { label: 'monthly net (group)', width: 24 },
    { label: 'cycle net (group)', width: 18 },
    { label: 'net/fee $', width: 9 },
    { align: 'left', label: 'vs best', width: 12 },
];

export function bankrollFiguresOf(
    out: SimOutputs,
    bankroll: Dollars,
    batchLoss: BatchLossPricing,
): BankrollRiskFigures {
    const attempts = bankrollAttempts(out, bankroll);
    return {
        lossProbability:
            batchLoss.status === BatchLossStatus.Priced
                ? batchLoss.probability
                : null,
        noPayoutProbability:
            attempts === null || attempts < 1
                ? null
                : bankrollNoPayout(out, attempts),
    };
}

function ascending(a: number, b: number): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function assertSplitInputs(
    inputs: TradingInputs,
    ranking: CompareRanking,
): SizingObjective {
    if (inputs.copyAccounts !== 1) {
        throw new TypeError(
            '--copy-accounts is set by --splits: leave it at 1 when comparing splits',
        );
    }
    if (inputs.ladder !== null) {
        throw new TypeError(
            '--ladder sizes each trade by rung, not by --total-risk: drop --ladder to compare splits',
        );
    }
    if (ranking.objective === null) {
        throw new TypeError(
            `--sort ${ranking.sort} ranks plans: with --total-risk and --splits use --objective monthly or cycle`,
        );
    }
    return ranking.objective;
}

function compareOptionalAscending(a: null | number, b: null | number): number {
    if (a === null || b === null) {
        return a === b ? 0 : a === null ? 1 : -1;
    }
    return ascending(a, b);
}

function compareRows(
    a: RankableRow,
    b: RankableRow,
    sort: OrderedSortKey,
    screenTime: null | ScreenTime = null,
): number {
    switch (sort) {
        case CompareSortKey.Cost: {
            return ascending(
                a.out.costPerFundedAccount,
                b.out.costPerFundedAccount,
            );
        }
        case CompareSortKey.Cycle: {
            return ascending(b.out.expectedNet, a.out.expectedNet);
        }
        case CompareSortKey.Days: {
            const isAPassed = hasEvalPass(a.out);
            const isBPassed = hasEvalPass(b.out);
            if (isAPassed && isBPassed) {
                return ascending(a.out.daysToPassP50, b.out.daysToPassP50);
            }
            if (isAPassed === isBPassed) return 0;
            return isAPassed ? -1 : 1;
        }
        case CompareSortKey.Hour: {
            return compareOptionalAscending(
                negated(screenHourValue(a.out, screenTime)),
                negated(screenHourValue(b.out, screenTime)),
            );
        }
        case CompareSortKey.Net: {
            return ascending(
                b.out.expectedMonthlyNet,
                a.out.expectedMonthlyNet,
            );
        }
        case CompareSortKey.Pass: {
            return ascending(
                b.out.evalPassProbability,
                a.out.evalPassProbability,
            );
        }
        case CompareSortKey.Spend: {
            return ascending(a.out.expectedTotalCost, b.out.expectedTotalCost);
        }
    }
}

function formatNoPayoutProbability(
    out: Pick<SimOutputs, 'fundedPayoutCountDistribution'>,
): string {
    const value = noPayoutProbabilityFromDistribution(
        out.fundedPayoutCountDistribution,
    );
    return value === null ? NOT_APPLICABLE : formatPercent(value);
}

function formatOptionalProbability(value: null | number): string {
    return value === null ? NOT_APPLICABLE : formatPercent(value);
}

function formatScreenHour(
    expectedMonthlyNet: number,
    screenTime: ScreenTime,
): string {
    const value = screenHourValue({ expectedMonthlyNet }, screenTime);
    return value === null ? NOT_APPLICABLE : formatCurrency(value);
}

function formatUncertainCurrency(value: {
    readonly standardError: null | number;
    readonly value: number;
}): string {
    return value.standardError === null
        ? formatCurrency(value.value)
        : `${formatCurrency(value.value)} (SE ${formatCurrency(value.standardError)})`;
}

function negated(value: null | number): null | number {
    return value === null ? null : -value;
}

function objectiveFlagOf(sort: CompareSortKey): null | ObjectiveFlag {
    switch (sort) {
        case CompareSortKey.Cost:
        case CompareSortKey.Days:
        case CompareSortKey.Hour:
        case CompareSortKey.Pass:
        case CompareSortKey.Spend: {
            return null;
        }
        case CompareSortKey.Cycle: {
            return ObjectiveFlag.CycleCash;
        }
        case CompareSortKey.Net: {
            return ObjectiveFlag.MonthlyNet;
        }
        case CompareSortKey.RuinFirst: {
            return ObjectiveFlag.RuinFirst;
        }
    }
}

function printSplitComparison(
    plan: Plan,
    inputs: TradingInputs,
    request: SplitRequest,
    result: CopySplitResult,
    base: SimInputs,
): void {
    ui.heading(
        `${plan.label} · total risk ${formatCurrency(request.totalRisk)} per trade · splits ${request.splits.join(', ')} · seed ${inputs.seed} · ${result.trialsPerSplit} trials per split`,
    );
    ui.muted(`  ${objectiveHeadingLine(result.objective)}`);
    for (const line of result.basisLines) {
        ui.muted(`  ${line}`);
    }
    for (const line of pricedTriggerLines(base)) {
        ui.muted(line);
    }
    if (result.note !== null) ui.warn(result.note);
    const table = new TablePrinter([...SPLIT_COLUMNS]);
    table.printHeader();
    const indistinguishable = new Set(result.indistinguishableSplits);
    for (const row of result.rows) {
        table.printRow(
            splitTableRow(row, indistinguishable.has(row.splitCount)),
        );
    }
    ui.muted(SPLIT_BASIS_NOTE);
    if (indistinguishable.size > 0) {
        ui.muted(SPLIT_NOISE_NOTE);
    }
}

function runSplitComparison(
    plan: Plan,
    inputs: TradingInputs,
    ranking: CompareRanking,
    request: SplitRequest,
): void {
    const objective = assertSplitInputs(inputs, ranking);
    const base = inputs.toSimInputs(plan);
    const result = runCopySplit(
        base,
        splitEnginePolicy(plan, inputs),
        request.totalRisk,
        request.splits,
        objective,
    );
    printSplitComparison(plan, inputs, request, result, base);
}

function screenHourValue(
    out: Pick<SimOutputs, 'expectedMonthlyNet'>,
    screenTime: null | ScreenTime,
): null | number {
    const { accountsPerSession, sessionHoursPerDay } =
        screenTime ?? UNIT_SCREEN_TIME;
    const result = netPerScreenHour({
        accountsPerSession,
        expectedMonthlyNet: dollars(out.expectedMonthlyNet),
        sessionHoursPerDay,
    });
    return result.value === null ? null : result.value.value;
}

function sortKeyOf(objective: SizingObjective): CompareSortKey {
    switch (objective) {
        case SizingObjective.CycleCash: {
            return CompareSortKey.Cycle;
        }
        case SizingObjective.MonthlyNet: {
            return CompareSortKey.Net;
        }
        case SizingObjective.RuinFirst: {
            return CompareSortKey.RuinFirst;
        }
    }
}

function splitEnginePolicy(plan: Plan, inputs: TradingInputs): EnginePolicy {
    const hasStop =
        inputs.instrument !== undefined && inputs.stopPoints !== undefined;
    const { policy } = buildEnginePolicy({
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        fundedHorizonDays: inputs.fundedHorizonDays,
        measuredRebuyLag:
            inputs.rebuyLagDays > 0
                ? { days: inputs.rebuyLagDays, samples: 1 }
                : null,
        plan,
        positionSizing: hasStop
            ? {
                  instrument: inputs.instrument,
                  stopPoints: points(inputs.stopPoints),
              }
            : null,
        rulebook: DEFAULT_RULEBOOK,
    });
    return enginePolicySchema.parse({
        ...policy,
        payoutRequestOverride:
            inputs.payoutRequestSize ??
            DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR,
        retainedCushionRequest:
            inputs.minRetainedCushion > 0
                ? inputs.minRetainedCushion
                : policy.retainedCushionRequest,
    });
}

const SPLIT_BASIS_NOTE =
    'monthly and cycle net, total fees and net/fee $ are for the whole group of accounts (cycle net / total fees); eval pass and days P50 are per account; eval contracts and placed risk are the eval-phase placement at the eval contract limit; every split runs the same seed and the same trial count';

const SPLIT_NOISE_NOTE = `rows marked within noise differ from the best row by less than ${COPY_SPLIT_NOISE_SIGMAS} combined standard errors: do not read their order as a ranking`;
