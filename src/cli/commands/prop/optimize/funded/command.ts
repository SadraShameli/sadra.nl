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
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';

export interface Candidate {
    label: string;
    overrides: Partial<SimInputs>;
}

export interface FundedCandidateArguments {
    flat: string;
    'funded-ladder'?: string;
    percent: string;
}

interface ScoredCandidate {
    candidate: Candidate;
    out: SimOutputs;
    survivors: number;
}

type SortKey = 'cycle' | 'monthly';

const SORT_KEYS: readonly SortKey[] = ['monthly', 'cycle'];

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
                'Funded-phase risk ladder to test as one extra candidate, comma separated (e.g. 400,600,800,200) -- unlike --ladder (eval-only), this sizes trade 1/2/3/4 of each funded-phase day instead of a flat $/trade or %-of-cushion amount. Omit to test only flat/percent, as before.',
            type: 'string',
        },
        percent: {
            default: '5,7.5,10,15',
            description:
                "Comma-separated percent-of-cushion funded-phase candidates. Pass '' to skip percent candidates.",
            type: 'string',
        },
        sort: {
            default: 'monthly',
            description:
                'monthly (default): steady-state expected net per month for one account slot (per-run net divided by expected days per run, i.e. the slot is refilled after every failed eval, funded bust or horizon end) -- the only key valid for ranking plans. cycle: expected net from THIS ONE simulated run only (whatever --eval-days/--funded-days bound it to) -- use this for a short, fixed-horizon goal you do not intend to repeat indefinitely.',
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
            const sort = context.args.sort;
            const candidates = readFundedCandidates(
                context.args,
                inputs.dayStop,
            );

            spinner = ui
                .spinner(
                    `${plan.label} · ${candidates.length} funded policies · ${inputs.trials} trials each`,
                )
                .start();

            const rows: ScoredCandidate[] = candidates.map((candidate) => {
                const out = simulate({ ...base, ...candidate.overrides });
                return {
                    candidate,
                    out,
                    survivors: survivorCount(out, inputs.trials),
                };
            });

            rows.sort((a, b) => {
                switch (sort) {
                    case 'cycle': {
                        return b.out.expectedNet - a.out.expectedNet;
                    }
                    case 'monthly': {
                        return (
                            b.out.expectedMonthlyNet - a.out.expectedMonthlyNet
                        );
                    }
                }
            });

            spinner.succeed(`${plan.label} · ${rows.length} funded policies`);

            ui.heading(plan.label);
            ui.muted(sortDescription(sort, base));
            ui.muted(
                `  survivors = trials (out of ${inputs.trials}) that passed eval and never busted funded (reached the horizon or the account concluded) -- a result backed by very few survivors is driven by a small, noisy sample and should not be trusted at face value\n`,
            );

            const table = new TablePrinter([
                { align: 'left', label: 'funded policy', width: 16 },
                { label: 'per-cycle net', width: 14 },
                { label: 'monthly net', width: 13 },
                { label: 'bust when funded', width: 18 },
                { label: 'survivors', width: 14 },
            ]);
            table.printHeader();
            for (const row of rows) {
                table.printRow([
                    row.candidate.label,
                    formatCurrency(row.out.expectedNet),
                    formatCurrency(row.out.expectedMonthlyNet),
                    formatPercent(row.out.fundedBustProbability),
                    `${row.survivors}/${inputs.trials}`,
                ]);
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function readFundedCandidates(
    arguments_: FundedCandidateArguments,
    stopRule: DayStopRule,
): Candidate[] {
    const fundedLadder = readLadder(
        arguments_['funded-ladder'],
        'funded-ladder',
    );
    const candidates = [
        ...readCandidateFamily(
            arguments_.flat,
            'flat',
            z.number().positive(),
            'a dollar amount > 0',
        ).map((dollar): Candidate => ({
            label: `flat $${dollar}`,
            overrides: {
                fundedCushionPercent: undefined,
                fundedRiskPerTrade: dollar,
            },
        })),
        ...readCandidateFamily(
            arguments_.percent,
            'percent',
            z.number().positive().max(100),
            'a percent in (0, 100]',
        ).map((pct): Candidate => ({
            label: `${pct}% cushion`,
            overrides: {
                fundedCushionPercent: fraction(pct / 100),
                fundedRiskPerTrade: undefined,
            },
        })),
        ...(fundedLadder
            ? [
                  {
                      label: `ladder ${fundedLadder.join('/')}`,
                      overrides: {
                          fundedCushionPercent: undefined,
                          fundedDayPolicy: {
                              ladder: fundedLadder,
                              maxLossesPerDay: null,
                              stopRule,
                          },
                          fundedRiskPerTrade: undefined,
                      },
                  } satisfies Candidate,
              ]
            : []),
    ];
    if (candidates.length === 0) {
        throw new Error(
            'No funded policies to test: give at least one of --flat, --percent or --funded-ladder',
        );
    }
    return candidates;
}

export function sortDescription(sort: SortKey, base: SimInputs): string {
    switch (sort) {
        case 'cycle': {
            return `  ranked by per-cycle expected net for THIS run only (${base.maxEvalDays}-day eval cap + ${base.fundedHorizonDays}-day funded horizon, no assumption you repeat this indefinitely)\n`;
        }
        case 'monthly': {
            const rebuyLagDays = base.rebuyLagDays ?? 0;
            return `  ranked by steady-state expected net per month for one account slot (per-run net / expected days per run, slot refilled after every failed eval, funded bust or ${base.fundedHorizonDays}-day horizon end, plus ${rebuyLagDays} rebuy-lag-days of empty slot time per new eval attempt; an account still open at the horizon is credited its withdrawable balance there)\n`;
        }
    }
}

export function survivorCount(
    out: Pick<SimOutputs, 'fundedSurvivalProbability'>,
    trials: number,
): number {
    return Math.round(out.fundedSurvivalProbability * trials);
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
