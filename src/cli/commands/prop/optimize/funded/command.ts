import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
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
    lifetimeNet: number;
    out: SimOutputs;
    survivors: number;
}

export default defineCommand({
    args: {
        ...planArguments,
        ...tradingArguments,
        flat: {
            default: '150,200,250,300,400,500',
            description: 'Comma-separated flat $/trade funded-phase candidates',
            type: 'string',
        },
        percent: {
            default: '5,7.5,10,15',
            description:
                'Comma-separated percent-of-cushion funded-phase candidates',
            type: 'string',
        },
    },
    meta: {
        description:
            'Sweep flat-$ and percent-of-cushion funded-phase policies (--firm, --variant) and rank by renewal-adjusted lifetime expected cash extraction.',
        name: 'funded',
    },
    run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            const base = inputs.toSimInputs(plan);

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
            ];

            spinner = ui
                .spinner(
                    `${plan.label} · ${candidates.length} funded policies · ${inputs.trials} trials each`,
                )
                .start();

            const rows: ScoredCandidate[] = [];
            const alwaysBusts: Candidate[] = [];
            for (const candidate of candidates) {
                const out = simulate({ ...base, ...candidate.overrides });
                if (out.fundedBustProbability >= 1) {
                    alwaysBusts.push(candidate);
                    continue;
                }
                const costOfOneMoreAttempt = plan.feesUntilPass(
                    out.expectedDaysToPass,
                    base.discounts,
                );
                const lifetimeNet = lifetimeExpectedNet({
                    costOfOneMoreAttempt,
                    expectedNet: out.expectedNet,
                    fundedBustProbability: out.fundedBustProbability,
                });
                rows.push({
                    candidate,
                    lifetimeNet,
                    out,
                    survivors: Math.round(out.passProbability * inputs.trials),
                });
            }
            rows.sort((a, b) => b.lifetimeNet - a.lifetimeNet);

            spinner.succeed(
                `${plan.label} · ${rows.length} funded policies`,
            );

            if (alwaysBusts.length > 0) {
                ui.warn(
                    `excluded ${alwaysBusts.length} candidate(s) that bust 100% of the time at ${inputs.trials} trials, so lifetimeExpectedNet is undefined (a policy with zero chance of ever surviving to renew has no meaningful steady-state extraction rate): ${alwaysBusts.map((candidate) => candidate.label).join(', ')}`,
                );
            }

            ui.heading(plan.label);
            ui.muted(
                '  ranked by renewal-adjusted lifetime expected net (pure cash extraction, bust priced as +1 more eval attempt)\n',
            );
            ui.muted(
                `  survivors = trials (out of ${inputs.trials}) that passed eval and finished the funded horizon without busting -- lifetime net for a row with very few survivors is driven by a small, noisy sample and should not be trusted at face value\n`,
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
                    formatCurrency(row.lifetimeNet),
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
