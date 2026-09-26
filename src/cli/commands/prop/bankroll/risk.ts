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
import { dollars, fraction, type Fraction0to1, type SimOutputs, simulate } from '~/lib/prop-calculator';
import {
    attemptsAffordable,
    batchLossClosedForm,
    cohortOutcome,
    empiricalPayingStatsOf,
    LossSampleUnit,
    MAX_LOSS_TARGET_CAP,
    minimumBudgetForLossTarget,
    noPayoutProbability,
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
const LOSS_RISK_DRAWS = 10_000;

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
            const out = simulate(inputs.toSimInputs(plan));

            ui.heading(`${plan.label}: bankroll risk`);
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
    const passRate = risk.passRateOverride ?? fraction(out.attemptPassProbability);
    const payoutRate =
        risk.payoutRateOverride ?? fraction(out.attemptPaysProbability);
    const attemptsQuantity = attemptsAffordable(
        risk.budget,
        dollars(out.costPerAttempt),
    );
    const attempts = attemptsQuantity.value;

    const rows: (readonly [string, string])[] = [
        ['attempt cost', formatCurrency(out.costPerAttempt)],
        [
            'attempts affordable',
            attempts === null ? 'n/a' : String(attempts),
        ],
        ['P(attempt pays)', rateLine(payoutRate, risk.payoutRateOverride)],
        [
            'P(batch net < 0)',
            attempts === null
                ? 'n/a'
                : batchLossLine(out.netValues, attempts, seed),
        ],
        [
            `P(no payout from ${attempts ?? 0} attempts)`,
            attempts === null
                ? 'n/a'
                : noPayoutLine(payoutRate, attempts),
        ],
        [
            'minimum budget for the loss target',
            minimumBudgetLine(out, risk),
        ],
    ];

    if (risk.passRateOverride !== null) {
        rows.splice(1, 0, [
            'P(pass per attempt)',
            rateLine(passRate, risk.passRateOverride),
        ]);
    }

    return rows;
}

function batchLossLine(
    netValues: readonly number[],
    attempts: number,
    seed: number,
): string {
    const outcome = cohortOutcome(netValues, attempts, LOSS_RISK_DRAWS, seed);
    if (outcome.value === null) return 'n/a';
    const { standardError, value } = outcome.value.lossProbability;
    return standardError === null
        ? formatPercent(value)
        : `${formatPercent(value)} (SE ${formatPercent(standardError)})`;
}

function minimumBudgetLine(out: SimOutputs, risk: BankrollRiskInputs): string {
    const meanNet =
        out.netValues.reduce((sum, value) => sum + value, 0) /
        Math.max(1, out.netValues.length);
    if (meanNet <= 0) return 'no positive edge';
    if (risk.lossThreshold === null) return 'threshold not set';
    const attemptCost = dollars(out.costPerAttempt);
    const { pAttemptPays, valuePerPayingAttempt } = empiricalPayingStatsOf(
        out.netValues,
        out.costPerAttempt,
    );
    const quantity = minimumBudgetForLossTarget({
        cap: MAX_LOSS_TARGET_CAP,
        costPerSample: attemptCost,
        costUnit: LossSampleUnit.Attempt,
        lossProbability: (samples) => {
            const outcome = batchLossClosedForm({
                attemptCost,
                attempts: samples,
                pAttemptPays,
                valuePerPayingAttempt,
            });
            return outcome.value ?? 1;
        },
        meanNetPerSample: dollars(meanNet),
        sampleUnit: LossSampleUnit.Attempt,
        threshold: risk.lossThreshold,
    });
    return quantity.value === null ? 'n/a' : formatCurrency(quantity.value);
}

function noPayoutLine(payoutRate: Fraction0to1, attempts: number): string {
    const quantity = noPayoutProbability(payoutRate, attempts);
    return quantity.value === null
        ? 'n/a'
        : `${formatPercent(quantity.value, 3)} (ignores payout size)`;
}

function rateLine(rate: Fraction0to1, override: Fraction0to1 | null): string {
    return override === null
        ? formatPercent(rate)
        : `${formatPercent(rate)} (${OVERRIDE_NOTE})`;
}
