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
    simulate,
} from '~/lib/prop-calculator';

interface Candidate {
    label: string;
    overrides: Partial<SimInputs>;
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

            const rows = candidates.map((candidate) => {
                const out = simulate({ ...base, ...candidate.overrides });
                const costOfOneMoreAttempt = plan.feesUntilPass(
                    out.expectedDaysToPass,
                    base.discounts,
                );
                const lifetimeNet = lifetimeExpectedNet({
                    costOfOneMoreAttempt,
                    expectedNet: out.expectedNet,
                    fundedBustProbability: out.fundedBustProbability,
                });
                return { candidate, lifetimeNet, out };
            });
            rows.sort((a, b) => b.lifetimeNet - a.lifetimeNet);

            spinner.succeed(
                `${plan.label} · ${candidates.length} funded policies`,
            );

            ui.heading(plan.label);
            ui.muted(
                '  ranked by renewal-adjusted lifetime expected net (pure cash extraction, bust priced as +1 more eval attempt)\n',
            );

            const table = new TablePrinter([
                { align: 'left', label: 'funded policy', width: 16 },
                { label: 'lifetime net', width: 14 },
                { label: 'per-cycle net', width: 14 },
                { label: 'bust when funded', width: 18 },
            ]);
            table.printHeader();
            for (const row of rows) {
                table.printRow([
                    row.candidate.label,
                    formatCurrency(row.lifetimeNet),
                    formatCurrency(row.out.expectedNet),
                    formatPercent(row.out.fundedBustProbability),
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
