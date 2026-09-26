import { defineCommand } from 'citty';
import { z } from 'zod';

import {
    planArguments,
    planResolver,
    readLadder,
    readNumberList,
    singlePathGranularityArgument,
    TablePrinter,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    type DayStopRule,
    type Plan,
    type PositionSizingConfig,
    resolvePositionSizing,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import {
    buildFundedCandidates,
    type BuiltFundedCandidates,
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    DEFAULT_FUNDED_PERCENT_CANDIDATES,
    flatsBelowOneContractNote,
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
    ladderRungsBelowOneContractText,
    runFundedCandidateSweep,
} from '~/lib/prop-calculator/optimize';

export interface FundedCandidateArguments {
    flat: string;
    'funded-ladder'?: string;
    percent?: string;
}

const DEFAULT_PERCENT_CANDIDATES = DEFAULT_FUNDED_PERCENT_CANDIDATES.join(',');

const MIN_POLICY_COLUMN_WIDTH = 16;

export default defineCommand({
    args: {
        ...planArguments,
        ...tradingArguments,
        ...singlePathGranularityArgument,
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
            const base = inputs.toSimInputs(plan);
            const sort = z.enum(FundedSortKey).parse(context.args.sort);
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
            for (const note of fundedSizingNotes(
                context.args,
                build,
                positionSizing,
                plan,
            )) {
                ui.note(note);
            }
            ui.muted(fundedSortDescription(sort, base));
            ui.muted(
                `  survivors = trials (out of ${inputs.trials}) that passed eval and never busted funded (reached the horizon or the account concluded) -- a result backed by very few survivors is driven by a small, noisy sample and should not be trusted at face value\n`,
            );

            const table = new TablePrinter([
                {
                    align: 'left',
                    label: 'funded policy',
                    width: Math.max(
                        MIN_POLICY_COLUMN_WIDTH,
                        ...rows.map((row) => row.candidate.label.length),
                    ),
                },
                { label: 'per-cycle net', width: 14 },
                { label: 'horizon credit', width: 15 },
                { label: 'monthly net', width: 13 },
                { label: 'monthly ex-credit', width: 18 },
                { label: 'bust when funded', width: 18 },
                { label: 'survivors', width: 14 },
            ]);
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

export function readFundedCandidates(
    arguments_: FundedCandidateArguments,
    stopRule: DayStopRule,
    positionSizing: null | PositionSizingConfig = null,
    plan?: Plan,
): FundedCandidate[] {
    return readFundedCandidateBuild(
        arguments_,
        stopRule,
        positionSizing,
        plan ?? null,
    ).candidates;
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
