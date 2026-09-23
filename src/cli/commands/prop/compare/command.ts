import { defineCommand } from 'citty';
import { z } from 'zod';

import {
    formatDaysToPass,
    hasEvalPass,
    includeCallUpArgument,
    planArguments,
    planResolver,
    singlePathGranularityArgument,
    type TableColumn,
    TablePrinter,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    formatCurrency,
    formatFiniteCurrency,
    formatPercent,
} from '~/lib/format';
import {
    type Plan,
    PLAN_AVAILABILITY_LABEL,
    PlanAvailability,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';

export enum CompareSortKey {
    Cost = 'cost',
    Days = 'days',
    Net = 'net',
    Pass = 'pass',
    Spend = 'spend',
}

export type RankedMetrics = Pick<
    SimOutputs,
    | 'costPerFundedAccount'
    | 'daysToPassP50'
    | 'evalPassProbability'
    | 'expectedMonthlyNet'
    | 'expectedTotalCost'
>;

export const SORT_KEYS: readonly CompareSortKey[] =
    Object.values(CompareSortKey);

export default defineCommand({
    args: {
        ...planArguments,
        ...tradingArguments,
        ...singlePathGranularityArgument,
        ...includeCallUpArgument,
        sort: {
            default: CompareSortKey.Net,
            description:
                'Rank by: net (monthly net), cost (expected cost per funded account, eval pass rate included), spend (expected spend per trial), pass (eval pass) or days (median days to pass the eval)',
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
            const { excluded, plans } = planResolver.resolveRankable(
                context.args,
                context.args['include-callup'],
            );
            const inputs = TradingInputs.parse(context.args);
            const sort = z.enum(CompareSortKey).parse(context.args.sort);

            spinner = ui
                .spinner(
                    `simulating ${plans.length} plan(s) x ${inputs.trials} trials`,
                )
                .start();
            const simulated = plans.map((plan) => ({
                out: simulate(inputs.toSimInputs(plan)),
                plan,
            }));
            spinner.succeed(
                `simulated ${plans.length} plan(s) x ${inputs.trials} trials`,
            );

            const rows = rankRows(simulated, sort);

            ui.heading(
                `${plans.length} plan(s) · ${(inputs.winrate * 100).toFixed(0)}% WR · 1:${inputs.rrRatio} · ${inputs.fundedHorizonDays} funded days · sorted by ${sort}`,
            );
            const table = new TablePrinter(compareColumns(inputs.copyAccounts));
            table.printHeader();
            for (const { out, plan } of rows) {
                table.printRow([plan.label, ...compareRowCells(out)]);
            }

            const basisLine = describeColumnBasis(inputs.copyAccounts);
            if (basisLine !== null) ui.muted(basisLine);

            const excludedLine = describeExcludedPlans(excluded);
            if (excludedLine !== null) ui.muted(excludedLine);

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

export function compareColumns(copyAccounts: number): TableColumn[] {
    const totalled = (label: string, width: number): TableColumn => {
        const text = copyAccounts > 1 ? `${label} x${copyAccounts}` : label;
        return { label: text, width: Math.max(width, text.length) };
    };
    return [
        { align: 'left', label: 'plan', width: 44 },
        { label: 'eval pass', width: 9 },
        { label: 'survive', width: 7 },
        { label: 'days', width: 6 },
        { label: '$/funded', width: 9 },
        totalled('spend', 8),
        totalled('payout', 9),
        totalled('monthly', 9),
        { label: 'bustF', width: 7 },
    ];
}

export function compareOutputs(
    a: RankedMetrics,
    b: RankedMetrics,
    sort: CompareSortKey,
): number {
    switch (sort) {
        case CompareSortKey.Cost: {
            return ascending(a.costPerFundedAccount, b.costPerFundedAccount);
        }
        case CompareSortKey.Days: {
            const isAPassed = hasEvalPass(a);
            const isBPassed = hasEvalPass(b);
            if (isAPassed && isBPassed) {
                return ascending(a.daysToPassP50, b.daysToPassP50);
            }
            if (isAPassed === isBPassed) return 0;
            return isAPassed ? -1 : 1;
        }
        case CompareSortKey.Net: {
            return ascending(b.expectedMonthlyNet, a.expectedMonthlyNet);
        }
        case CompareSortKey.Pass: {
            return ascending(b.evalPassProbability, a.evalPassProbability);
        }
        case CompareSortKey.Spend: {
            return ascending(a.expectedTotalCost, b.expectedTotalCost);
        }
    }
}

export function compareRowCells(out: SimOutputs): string[] {
    return [
        formatPercent(out.evalPassProbability),
        formatPercent(out.fundedSurvivalProbability),
        formatDaysToPass(out, out.daysToPassP50, 0),
        formatFiniteCurrency(out.costPerFundedAccount),
        formatCurrency(out.expectedTotalCost),
        formatCurrency(out.expectedGrossPayout),
        formatCurrency(out.expectedMonthlyNet),
        formatPercent(out.fundedBustProbability),
    ];
}

export function describeColumnBasis(copyAccounts: number): null | string {
    return copyAccounts > 1
        ? `spend, payout and monthly total all ${copyAccounts} copies; eval pass, survive, days, $/funded and bustF are per account`
        : null;
}

export function describeExcludedPlans(
    excluded: readonly Plan[],
): null | string {
    return excluded.length === 0
        ? null
        : `excluded ${excluded.length} ${PLAN_AVAILABILITY_LABEL[PlanAvailability.CallUpOnly]} plan(s): ${excluded.map((plan) => plan.label).join(', ')} (pass --include-callup to rank them)`;
}

export function rankRows<T extends { readonly out: RankedMetrics }>(
    rows: readonly T[],
    sort: CompareSortKey,
): T[] {
    return rows.toSorted((a, b) => compareOutputs(a.out, b.out, sort));
}

function ascending(a: number, b: number): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}
