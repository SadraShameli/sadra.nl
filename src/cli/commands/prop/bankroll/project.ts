import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    printEdgePlausibilityNotes,
    TablePrinter,
    tradingArguments,
    tradingEdgeNotes,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import { bankrollCompoundingIllustration } from '~/lib/prop-calculator/economics';
import {
    type BankrollTimelineResult,
    simulateBankrollTimeline,
} from '~/lib/prop-calculator/portfolioTimeline';

import {
    bankrollProjectArguments,
    type BankrollProjectInputs,
    readBankrollProjectInputs,
    toBankrollTimelineInputs,
} from './bankrollFlags';

export const projectArguments = {
    ...planArguments,
    ...tradingArguments,
    ...bankrollProjectArguments,
};

export default defineCommand({
    args: projectArguments,
    meta: {
        description:
            'Project a budget-driven, reinvesting bankroll over a horizon, with bands and path ruin',
        name: 'project',
    },
    run(context) {
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            const project = readBankrollProjectInputs(context.args);

            const timelineInputs = toBankrollTimelineInputs(
                inputs,
                plan,
                {
                    maxConcurrentAccounts: project.capacity,
                    monthlyBudget: project.monthlyBudget,
                    payoutLagDays: project.payoutLagDays,
                    reinvestFraction: project.reinvest,
                    roundBudget: null,
                    startingBankroll: project.start,
                },
                project.horizonDays,
                project.trials,
            );

            const out = simulateBankrollTimeline(timelineInputs);

            ui.heading(`${plan.label}: bankroll projection`);
            ui.muted(
                `  start ${formatCurrency(project.start)} | reinvest ${formatPercent(project.reinvest)} | horizon ${project.horizonDays} days | payout lag ${project.payoutLagDays} days | ${project.trials} trials\n`,
            );
            printEdgePlausibilityNotes(
                tradingEdgeNotes({
                    fundedRrRatio: inputs.fundedRrRatio,
                    rrRatio: inputs.rrRatio,
                    winrate: inputs.winrate,
                }),
            );

            const table = new TablePrinter([
                { align: 'left', label: '', width: 22 },
                { label: '', width: 0 },
            ]);
            for (const row of projectSummaryRows(out)) {
                table.printRow(row);
            }

            ui.muted(
                '\n  deterministic illustration, not a forecast (constant multiple, no caps, no variance):',
            );
            const illustration = closedFormIllustration(project);
            ui.note(illustration);
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function closedFormIllustration(
    project: Pick<BankrollProjectInputs, 'horizonDays' | 'reinvest' | 'start'>,
): string {
    const illustration = bankrollCompoundingIllustration(
        project.start,
        project.reinvest,
        project.horizonDays,
    );
    if (illustration === null) {
        return 'n/a: reinvestment is 0, so there is no compounding cycle to illustrate';
    }
    return illustration.quantity.value === null
        ? 'n/a'
        : `${formatCurrency(illustration.quantity.value)} at a ${illustration.multiple.toFixed(2)}x / ${illustration.cycleDays}-day illustrative cycle`;
}

export function projectSummaryRows(
    out: BankrollTimelineResult,
): readonly (readonly [string, string])[] {
    const lastIndex = out.days.length - 1;
    return [
        [
            'bankroll (P10 / P50 / P90)',
            `${formatCurrency(out.cashP10[lastIndex] ?? 0)} / ${formatCurrency(out.cashP50[lastIndex] ?? 0)} / ${formatCurrency(out.cashP90[lastIndex] ?? 0)}`,
        ],
        ['cumulative spend (P50)', formatCurrency(out.cumulativeSpendP50[lastIndex] ?? 0)],
        ['cumulative payouts (P50)', formatCurrency(out.payoutP50[lastIndex] ?? 0)],
        ['withdrawn (P50)', formatCurrency(out.withdrawnP50[lastIndex] ?? 0)],
        ['cards bought (median)', out.cardsBoughtP50.toFixed(1)],
        [
            'multiple (P50 cash / start)',
            multipleLabel(out.cashP50[0] ?? 0, out.cashP50[lastIndex] ?? 0),
        ],
        ['path ruin', formatPercent(out.pathRuin)],
        ['P(final net < 0)', formatPercent(out.pFinalNetNegative)],
        [
            'measured cycle days',
            out.measuredCycleDays === null
                ? 'n/a: no card ever paid out'
                : out.measuredCycleDays.toFixed(1),
        ],
    ];
}

function multipleLabel(start: number, end: number): string {
    return start <= 0 ? 'n/a' : `${(end / start).toFixed(2)}x`;
}
