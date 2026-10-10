import { defineCommand } from 'citty';
import { z } from 'zod';

import {
    type EdgeModelArguments,
    edgeModelArguments,
    liveTransferHazardArgument,
    liveTransferSweepLines,
    objectiveArgument,
    objectiveHeadingLine,
    ObjectiveNotApplicable,
    payoutRequestPolicyArgument,
    planArguments,
    planResolver,
    pricedTriggerLines,
    printEdgePlausibilityNotes,
    readEdgeModelSpec,
    readLadder,
    readNumberList,
    readObjective,
    RUIN_FIRST_NOT_APPLICABLE_MESSAGE,
    singlePathGranularityArgument,
    SortObjectiveConflict,
    TablePrinter,
    tradingArguments,
    tradingEdgeNotes,
    TradingInputs,
    unrestatedLines,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type DayStopRule,
    edgeModelFromSpec,
    EdgeModelKind,
    type EdgeModelSpec,
    LiveTransferContinuationKind,
    PayoutRequestPolicy,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
    type SimInputs,
    simulate,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { RankingSurface } from '~/lib/prop-calculator/advisor/actions';
import {
    TAKE_PROFIT_WHAT_IF_LABEL,
    takeProfitCandidateInputs,
    takeProfitRows,
    type TakeProfitWhatIfRow,
} from '~/lib/prop-calculator/economics';
import {
    buildFundedCandidates,
    type BuiltFundedCandidates,
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    DEFAULT_FUNDED_PERCENT_CANDIDATES,
    flatsBelowOneContractNote,
    FUNDED_ROW_HEADERS,
    FUNDED_SORT_KEYS,
    type FundedCandidate,
    FundedCandidateBuildKind,
    FundedCandidateRefusal,
    type FundedCandidateRefusalDetail,
    fundedFlatCandidateSchema,
    fundedPercentCandidateSchema,
    fundedPlacementNotes,
    fundedRowCells,
    fundedSortDescription,
    FundedSortKey,
    fundedSortOfObjective,
    fundedSurvivorsNote,
    ladderRungsBelowOneContractText,
    objectiveOfFundedSort,
    runFundedCandidateSweep,
    sortFundedResults,
} from '~/lib/prop-calculator/optimize';
import { liveTransferContinuationNotes } from '~/lib/prop-calculator/simulator';

export interface FundedCandidateArguments {
    flat: string;
    'funded-ladder'?: string;
    percent?: string;
}

export interface FundedSortArguments {
    objective?: string;
    sort: string;
}

export interface TakeProfitWhatIfArguments extends EdgeModelArguments {
    'rr-candidates'?: string;
}

export interface TakeProfitWhatIfRequest {
    readonly edgeSpec: EdgeModelSpec;
    readonly rrCandidates: number[];
}

export class TakeProfitWhatIfError extends Error {}

const DEFAULT_PERCENT_CANDIDATES = DEFAULT_FUNDED_PERCENT_CANDIDATES.join(',');

const MIN_POLICY_COLUMN_WIDTH = 16;

const FUNDED_VALUE_COLUMN_WIDTHS: readonly number[] = [14, 15, 13, 18, 18, 14];

const command = defineCommand({
    args: {
        ...planArguments,
        ...tradingArguments,
        ...singlePathGranularityArgument,
        ...edgeModelArguments,
        ...payoutRequestPolicyArgument,
        ...objectiveArgument,
        ...liveTransferHazardArgument,
        flat: {
            default: DEFAULT_FUNDED_FLAT_CANDIDATES.join(','),
            description:
                "Comma-separated flat $/trade funded-phase candidates. Pass '' to skip flat candidates.",
            type: 'string',
        },
        'funded-ladder': {
            description:
                'Funded-phase risk ladder to test as one extra candidate, comma separated (e.g. 400,600,800,200) -- unlike --ladder (eval-only), this sizes trade 1/2/3/4 of each funded-phase day instead of a flat $/trade or %-of-cushion amount. With --stop-points each rung is placed in whole contracts like the flat and percent rows, and a rung below one contract is refused. Omit to test only flat/percent, as before.',
            type: 'string',
        },
        percent: {
            description: `Comma-separated percent-of-cushion funded-phase candidates, placed in whole contracts at --stop-points (required for --percent). Default ${DEFAULT_PERCENT_CANDIDATES} when --stop-points is given, none otherwise. Pass '' to skip percent candidates.`,
            type: 'string',
        },
        'rr-candidates': {
            description:
                'Comma-separated reward-to-risk ratios to rank as a take-profit what-if instead of the flat/percent/ladder sweep above: for each rr, --edge-model drift derives its own win rate from --winrate fitted at --edge-anchor-rr (default --rr) and simulates that rr in both the eval and funded phases (fundedRrRatio = rr, so no second win rate is needed), labelled a what-if that differs from your fixed 1:2. Requires --edge-model drift (a fixed win rate cannot rank take-profit multiples) and needs --funded-rr to equal --rr, if given at all (a different funded rr with its own win rate is not modeled until QV-4 is answered)',
            type: 'string',
        },
        sort: {
            default: FundedSortKey.Monthly,
            description: `monthly (default): steady-state expected net per month for one account slot, or for the --copy-accounts slots together when that is above 1 ((per-run net + horizon credit) x ${TRADING_DAYS_PER_MONTH} / expected days per run, where the days per run include --rebuy-lag-days of empty slot time per eval attempt and the slot is refilled after every failed eval, funded bust or horizon end; the 'monthly ex-credit' column leaves the credit out) -- the only key valid for ranking plans. cycle: expected net from THIS ONE simulated run only (whatever --eval-days/--funded-days bound it to) -- use this for a short, fixed-horizon goal you do not intend to repeat indefinitely. With --copy-accounts above 1, the per-cycle net, horizon credit and monthly figures are summed over the copy-traded account slots (one slot x --copy-accounts).`,
            options: [...FUNDED_SORT_KEYS],
            type: 'enum',
        },
    },
    meta: {
        description:
            'Sweep flat-$, percent-of-cushion, and (with --funded-ladder) a funded-phase ladder policy (--firm, --variant), and rank by monthly (steady-state, the only key valid for ranking plans) or cycle (this-run-only) expected cash extraction.',
        name: 'funded',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            printEdgePlausibilityNotes(
                tradingEdgeNotes({
                    fundedRrRatio: inputs.fundedRrRatio,
                    fundedTradesPerDay: inputs.fundedTradesPerDay,
                    rrRatio: inputs.rrRatio,
                    tradesPerDay: inputs.tradesPerDay,
                    winrate: inputs.winrate,
                }),
            );
            const base: SimInputs = {
                ...inputs.toSimInputs(plan),
                payoutRequestPolicy: z
                    .enum(PayoutRequestPolicy)
                    .parse(context.args['payout-policy']),
            };
            const sort = resolveFundedSort(
                context.args,
                context.rawArgs.some(isSortFlag),
            );
            const takeProfitRequest = readTakeProfitWhatIfRequest(
                context.args,
                inputs,
            );
            if (takeProfitRequest !== null) {
                printTakeProfitWhatIf(plan, base, sort, takeProfitRequest);
                return;
            }
            const positionSizing = resolvePositionSizing(
                base.instrument,
                base.stopPoints,
            );
            const build = readFundedCandidateBuild(
                context.args,
                inputs.dayStop,
                positionSizing,
                plan,
            );

            spinner = ui
                .spinner(
                    fundedSweepProgress(
                        plan.label,
                        build.candidates.length,
                        inputs.trials,
                    ),
                )
                .start();

            const rows = runFundedCandidateSweep(base, build.candidates, sort);

            spinner.succeed(fundedSweepSummary(plan.label, rows.length));

            ui.heading(plan.label);
            ui.muted(`  ${objectiveHeadingLine(objectiveOfFundedSort(sort))}`);
            printLiveTransferLines(
                plan,
                base,
                rows[0]?.out.liveTransferContinuation,
            );
            for (const note of fundedSizingNotes(
                context.args,
                build,
                positionSizing,
                plan,
            )) {
                ui.note(note);
            }
            ui.muted(fundedSortDescription(sort, base));
            ui.muted(fundedSurvivorsNote(inputs.trials));

            const policyColumnWidth = Math.max(
                MIN_POLICY_COLUMN_WIDTH,
                ...rows.map((row) => row.candidate.label.length),
            );
            const table = new TablePrinter(
                FUNDED_ROW_HEADERS.map((label, index) => ({
                    ...(index === 0 && { align: 'left' as const }),
                    label,
                    width:
                        index === 0
                            ? policyColumnWidth
                            : (FUNDED_VALUE_COLUMN_WIDTHS[index - 1] ??
                              label.length),
                })),
            );
            table.printHeader();
            for (const row of rows) {
                table.printRow(
                    fundedRowCells(row.candidate.label, row.out, inputs.trials),
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

export function fundedSweepProgress(
    planLabel: string,
    policyCount: number,
    trials: number,
): string {
    return `${fundedSweepSummary(planLabel, policyCount)}, ${trials} trials each`;
}

export function fundedSweepSummary(
    planLabel: string,
    policyCount: number,
): string {
    return `${planLabel}: ${policyCount} funded policies`;
}

export function printTakeProfitWhatIf(
    plan: Plan,
    base: SimInputs,
    sort: FundedSortKey,
    request: TakeProfitWhatIfRequest,
): void {
    const edge = edgeModelFromSpec(request.edgeSpec);
    const candidateInputs = takeProfitCandidateInputs(
        base,
        edge,
        request.rrCandidates,
    );
    const outputs = candidateInputs.map((candidateInput) =>
        simulate(candidateInput),
    );
    const rows = sortFundedResults(
        takeProfitRows(candidateInputs, outputs),
        sort,
    );

    ui.heading(plan.label);
    ui.muted(`  ${objectiveHeadingLine(objectiveOfFundedSort(sort))}`);
    printLiveTransferLines(plan, base, outputs[0]?.liveTransferContinuation);
    ui.warn(TAKE_PROFIT_WHAT_IF_LABEL);
    ui.muted(fundedSortDescription(sort, base));

    const table = new TablePrinter([
        { align: 'left', label: 'take-profit (rr)', width: 17 },
        { label: 'derived win rate', width: 17 },
        { label: 'pass per attempt', width: 17 },
        { label: 'days to pass', width: 13 },
        { label: 'per-cycle net', width: 14 },
        { label: 'monthly net', width: 13 },
    ]);
    table.printHeader();
    for (const row of rows) {
        table.printRow(takeProfitRowCells(row));
    }
}

export function readFundedCandidates(
    arguments_: FundedCandidateArguments,
    stopRule: DayStopRule,
    positionSizing: null | PositionSizingConfig = null,
    plan: null | Plan = null,
): FundedCandidate[] {
    return readFundedCandidateBuild(arguments_, stopRule, positionSizing, plan)
        .candidates;
}

export function readTakeProfitWhatIfRequest(
    arguments_: TakeProfitWhatIfArguments,
    inputs: TradingInputs,
): null | TakeProfitWhatIfRequest {
    const raw = arguments_['rr-candidates'];
    if (raw === undefined) return null;
    if (
        inputs.fundedRrRatio !== undefined &&
        inputs.fundedRrRatio !== inputs.rrRatio
    ) {
        throw new TakeProfitWhatIfError(
            'a different funded rr with its own win rate is not modeled until QV-4 is answered (PT-64b)',
        );
    }
    const edgeSpec = readEdgeModelSpec(arguments_, inputs);
    if (edgeSpec.kind === EdgeModelKind.Fixed) {
        throw new TakeProfitWhatIfError(
            'a fixed win rate cannot rank take-profit multiples: pass --edge-model drift',
        );
    }
    const rrCandidates = readNumberList(
        raw,
        'rr-candidates',
        z.number().positive(),
        'a reward-to-risk ratio > 0',
    );
    return { edgeSpec, rrCandidates };
}

export function resolveFundedSort(
    arguments_: FundedSortArguments,
    isSortExplicit: boolean,
): FundedSortKey {
    const sort = z.enum(FundedSortKey).parse(arguments_.sort);
    if (arguments_.objective === undefined) return sort;
    const objectiveSort = sortOfObjective(
        readObjective(arguments_, RankingSurface.FundedRiskSweep),
    );
    if (isSortExplicit && sort !== objectiveSort) {
        throw new SortObjectiveConflict(
            `--sort ${sort} and --objective ${arguments_.objective} rank differently: --objective is an alias over --sort, so pass only one`,
        );
    }
    return objectiveSort;
}

function fundedCandidateRefusalMessage(
    refusal: FundedCandidateRefusalDetail,
    arguments_: FundedCandidateArguments,
    positionSizing: null | PositionSizingConfig,
): string {
    switch (refusal.kind) {
        case FundedCandidateRefusal.InvalidLists: {
            return `Invalid funded candidates: ${refusal.issues}`;
        }
        case FundedCandidateRefusal.LadderRungBelowOneContract: {
            return `Invalid --funded-ladder "${refusal.ladder.join(',')}": ${ladderRungsBelowOneContractText(refusal.rungsBelowOneContract, refusal.positionSizing)}`;
        }
        case FundedCandidateRefusal.NoCandidates: {
            const belowOneContract = flatsBelowOneContractNote(
                refusal.flatsBelowOneContract,
                positionSizing,
            );
            return `No funded policies to test: give at least one of --flat, --percent or --funded-ladder${belowOneContract === null ? '' : `. ${belowOneContract}`}`;
        }
        case FundedCandidateRefusal.PercentNeedsStop: {
            return `--percent "${arguments_.percent ?? refusal.percent.join(',')}" needs --stop-points: percent-of-cushion risk is placed in whole contracts at that stop (with --instrument, default NQ). Add --stop-points, or pass --percent '' to skip percent candidates.`;
        }
    }
}

function fundedSizingNotes(
    arguments_: FundedCandidateArguments,
    build: BuiltFundedCandidates,
    positionSizing: null | PositionSizingConfig,
    plan: Plan,
): string[] {
    if (positionSizing === null) {
        return arguments_.percent === undefined
            ? [
                  `percent-of-cushion candidates (${DEFAULT_PERCENT_CANDIDATES}) left out: they need --stop-points (with --instrument, default NQ) to place whole contracts`,
              ]
            : [];
    }
    return fundedPlacementNotes(build, positionSizing, plan);
}

function isSortFlag(argument: string): boolean {
    return argument === '--sort' || argument.startsWith('--sort=');
}

function printLiveTransferLines(
    plan: Plan,
    base: SimInputs,
    continuation: LiveTransferContinuationKind | undefined,
): void {
    const kind = continuation ?? LiveTransferContinuationKind.Off;
    const pricedLines = pricedTriggerLines(base);
    const lines = [
        ...pricedLines,
        ...unrestatedLines(
            liveTransferSweepLines(
                base.liveTransferHazard,
                kind,
                liveTransferContinuationNotes(plan, kind),
            ),
            pricedLines,
        ),
    ];
    for (const line of lines) {
        ui.muted(line);
    }
}

function readCandidateFamily(
    raw: string,
    name: string,
    itemSchema: z.ZodType<number, number>,
    expectation: string,
): number[] {
    return raw.trim() === ''
        ? []
        : readNumberList(raw, name, itemSchema, expectation);
}

function readFundedCandidateBuild(
    arguments_: FundedCandidateArguments,
    stopRule: DayStopRule,
    positionSizing: null | PositionSizingConfig,
    plan: null | Plan,
): BuiltFundedCandidates {
    const fundedLadder = readLadder(
        arguments_['funded-ladder'],
        'funded-ladder',
    );
    const flat = readCandidateFamily(
        arguments_.flat,
        'flat',
        fundedFlatCandidateSchema,
        'a dollar amount > 0',
    );
    const percent =
        arguments_.percent === undefined
            ? undefined
            : readCandidateFamily(
                  arguments_.percent,
                  'percent',
                  fundedPercentCandidateSchema,
                  'a percent in (0, 100]',
              );
    const build = buildFundedCandidates({
        flat,
        fundedLadder,
        percent,
        plan,
        positionSizing,
        stopRule,
    });
    switch (build.kind) {
        case FundedCandidateBuildKind.Built: {
            return build;
        }
        case FundedCandidateBuildKind.Refused: {
            throw new Error(
                fundedCandidateRefusalMessage(
                    build.refusal,
                    arguments_,
                    positionSizing,
                ),
            );
        }
    }
}

function sortOfObjective(objective: SizingObjective): FundedSortKey {
    switch (objective) {
        case SizingObjective.CycleCash:
        case SizingObjective.MonthlyNet: {
            return fundedSortOfObjective(objective);
        }
        case SizingObjective.RuinFirst: {
            throw new ObjectiveNotApplicable(RUIN_FIRST_NOT_APPLICABLE_MESSAGE);
        }
    }
}

function takeProfitRowCells(row: TakeProfitWhatIfRow): string[] {
    return [
        `1:${row.rrRatio}`,
        formatPercent(row.winrate),
        formatPercent(row.out.attemptPassProbability),
        row.out.daysToPassP50.toFixed(1),
        formatCurrency(row.out.expectedNet),
        formatCurrency(row.out.expectedMonthlyNet),
    ];
}
