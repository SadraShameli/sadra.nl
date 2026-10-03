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
    fraction,
    type Fraction0to1,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';
import {
    bankrollLossRiskSummary,
    type BankrollRisk,
    bankrollRisk,
    EconomicsReason,
} from '~/lib/prop-calculator/economics';

import {
    bankrollRiskArguments,
    type BankrollRiskInputs,
    readBankrollRiskInputs,
} from './bankrollFlags';

export const riskArguments = {
    ...planArguments,
    ...tradingArguments,
    ...bankrollRiskArguments,
};

const OVERRIDE_NOTE =
    'override is an input, not derived from your win rate, rr and risk';

export default defineCommand({
    args: riskArguments,
    meta: {
        description:
            'Price a bankroll budget against one plan: attempts affordable, P(batch net < 0) and the minimum budget for a loss target',
        name: 'risk',
    },
    run(context) {
        try {
            const plan = planResolver.resolveOne(context.args);
            const inputs = TradingInputs.parse(context.args);
            const risk = readBankrollRiskInputs(context.args);
            const simInputs = inputs.toSimInputs(plan);
            const out = simulate(simInputs);

            ui.heading(`${plan.label}: bankroll risk`);
            for (const line of pricedTriggerLines(simInputs)) {
                ui.muted(line);
            }
            ui.muted(`  budget ${formatCurrency(risk.budget)}\n`);

            const table = new TablePrinter([
                { align: 'left', label: '', width: 26 },
                { label: '', width: 0 },
            ]);
            for (const row of riskRows(out, risk, inputs.seed)) {
                table.printRow(row);
            }
        } catch (error) {
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});

export function riskRows(
    out: SimOutputs,
    risk: BankrollRiskInputs,
    seed: number,
): readonly (readonly [string, string])[] {
    const passRate =
        risk.passRateOverride ?? fraction(out.attemptPassProbability);
    const payoutRate =
        risk.payoutRateOverride ?? fraction(out.attemptPaysProbability);
    const exposure = bankrollRisk(
        out,
        risk.budget,
        seed,
        risk.payoutRateOverride ?? undefined,
    );
    const { attempts } = exposure;

    const rows: (readonly [string, string])[] = [
        ['attempt cost', formatCurrency(out.costPerAttempt)],
        ['attempts affordable', attempts === null ? 'n/a' : String(attempts)],
        ['P(attempt pays)', rateLine(payoutRate, risk.payoutRateOverride)],
        [
            'P(batch net < 0)',
            batchLossLine(exposure),
        ],
        [
            `P(no payout from ${attempts ?? 0} attempts)`,
            noPayoutLine(exposure),
        ],
        ['minimum budget for the loss target', minimumBudgetLine(out, risk)],
    ];

    if (risk.passRateOverride !== null) {
        rows.splice(1, 0, [
            'P(pass per attempt)',
            rateLine(passRate, risk.passRateOverride),
        ]);
    }

    return rows;
}

function batchLossLine(exposure: BankrollRisk): string {
    if (exposure.lossProbability === null) return 'n/a';
    const { standardError, value } = exposure.lossProbability;
    return standardError === null
        ? formatPercent(value)
        : `${formatPercent(value)} (SE ${formatPercent(standardError)})`;
}

function minimumBudgetLine(out: SimOutputs, risk: BankrollRiskInputs): string {
    const summary = bankrollLossRiskSummary(
        out.netValues,
        out.costPerAttempt,
        risk.lossThreshold,
    );
    if (summary.minimumBudget.reason === EconomicsReason.NoPositiveEdge) {
        return 'no positive edge';
    }
    if (summary.minimumBudget.reason === EconomicsReason.ThresholdNotSet) {
        return 'threshold not set';
    }
    return summary.minimumBudget.value === null
        ? 'n/a'
        : formatCurrency(summary.minimumBudget.value.budget);
}

function noPayoutLine(exposure: BankrollRisk): string {
    return exposure.noPayoutProbability === null
        ? 'n/a'
        : `${formatPercent(exposure.noPayoutProbability, 3)} (ignores payout size)`;
}

function rateLine(rate: Fraction0to1, override: Fraction0to1 | null): string {
    return override === null
        ? formatPercent(rate)
        : `${formatPercent(rate)} (${OVERRIDE_NOTE})`;
}
