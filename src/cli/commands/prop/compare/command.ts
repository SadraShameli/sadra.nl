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
import { type SimOutputs, simulate } from '~/lib/prop-calculator';

type SortKey = 'cost' | 'days' | 'net' | 'pass';

const SORT_KEYS: readonly SortKey[] = ['cost', 'days', 'net', 'pass'];

export default defineCommand({
    args: {
        ...planArguments,
        ...tradingArguments,
        sort: {
            default: 'net',
            description: 'Rank by: net, cost, pass or days',
            options: [...SORT_KEYS],
            type: 'enum',
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
            const plans = planResolver.resolveMany(context.args);
            const inputs = TradingInputs.parse(context.args);
            const sort = context.args.sort;

            spinner = ui
                .spinner(
                    `simulating ${plans.length} plan(s) x ${inputs.trials} trials`,
                )
                .start();
            const rows = plans.map((plan) => ({
                out: simulate(inputs.toSimInputs(plan)),
                plan,
            }));
            spinner.succeed(
                `simulated ${plans.length} plan(s) x ${inputs.trials} trials`,
            );

            rows.sort((a, b) => compare(a.out, b.out, sort));

            ui.heading(
                `${plans.length} plan(s) · ${(inputs.winrate * 100).toFixed(0)}% WR · 1:${inputs.rrRatio} · ${inputs.fundedHorizonDays} funded days · sorted by ${sort}`,
            );
            const table = new TablePrinter([
                { align: 'left', label: 'plan', width: 44 },
                { label: 'pass', width: 6 },
                { label: 'days', width: 6 },
                { label: 'cost', width: 8 },
                { label: 'payout', width: 9 },
                { label: 'monthly', width: 9 },
                { label: 'bustF', width: 7 },
            ]);
            table.printHeader();
            for (const { out, plan } of rows) {
                table.printRow([
                    plan.label,
                    formatPercent(out.passProbability),
                    out.daysToPassP50.toFixed(0),
                    formatCurrency(out.expectedTotalCost),
                    formatCurrency(out.expectedGrossPayout),
                    formatCurrency(out.expectedMonthlyNet),
                    formatPercent(out.fundedBustProbability),
                ]);
            }

            const best = rows[0];
            if (best) {
                ui.success(
                    `best by ${sort}: ${best.plan.label} (${best.plan.id.firm})`,
                );
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

function compare(a: SimOutputs, b: SimOutputs, sort: SortKey): number {
    switch (sort) {
        case 'cost': {
            return a.expectedTotalCost - b.expectedTotalCost;
        }
        case 'days': {
            return a.daysToPassP50 - b.daysToPassP50;
        }
        case 'net': {
            return b.expectedMonthlyNet - a.expectedMonthlyNet;
        }
        case 'pass': {
            return b.passProbability - a.passProbability;
        }
    }
}
