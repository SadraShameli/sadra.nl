import { defineCommand } from 'citty';
import { z } from 'zod';

import {
    formatDaysToPass,
    groupByAvailabilityLabel,
    hasEvalPass,
    includeCallUpArgument,
    planArguments,
    planResolver,
    printEdgePlausibilityNotes,
    readScreenTime,
    type ScreenTime,
    screenTimeArguments,
    singlePathGranularityArgument,
    type TableColumn,
    TablePrinter,
    tradingArguments,
    tradingEdgeNotes,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import {
    formatCurrency,
    formatFiniteCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    dollars,
    FirmId,
    type Plan,
    type SimOutputs,
    simulate,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import { netPerScreenHour } from '~/lib/prop-calculator/economics';

export enum CompareSortKey {
    Cost = 'cost',
    Days = 'days',
    Hour = 'hour',
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
        ...screenTimeArguments,
        sort: {
            default: CompareSortKey.Net,
            description:
                'Rank by: net (monthly net), cost (expected cost per funded account, eval pass rate included), spend (expected spend per trial), pass (eval pass), days (median days to pass the eval) or hour (monthly net per screen hour; needs --hours-per-day and --accounts-per-session)',
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
            const screenTime = readScreenTime(context.args);
            requireScreenTimeForSort(sort, screenTime);

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
            printEdgePlausibilityNotes(
                tradingEdgeNotes({
                    fundedRrRatio: inputs.fundedRrRatio,
                    rrRatio: inputs.rrRatio,
                    winrate: inputs.winrate,
                }),
            );
            const table = new TablePrinter(
                compareColumns(inputs.copyAccounts, screenTime),
            );
            table.printHeader();
            for (const { out, plan } of rows) {
                table.printRow(compareRow(plan, out, screenTime));
            }

            const basisLine = describeColumnBasis(inputs.copyAccounts);
            if (basisLine !== null) ui.muted(basisLine);
            for (const line of describeEconomicsColumns(screenTime)) {
                ui.muted(line);
            }

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

const FIRM_COLUMN_WIDTH = Math.max(
    ...Object.values(FirmId).map((id) => id.length),
);

export function compareColumns(
    copyAccounts: number,
    screenTime: null | ScreenTime = null,
): TableColumn[] {
    const totalled = (label: string, width: number): TableColumn => {
        const text = copyAccounts > 1 ? `${label} x${copyAccounts}` : label;
        return { label: text, width: Math.max(width, text.length) };
    };
    const columns: TableColumn[] = [
        { align: 'left', label: 'firm', width: FIRM_COLUMN_WIDTH },
        { align: 'left', label: 'plan', width: 44 },
        { label: 'eval pass', width: 9 },
        { label: 'survive', width: 7 },
        { label: 'days', width: 6 },
        { label: '$/funded', width: 9 },
        totalled('spend', 8),
        totalled('payout', 9),
        totalled('monthly', 9),
        { label: 'bustF', width: 7 },
        { label: 'P(no payout)', width: 12 },
    ];
    if (screenTime !== null) {
        columns.push({ label: '$/screen hour', width: 13 });
    }
    return columns;
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
        case CompareSortKey.Hour: {
            return ascending(b.expectedMonthlyNet, a.expectedMonthlyNet);
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

export function compareRow(
    plan: Plan,
    out: SimOutputs,
    screenTime: null | ScreenTime = null,
): string[] {
    return [plan.id.firm, plan.label, ...compareRowCells(out, screenTime)];
}

export function compareRowCells(
    out: SimOutputs,
    screenTime: null | ScreenTime = null,
): string[] {
    const cells = [
        formatPercent(out.evalPassProbability),
        formatPercent(out.fundedSurvivalProbability),
        formatDaysToPass(out, out.daysToPassP50, 0),
        formatFiniteCurrency(out.costPerFundedAccount),
        formatCurrency(out.expectedTotalCost),
        formatCurrency(out.expectedGrossPayout),
        formatCurrency(out.expectedMonthlyNet),
        formatPercent(out.fundedBustProbability),
        formatNoPayoutProbability(out),
    ];
    if (screenTime !== null) {
        cells.push(formatScreenHour(out.expectedMonthlyNet, screenTime));
    }
    return cells;
}

export function describeColumnBasis(copyAccounts: number): null | string {
    return copyAccounts > 1
        ? `spend, payout and monthly total all ${copyAccounts} copies; eval pass, survive, days, $/funded, bustF and P(no payout) are per account`
        : null;
}

export function describeEconomicsColumns(
    screenTime: null | ScreenTime,
): string[] {
    const lines = [
        'P(no payout) = share of trials that reached funded and took no payout within the funded horizon',
    ];
    if (screenTime !== null) {
        lines.push(
            `$/screen hour = monthly net x ${screenTime.accountsPerSession} accounts per session / (${TRADING_DAYS_PER_MONTH} trading days x ${screenTime.sessionHoursPerDay} h per day); a copy group counts as one account`,
        );
    }
    return lines;
}

export function describeExcludedPlans(
    excluded: readonly Plan[],
): null | string {
    if (excluded.length === 0) return null;
    const parts: string[] = [];
    for (const [label, plans] of groupByAvailabilityLabel(excluded)) {
        parts.push(
            `${plans.length} ${label} plan(s): ${plans.map((plan) => plan.label).join(', ')}`,
        );
    }
    return `excluded ${parts.join('; ')} (pass --include-callup to rank them)`;
}

export function rankRows<T extends { readonly out: RankedMetrics }>(
    rows: readonly T[],
    sort: CompareSortKey,
): T[] {
    return rows.toSorted((a, b) => compareOutputs(a.out, b.out, sort));
}

export function requireScreenTimeForSort(
    sort: CompareSortKey,
    screenTime: null | ScreenTime,
): void {
    if (screenTime === null && sort === CompareSortKey.Hour) {
        throw new TypeError(
            '--sort hour needs --hours-per-day and --accounts-per-session',
        );
    }
}

function ascending(a: number, b: number): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function formatNoPayoutProbability(
    out: Pick<SimOutputs, 'fundedPayoutCountDistribution'>,
): string {
    const distribution = out.fundedPayoutCountDistribution;
    return distribution.length === 0
        ? NOT_APPLICABLE
        : formatPercent(distribution[0] ?? 0);
}

function formatScreenHour(
    expectedMonthlyNet: number,
    screenTime: ScreenTime,
): string {
    const result = netPerScreenHour({
        accountsPerSession: screenTime.accountsPerSession,
        expectedMonthlyNet: dollars(expectedMonthlyNet),
        sessionHoursPerDay: screenTime.sessionHoursPerDay,
    });
    return result.value === null
        ? NOT_APPLICABLE
        : formatCurrency(result.value.value);
}
