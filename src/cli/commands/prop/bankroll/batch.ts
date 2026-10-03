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
import { dollars, type SimOutputs, simulate } from '~/lib/prop-calculator';
import {
    attemptEconomicsOfRun,
    bankrollCohortRisk,
    batchLossClosedForm,
    empiricalPayingStatsOf,
    LOSS_RISK_DRAWS,
} from '~/lib/prop-calculator/economics';

import {
    bankrollBatchArguments,
    type BankrollBatchInputs,
    readBankrollBatchInputs,
} from './bankrollFlags';

export const batchArguments = {
    ...planArguments,
    ...tradingArguments,
    ...bankrollBatchArguments,
};

export default defineCommand({
    args: batchArguments,
    meta: {
        description:
            'Price a batch of attempts on the simulated per-trial net distribution (cohortOutcome)',
        name: 'batch',
    },
    run(context) {
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            const batch = readBankrollBatchInputs(context.args);
            const simInputs = inputs.toSimInputs(plan);
            const out = simulate(simInputs);

            ui.heading(
                `${plan.label}: bankroll batch (${batch.attempts} attempts)`,
            );
            for (const line of pricedTriggerLines(simInputs)) {
                ui.muted(line);
            }

            const table = new TablePrinter([
                { align: 'left', label: '', width: 30 },
                { label: '', width: 0 },
            ]);
            for (const row of batchRows(
                out,
                batch,
                inputs.seed,
                inputs.fundedHorizonDays,
            )) {
                table.printRow(row);
            }
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function batchRows(
    out: SimOutputs,
    batch: BankrollBatchInputs,
    seed: number,
    fundedHorizonDays: number,
): readonly (readonly [string, string])[] {
    const outcome = bankrollCohortRisk(
        out.netValues,
        batch.attempts,
        LOSS_RISK_DRAWS,
        seed,
    ).value;
    const decomposition = attemptEconomicsOfRun(out, fundedHorizonDays);
    const fundedValueToAttemptCost =
        decomposition.value?.fundedValueToAttemptCost.value ?? null;

    return [
        [
            'EV over the batch',
            outcome === null ? 'n/a' : formatCurrency(outcome.meanNet),
        ],
        [
            'funded value / attempt cost',
            fundedValueToAttemptCost === null
                ? 'n/a'
                : `${fundedValueToAttemptCost.ratio.toFixed(2)}x`,
        ],
        [
            'P(net < 0)',
            outcome === null
                ? 'n/a'
                : `${formatPercent(outcome.lossProbability.value)} (SE ${formatPercent(outcome.lossProbability.standardError ?? 0)})`,
        ],
        [
            'cross-check: assumes one value per paying attempt',
            crossCheckLine(out, batch.attempts),
        ],
    ];
}

function crossCheckLine(out: SimOutputs, attempts: number): string {
    const { pAttemptPays, valuePerPayingAttempt } = empiricalPayingStatsOf(
        out.netValues,
        out.costPerAttempt,
    );
    const quantity = batchLossClosedForm({
        attemptCost: dollars(out.costPerAttempt),
        attempts,
        pAttemptPays,
        valuePerPayingAttempt,
    });
    return quantity.value === null ? 'n/a' : formatPercent(quantity.value);
}
