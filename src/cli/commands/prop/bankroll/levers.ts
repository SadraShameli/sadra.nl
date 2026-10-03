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
    dollars,
    fraction,
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import {
    BankrollLeverKind,
    type BankrollLeverOutputs,
    type BankrollLeverRow,
    bankrollLevers,
    type BankrollLeverVariant,
    type EconomicsEstimate,
} from '~/lib/prop-calculator/economics';

import {
    assertSingleAttemptPricing,
    bankrollLeversArguments,
    type BankrollLeversInputs,
    readBankrollLeversInputs,
} from './bankrollFlags';

export const leversArguments = {
    ...planArguments,
    ...tradingArguments,
    ...bankrollLeversArguments,
};

export default defineCommand({
    args: leversArguments,
    meta: {
        description:
            'Reprice risk, trades-per-day and payout-request-size what-ifs on the same seed, with the loss risk at a bankroll',
        name: 'levers',
    },
    run(context) {
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            assertSingleAttemptPricing(inputs);
            const levers = readBankrollLeversInputs(context.args);

            const baseInputs = inputs.toSimInputs(plan);
            const baseOut = simulate(baseInputs);
            const base = toBankrollLeverOutputs(baseOut);
            const variants = leverVariants(inputs, plan, levers);
            const rows = bankrollLevers(
                base,
                variants,
                levers.bankroll,
                inputs.seed,
            );

            ui.heading(`${plan.label}: bankroll levers`);
            for (const line of pricedTriggerLines(baseInputs)) {
                ui.muted(line);
            }
            ui.muted(`  bankroll ${formatCurrency(levers.bankroll)}\n`);

            const table = new TablePrinter([
                { align: 'left', label: 'lever', width: 18 },
                { align: 'right', label: 'P(pass)', width: 20 },
                { align: 'right', label: 'P(pass) chg', width: 12 },
                { align: 'right', label: 'P(pays)', width: 20 },
                { align: 'right', label: 'P(pays) chg', width: 12 },
                { align: 'right', label: 'EV/attempt', width: 12 },
                { align: 'right', label: 'monthly net', width: 14 },
                { align: 'right', label: 'loss risk', width: 20 },
                { align: 'right', label: 'loss risk chg', width: 14 },
                { align: 'left', label: 'note', width: 44 },
            ]);
            table.printHeader();
            for (const row of rows) {
                table.printRow(leverRowCells(row));
            }
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function leverRowCells(row: BankrollLeverRow): readonly string[] {
    return [
        row.kind === BankrollLeverKind.Base
            ? 'base'
            : `${row.kind} ${row.value ?? ''}`.trim(),
        estimateCell(row.passProbability),
        changeCell(row.deltaPassProbability),
        estimateCell(row.attemptPaysProbability),
        changeCell(row.deltaAttemptPaysProbability),
        formatCurrency(row.evPerAttempt.value),
        formatCurrency(row.monthlyNet.value),
        row.lossRisk.value === null ? 'n/a' : estimateCell(row.lossRisk.value),
        changeCell(row.deltaLossProbability),
        row.label ?? '',
    ];
}

export function leverVariants(
    inputs: TradingInputs,
    plan: Plan,
    levers: BankrollLeversInputs,
): BankrollLeverVariant[] {
    const variants: BankrollLeverVariant[] = [];
    const risks = levers.risks ?? [
        inputs.riskPerTrade * 0.5,
        inputs.riskPerTrade * 1.5,
    ];
    for (const risk of risks) {
        const outputs = variantOutputsFor(inputs, plan, { riskPerTrade: risk });
        variants.push({ kind: BankrollLeverKind.Risk, outputs, value: risk });
    }

    const tradesPerDayValues = levers.tradesPerDay ?? [
        Math.max(1, inputs.tradesPerDay - 1),
        inputs.tradesPerDay + 1,
    ];
    for (const tradesPerDay of tradesPerDayValues) {
        const outputs = variantOutputsFor(inputs, plan, { tradesPerDay });
        variants.push({
            kind: BankrollLeverKind.TradesPerDay,
            outputs,
            value: tradesPerDay,
        });
    }

    if (levers.requestSizes !== null) {
        for (const requestSize of levers.requestSizes) {
            const outputs = variantOutputsFor(inputs, plan, {
                payoutRequestSize: requestSize,
            });
            variants.push({
                kind: BankrollLeverKind.RequestSize,
                outputs,
                value: requestSize,
            });
        }
    }

    return variants;
}

function changeCell(delta: null | number): string {
    if (delta === null) return 'n/a';
    const points = (delta * 100).toFixed(1);
    return delta > 0 ? `+${points} pts` : `${points} pts`;
}

function estimateCell(estimate: EconomicsEstimate): string {
    return estimate.standardError === null
        ? formatPercent(estimate.value)
        : `${formatPercent(estimate.value)} (SE ${formatPercent(estimate.standardError)})`;
}

function toBankrollLeverOutputs(out: SimOutputs): BankrollLeverOutputs {
    return {
        attemptPaysProbability: {
            standardError: out.estimates.attemptPaysProbability.standardError,
            value: fraction(out.attemptPaysProbability),
        },
        costPerAttempt: dollars(out.costPerAttempt),
        expectedMonthlyNet: {
            standardError: out.estimates.expectedMonthlyNet.standardError,
            value: dollars(out.expectedMonthlyNet),
        },
        expectedNetPerAttempt: {
            standardError: out.estimates.expectedNetPerAttempt.standardError,
            value: dollars(out.expectedNetPerAttempt),
        },
        netValues: out.netValues,
        passProbability: {
            standardError: out.estimates.attemptPassProbability.standardError,
            value: fraction(out.attemptPassProbability),
        },
    };
}

function variantOutputsFor(
    inputs: TradingInputs,
    plan: Plan,
    overrides: Partial<SimInputs>,
): BankrollLeverOutputs {
    const simInputs: SimInputs = { ...inputs.toSimInputs(plan), ...overrides };
    return toBankrollLeverOutputs(simulate(simInputs));
}
