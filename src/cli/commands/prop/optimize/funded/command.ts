import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    readLadder,
    TablePrinter,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    fraction,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';

interface Candidate {
    label: string;
    overrides: Partial<SimInputs>;
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
        flat: {
            default: '150,200,250,300,400,500',
            description: 'Comma-separated flat $/trade funded-phase candidates',
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
                'Comma-separated percent-of-cushion funded-phase candidates',
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
            const fundedLadder = readLadder(context.args['funded-ladder']);

            const candidates: Candidate[] = [
                ...readCandidateList(context.args.flat, 'flat').map(
                    (dollar): Candidate => ({
                        label: `flat $${dollar}`,
                        overrides: {
                            fundedCushionPercent: undefined,
                            fundedRiskPerTrade: dollar,
                        },
                    }),
                ),
                ...readCandidateList(context.args.percent, 'percent').map(
                    (pct): Candidate => ({
                        label: `${pct}% cushion`,
                        overrides: {
                            fundedCushionPercent: fraction(pct / 100),
                            fundedRiskPerTrade: undefined,
                        },
                    }),
                ),
                ...(fundedLadder
                    ? [
                          {
                              label: `ladder ${fundedLadder.join('/')}`,
                              overrides: {
                                  fundedCushionPercent: undefined,
                                  fundedDayPolicy: {
                                      ladder: fundedLadder,
                                      maxLossesPerDay: null,
                                      stopRule: inputs.dayStop,
                                  },
                                  fundedRiskPerTrade: undefined,
                              },
                          } satisfies Candidate,
                      ]
                    : []),
            ];

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
                    survivors: Math.round(out.passProbability * inputs.trials),
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

function readCandidateList(raw: string, name: string): number[] {
    const parts = raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map(Number);
    const isOutOfRange =
        name === 'percent'
            ? (part: number) => part <= 0 || part > 100
            : (part: number) => part <= 0;
    if (parts.some((part) => !Number.isFinite(part) || isOutOfRange(part))) {
        throw new Error(`Invalid --${name} "${raw}"`);
    }
    return parts;
}
