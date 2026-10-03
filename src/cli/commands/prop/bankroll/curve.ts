import { defineCommand } from 'citty';

import {
    planArguments,
    planResolver,
    pricedTriggerLines,
    TablePrinter,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type Dollars,
    dollars,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import { spendPayoutCurve } from '~/lib/prop-calculator/economics';

import {
    assertSingleAttemptPricing,
    bankrollCurveArguments,
    readBankrollCurveInputs,
} from './bankrollFlags';

export const curveArguments = {
    ...planArguments,
    ...tradingArguments,
    ...bankrollCurveArguments,
};

export default defineCommand({
    args: curveArguments,
    meta: {
        description:
            'Price the spend-vs-payout curve over bankroll budgets: expected spend, expected payouts, net band and P(net < 0) per budget',
        name: 'curve',
    },
    run(context) {
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            assertSingleAttemptPricing(inputs);
            const { budgets } = readBankrollCurveInputs(context.args);
            const simInputs = inputs.toSimInputs(plan);
            const out = simulate(simInputs);

            ui.heading(`${plan.label}: bankroll spend vs payout curve`);
            for (const line of pricedTriggerLines(simInputs)) {
                ui.muted(line);
            }
            ui.muted(
                `  every trial is one attempt at ${formatCurrency(out.costPerAttempt)}\n`,
            );

            const table = new TablePrinter([
                { align: 'right', label: 'budget', width: 12 },
                { align: 'right', label: 'attempts', width: 9 },
                { align: 'right', label: 'expected spend', width: 16 },
                { align: 'right', label: 'expected payouts', width: 18 },
                { align: 'right', label: 'expected net', width: 14 },
                { align: 'right', label: 'net P10', width: 12 },
                { align: 'right', label: 'net P90', width: 12 },
                { align: 'right', label: 'P(net < 0)', width: 20 },
            ]);
            table.printHeader();
            for (const row of curveRows(out, budgets, inputs.seed)) {
                table.printRow(row);
            }
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function curveRows(
    out: SimOutputs,
    budgets: readonly Dollars[],
    seed: number,
): readonly (readonly string[])[] {
    const points = spendPayoutCurve(
        out.netValues,
        out.netValues.map(() => out.costPerAttempt),
        dollars(out.costPerAttempt),
        budgets,
        seed,
    );
    return points.map((point, index) => {
        const budget = formatCurrency(budgets[index] ?? 0);
        if (point.value === null) {
            return [budget, 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a'];
        }
        const { lossProbability } = point.value;
        return [
            budget,
            String(point.value.attempts),
            formatCurrency(point.value.expectedSpend),
            formatCurrency(point.value.expectedPayouts),
            formatCurrency(point.value.expectedNet),
            formatCurrency(point.value.netP10),
            formatCurrency(point.value.netP90),
            lossProbability.standardError === null
                ? formatPercent(lossProbability.value)
                : `${formatPercent(lossProbability.value)} (SE ${formatPercent(lossProbability.standardError)})`,
        ];
    });
}
