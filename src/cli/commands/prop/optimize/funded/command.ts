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
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type DayStopRule,
    fraction,
    oneContractRisk,
    PolicySizing,
    type PositionSizingConfig,
    resolvePositionSizing,
    SIM_DEFAULTS,
    type SimInputs,
    type SimOutputs,
    simulate,
    TRADING_DAYS_PER_MONTH,
    wholeContractRisk,
} from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

export enum FundedSortKey {
    Cycle = 'cycle',
    Monthly = 'monthly',
}

export interface Candidate {
    label: string;
    overrides: Partial<SimInputs>;
}

export interface FundedCandidateArguments {
    flat: string;
    'funded-ladder'?: string;
    percent?: string;
}

type CandidateSizingOverrides = Pick<
    SimInputs,
    'fundedCushionPercent' | 'fundedRiskPerTrade'
>;

interface FlatCandidates {
    belowOneContract: number[];
    placed: Candidate[];
}

interface PlacedRisk {
    contracts: number;
    risk: number;
}

interface ScoredCandidate {
    candidate: Candidate;
    out: SimOutputs;
}

const DEFAULT_PERCENT_CANDIDATES = '5,7.5,10,15';

const MIN_POLICY_COLUMN_WIDTH = 16;

const SORT_KEYS: readonly FundedSortKey[] = [
    FundedSortKey.Monthly,
    FundedSortKey.Cycle,
];

export default defineCommand({
    args: {
        ...planArguments,
        ...tradingArguments,
        ...singlePathGranularityArgument,
        flat: {
            default: '150,200,250,300,400,500',
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
            description:
                "monthly (default): steady-state expected net per month for one account slot ((per-run net + horizon credit) divided by expected days per run, i.e. the slot is refilled after every failed eval, funded bust or horizon end; the 'monthly ex-credit' column leaves the credit out) -- the only key valid for ranking plans. cycle: expected net from THIS ONE simulated run only (whatever --eval-days/--funded-days bound it to) -- use this for a short, fixed-horizon goal you do not intend to repeat indefinitely.",
            options: [...SORT_KEYS],
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
            const candidates = readFundedCandidates(
                context.args,
                inputs.dayStop,
                positionSizing,
            );

            spinner = ui
                .spinner(
                    fundedSweepProgress(
                        plan.label,
                        candidates.length,
                        inputs.trials,
                    ),
                )
                .start();

            const rows: ScoredCandidate[] = candidates.map((candidate) => {
                const out = simulate({ ...base, ...candidate.overrides });
                return { candidate, out };
            });

            rows.sort((a, b) => {
                switch (sort) {
                    case FundedSortKey.Cycle: {
                        return b.out.expectedNet - a.out.expectedNet;
                    }
                    case FundedSortKey.Monthly: {
                        return (
                            b.out.expectedMonthlyNet - a.out.expectedMonthlyNet
                        );
                    }
                }
            });

            spinner.succeed(fundedSweepSummary(plan.label, rows.length));

            ui.heading(plan.label);
            for (const note of fundedSizingNotes(
                context.args,
                positionSizing,
            )) {
                ui.note(note);
            }
            ui.muted(sortDescription(sort, base));
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

export function fundedRowCells(
    label: string,
    out: SimOutputs,
    trials: number,
): string[] {
    return [
        label,
        formatCurrency(out.expectedNet),
        formatCurrency(out.expectedHorizonCredit),
        formatCurrency(out.expectedMonthlyNet),
        formatCurrency(out.expectedMonthlyRealizedNet),
        formatPercent(out.fundedBustProbability),
        `${survivorCount(out, trials)}/${trials}`,
    ];
}

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
): Candidate[] {
    const fundedLadder = readLadder(
        arguments_['funded-ladder'],
        'funded-ladder',
    );
    const flat = readFlatCandidates(arguments_, positionSizing);
    const candidates = [
        ...flat.placed,
        ...readPercentCandidates(arguments_, positionSizing),
        ...(fundedLadder
            ? [ladderCandidate(fundedLadder, stopRule, positionSizing)]
            : []),
    ];
    if (candidates.length === 0) {
        const belowOneContract = flatBelowOneContractNote(
            flat.belowOneContract,
            positionSizing,
        );
        throw new Error(
            `No funded policies to test: give at least one of --flat, --percent or --funded-ladder${belowOneContract === null ? '' : `. ${belowOneContract}`}`,
        );
    }
    return candidates;
}

export function sortDescription(sort: FundedSortKey, base: SimInputs): string {
    switch (sort) {
        case FundedSortKey.Cycle: {
            return `  ranked by per-cycle expected net for THIS run only (${base.maxEvalDays}-day eval cap + ${base.fundedHorizonDays}-day funded horizon, no assumption you repeat this indefinitely)\n`;
        }
        case FundedSortKey.Monthly: {
            const rebuyLagDays = base.rebuyLagDays ?? SIM_DEFAULTS.rebuyLagDays;
            return `  ranked by steady-state expected net per month for one account slot: monthly net = (per-cycle net + horizon credit) x ${TRADING_DAYS_PER_MONTH} / slot days, where slot days are the expected days per run (slot refilled after every failed eval, funded bust or ${base.fundedHorizonDays}-day horizon end, plus ${rebuyLagDays} rebuy-lag-days of empty slot time per new eval attempt); the horizon credit is one more payout request for an account still open at the horizon, its withdrawable balance capped by the payout profit pool (cycle profit since the last payout on cycle-pool plans) when there is no payout ladder, the ladder step, request size, profit share and request caps, and 0 once a lifetime payout cap is reached or the payout ladder is exhausted; monthly ex-credit = per-cycle net x ${TRADING_DAYS_PER_MONTH} / slot days, leaving the horizon credit out\n`;
        }
    }
}

export function survivorCount(
    out: Pick<SimOutputs, 'fundedSurvivalProbability'>,
    trials: number,
): number {
    return Math.round(out.fundedSurvivalProbability * trials);
}

function candidateSizingIssue(
    overrides: CandidateSizingOverrides,
    positionSizing: null | PositionSizingConfig,
): null | string {
    return simInputsSizingIssue({
        ...overrides,
        instrument: positionSizing?.instrument.symbol,
        riskPerTrade: overrides.fundedRiskPerTrade ?? 0,
        stopPoints: positionSizing?.stopPoints,
    });
}

function flatBelowOneContractNote(
    belowOneContract: readonly number[],
    positionSizing: null | PositionSizingConfig,
): null | string {
    if (positionSizing === null || belowOneContract.length === 0) return null;
    const dollars = belowOneContract.map((dollar) => `$${dollar}`).join(', ');
    return `flat ${dollars} left out: below one ${positionSizing.instrument.symbol} contract's risk at a ${positionSizing.stopPoints} point stop ($${oneContractRisk(positionSizing)}), and funded flat risk is rounded down to whole contracts, never up`;
}

function flatLabel(
    dollar: number,
    positionSizing: null | PositionSizingConfig,
): string {
    if (positionSizing === null) return `flat $${dollar}`;
    const placed = placedRisk(dollar, positionSizing);
    return `flat $${dollar} (${placed.contracts} ${positionSizing.instrument.symbol} = $${placed.risk})`;
}

function flatOverrides(dollar: number): CandidateSizingOverrides {
    return { fundedCushionPercent: undefined, fundedRiskPerTrade: dollar };
}

function fundedSizingNotes(
    arguments_: FundedCandidateArguments,
    positionSizing: null | PositionSizingConfig,
): string[] {
    if (positionSizing === null) {
        return arguments_.percent === undefined
            ? [
                  `percent-of-cushion candidates (${DEFAULT_PERCENT_CANDIDATES}) left out: they need --stop-points (with --instrument, default NQ) to place whole contracts`,
              ]
            : [];
    }
    const belowOneContract = flatBelowOneContractNote(
        readFlatCandidates(arguments_, positionSizing).belowOneContract,
        positionSizing,
    );
    return [
        ...(belowOneContract === null ? [] : [belowOneContract]),
        `flat, percent and ladder rows are placed in whole ${positionSizing.instrument.symbol} contracts at a ${positionSizing.stopPoints} point stop; a flat or ladder label shows the placed risk before the funded contract limit and the affordable room cut it further`,
    ];
}

function ladderCandidate(
    ladder: readonly number[],
    stopRule: DayStopRule,
    positionSizing: null | PositionSizingConfig,
): Candidate {
    const rungs = ladder.join('/');
    const overrides = {
        fundedCushionPercent: undefined,
        fundedRiskPerTrade: undefined,
    } satisfies CandidateSizingOverrides;
    if (positionSizing === null) {
        return {
            label: `ladder ${rungs}`,
            overrides: {
                ...overrides,
                fundedDayPolicy: {
                    ladder,
                    maxLossesPerDay: null,
                    sizing: PolicySizing.ContractCapped,
                    stopRule,
                },
            },
        };
    }
    const belowOneContract = ladder.filter(
        (rung) =>
            candidateSizingIssue(flatOverrides(rung), positionSizing) !== null,
    );
    if (belowOneContract.length > 0) {
        throw new Error(
            `Invalid --funded-ladder "${ladder.join(',')}": ${belowOneContract.map((rung) => `$${rung}`).join(', ')} below one ${positionSizing.instrument.symbol} contract's risk at a ${positionSizing.stopPoints} point stop ($${oneContractRisk(positionSizing)}), and funded ladder rungs are rounded down to whole contracts, never up. Raise the rung, or use a micro instrument or a tighter stop.`,
        );
    }
    const placed = ladder.map((rung) => placedRisk(rung, positionSizing));
    return {
        label: `ladder ${rungs} (${placed.map((rung) => rung.contracts).join('/')} ${positionSizing.instrument.symbol} = ${placed.map((rung) => `$${rung.risk}`).join('/')})`,
        overrides: {
            ...overrides,
            fundedDayPolicy: {
                ladder,
                maxLossesPerDay: null,
                sizing: PolicySizing.WholeContracts,
                stopRule,
            },
        },
    };
}

function placedRisk(
    dollar: number,
    positionSizing: PositionSizingConfig,
): PlacedRisk {
    const risk = wholeContractRisk(dollar, positionSizing, null);
    return {
        contracts: Math.round(risk / oneContractRisk(positionSizing)),
        risk,
    };
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

function readFlatCandidates(
    arguments_: FundedCandidateArguments,
    positionSizing: null | PositionSizingConfig,
): FlatCandidates {
    const dollars = readCandidateFamily(
        arguments_.flat,
        'flat',
        z.number().positive(),
        'a dollar amount > 0',
    );
    const isPlaced = (dollar: number): boolean =>
        candidateSizingIssue(flatOverrides(dollar), positionSizing) === null;
    return {
        belowOneContract: dollars.filter((dollar) => !isPlaced(dollar)),
        placed: dollars.filter(isPlaced).map((dollar): Candidate => ({
            label: flatLabel(dollar, positionSizing),
            overrides: flatOverrides(dollar),
        })),
    };
}

function readPercentCandidates(
    arguments_: FundedCandidateArguments,
    positionSizing: null | PositionSizingConfig,
): Candidate[] {
    const { percent } = arguments_;
    const candidates = readCandidateFamily(
        percent ?? DEFAULT_PERCENT_CANDIDATES,
        'percent',
        z.number().positive().max(100),
        'a percent in (0, 100]',
    ).map((pct): Candidate => ({
        label: `${pct}% cushion`,
        overrides: {
            fundedCushionPercent: fraction(pct / 100),
            fundedRiskPerTrade: undefined,
        },
    }));
    const isRefused = candidates.some(
        (candidate) =>
            candidateSizingIssue(candidate.overrides, positionSizing) !== null,
    );
    if (!isRefused) return candidates;
    if (percent === undefined) return [];
    throw new Error(
        `--percent "${percent}" needs --stop-points: percent-of-cushion risk is placed in whole contracts at that stop (with --instrument, default NQ). Add --stop-points, or pass --percent '' to skip percent candidates.`,
    );
}
