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
    lifetimeExpectedNet,
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
    lifetimeNet: null | number;
    out: SimOutputs;
    survivors: number;
}

type SortKey = 'cycle' | 'lifetime';

const SORT_KEYS: readonly SortKey[] = ['lifetime', 'cycle'];

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
            default: 'lifetime',
            description:
                'lifetime: renewal-adjusted, assumes unlimited repeat cycles over an unbounded time horizon. cycle: expected net from THIS ONE simulated run only (whatever --eval-days/--funded-days bound it to) -- use this for a short, fixed-horizon goal you do not intend to repeat indefinitely.',
            options: [...SORT_KEYS],
            type: 'enum',
        },
    },
    meta: {
        description:
            'Sweep flat-$, percent-of-cushion, and (with --funded-ladder) a funded-phase ladder policy (--firm, --variant), and rank by lifetime (renewal-adjusted) or cycle (this-run-only) expected cash extraction.',
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

            const allRows: ScoredCandidate[] = [];
            const undefinedLifetime: Candidate[] = [];
            for (const candidate of candidates) {
                const out = simulate({ ...base, ...candidate.overrides });
                let lifetimeNet: null | number = null;
                if (out.fundedBustProbability >= 1) {
                    undefinedLifetime.push(candidate);
                } else {
                    const costOfOneMoreAttempt = plan.feesUntilPass(
                        out.expectedDaysToPass,
                        base.discounts,
                    );
                    lifetimeNet = lifetimeExpectedNet({
                        costOfOneMoreAttempt,
                        expectedNet: out.expectedNet,
                        fundedBustProbability: out.fundedBustProbability,
                    });
                }
                allRows.push({
                    candidate,
                    lifetimeNet,
                    out,
                    survivors: Math.round(out.passProbability * inputs.trials),
                });
            }

            const rows =
                sort === 'lifetime'
                    ? allRows.filter(
                          (
                              row,
                          ): row is ScoredCandidate & { lifetimeNet: number } =>
                              row.lifetimeNet !== null,
                      )
                    : allRows;
            rows.sort((a, b) =>
                sort === 'lifetime'
                    ? (b.lifetimeNet ?? 0) - (a.lifetimeNet ?? 0)
                    : b.out.expectedNet - a.out.expectedNet,
            );

            spinner.succeed(`${plan.label} · ${rows.length} funded policies`);

            if (sort === 'lifetime' && undefinedLifetime.length > 0) {
                ui.warn(
                    `excluded ${undefinedLifetime.length} candidate(s) that bust 100% of the time at ${inputs.trials} trials, so lifetimeExpectedNet is undefined (a policy with zero chance of ever surviving to renew has no meaningful steady-state extraction rate): ${undefinedLifetime.map((candidate) => candidate.label).join(', ')}`,
                );
            }

            ui.heading(plan.label);
            ui.muted(
                sort === 'lifetime'
                    ? '  ranked by renewal-adjusted lifetime expected net (pure cash extraction, bust priced as +1 more eval attempt, assumes unlimited repeat cycles)\n'
                    : `  ranked by per-cycle expected net for THIS run only (${base.maxEvalDays}-day eval cap + ${base.fundedHorizonDays}-day funded horizon, no assumption you repeat this indefinitely)\n`,
            );
            ui.muted(
                `  survivors = trials (out of ${inputs.trials}) that passed eval and finished the funded horizon without busting -- a result backed by very few survivors is driven by a small, noisy sample and should not be trusted at face value\n`,
            );

            const table = new TablePrinter([
                { align: 'left', label: 'funded policy', width: 16 },
                { label: 'lifetime net', width: 14 },
                { label: 'per-cycle net', width: 14 },
                { label: 'bust when funded', width: 18 },
                { label: 'survivors', width: 14 },
            ]);
            table.printHeader();
            for (const row of rows) {
                table.printRow([
                    row.candidate.label,
                    row.lifetimeNet === null
                        ? 'n/a'
                        : formatCurrency(row.lifetimeNet),
                    formatCurrency(row.out.expectedNet),
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
