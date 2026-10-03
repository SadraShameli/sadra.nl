import {
    CENTS_PER_DOLLAR,
    dollars,
    type Dollars,
    fraction,
    type Fraction0to1,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator/core';
import { mulberry32 } from '~/lib/prop-calculator/rng';
import { mean } from '~/lib/prop-calculator/stats';

import { bankrollAttemptsAt, bankrollCohortRisk } from './BankrollRiskFigures';
import { LOSS_RISK_DRAWS, MAX_COHORT_SAMPLES } from './CohortOutcome';
import {
    type EconomicsEstimate,
    EconomicsReason,
    isCount,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';
import {
    LossSampleUnit,
    MAX_LOSS_TARGET_CAP,
    minimumBudgetForLossTarget,
} from './LossRisk';

const HALF_CENT_LOSS = -0.5;

export interface CompoundMinimumBudgetInputs {
    readonly costPerAttempt: Dollars;
    readonly lossThreshold: Fraction0to1 | null;
    readonly netValues: readonly number[];
    readonly seed: number;
}

export interface LossProbabilityCurve {
    readonly cap: number;
    readonly draws: number;
    readonly probabilities: readonly Fraction0to1[];
}

export interface ProjectionMonthEnd {
    readonly cashP10: number;
    readonly cashP50: number;
    readonly cashP90: number;
    readonly day: number;
    readonly month: number;
    readonly payoutsP50: number;
    readonly spendP50: number;
}

export interface ProjectionMonthEndsInput {
    readonly cashP10: readonly number[];
    readonly cashP50: readonly number[];
    readonly cashP90: readonly number[];
    readonly cumulativeSpendP50: readonly number[];
    readonly days: readonly number[];
    readonly payoutP50: readonly number[];
}

export interface SpendPayoutPoint {
    readonly attempts: number;
    readonly budget: Dollars;
    readonly expectedNet: Dollars;
    readonly expectedPayouts: Dollars;
    readonly expectedSpend: Dollars;
    readonly lossProbability: EconomicsEstimate<Fraction0to1>;
    readonly netP10: Dollars;
    readonly netP90: Dollars;
}

export function compoundMinimumBudget(
    inputs: CompoundMinimumBudgetInputs,
): Quantity<Dollars> {
    const { costPerAttempt, lossThreshold, netValues, seed } = inputs;
    let curve: null | Quantity<LossProbabilityCurve> = null;
    return minimumBudgetForLossTarget({
        cap: MAX_LOSS_TARGET_CAP,
        costPerSample: costPerAttempt,
        costUnit: LossSampleUnit.Attempt,
        lossProbability: (attempts) => {
            curve ??= lossProbabilityCurve(
                netValues,
                MAX_LOSS_TARGET_CAP,
                LOSS_RISK_DRAWS,
                seed,
            );
            return curve.value === null
                ? 1
                : lossProbabilityAt(curve.value, attempts);
        },
        meanNetPerSample: dollars(mean(netValues)),
        sampleUnit: LossSampleUnit.Attempt,
        threshold: lossThreshold,
    });
}

export function impliedCycleMultiple(
    start: number,
    final: number,
    cycleDays: number,
    horizonDays: number,
): null | number {
    return !(start > 0) ||
        !(final >= 0) ||
        !(cycleDays > 0) ||
        !(horizonDays > 0)
        ? null
        : (final / start) ** (cycleDays / horizonDays);
}

export function lossProbabilityAt(
    curve: LossProbabilityCurve,
    attempts: number,
): Fraction0to1 {
    return curve.probabilities[attempts - 1] ?? fraction(1);
}

export function lossProbabilityCurve(
    netValues: readonly number[],
    cap: number,
    draws: number,
    seed: number,
): Quantity<LossProbabilityCurve> {
    if (
        netValues.length === 0 ||
        netValues.some((value) => !Number.isFinite(value)) ||
        !isCount(cap) ||
        cap < 1 ||
        cap > MAX_LOSS_TARGET_CAP ||
        !isCount(draws) ||
        draws < 1 ||
        draws * cap > MAX_COHORT_SAMPLES
    ) {
        return missingQuantity(EconomicsReason.InvalidInput);
    }
    const losses = new Uint32Array(cap);
    const cents = Float64Array.from(
        netValues,
        (value) => value * CENTS_PER_DOLLAR,
    );
    if (cents.every((value) => value >= 0)) {
        return curveOf(cap, draws, losses);
    }
    const rng = mulberry32(seed);
    const count = cents.length;
    for (let draw = 0; draw < draws; draw++) {
        let prefix = 0;
        for (let step = 0; step < cap; step++) {
            prefix += cents[Math.floor(rng() * count)] ?? 0;
            if (prefix < HALF_CENT_LOSS) {
                losses[step] = (losses[step] ?? 0) + 1;
            }
        }
    }
    return curveOf(cap, draws, losses);
}

export function projectionMonthEnds(
    result: ProjectionMonthEndsInput,
): readonly ProjectionMonthEnd[] {
    const lastIndex = result.days.length - 1;
    const rows: ProjectionMonthEnd[] = [];
    let previousIndex = 0;
    for (let month = 1; previousIndex < lastIndex; month++) {
        const index = Math.min(month * TRADING_DAYS_PER_MONTH, lastIndex);
        rows.push({
            cashP10: result.cashP10[index] ?? 0,
            cashP50: result.cashP50[index] ?? 0,
            cashP90: result.cashP90[index] ?? 0,
            day: result.days[index] ?? index,
            month,
            payoutsP50:
                (result.payoutP50[index] ?? 0) -
                (result.payoutP50[previousIndex] ?? 0),
            spendP50:
                (result.cumulativeSpendP50[index] ?? 0) -
                (result.cumulativeSpendP50[previousIndex] ?? 0),
        });
        previousIndex = index;
    }
    return rows;
}

export function spendPayoutCurve(
    netValues: readonly number[],
    feeValues: readonly number[],
    costPerAttempt: Dollars,
    budgets: readonly Dollars[],
    seed: number,
): Quantity<SpendPayoutPoint>[] {
    return budgets.map((budget) => {
        const attempts = bankrollAttemptsAt(budget, costPerAttempt);
        if (attempts === null) {
            return missingQuantity(EconomicsReason.InvalidInput);
        }
        const risk = bankrollCohortRisk(
            netValues,
            attempts,
            LOSS_RISK_DRAWS,
            seed,
            feeValues,
        );
        const cohort = risk.value;
        if (cohort === null) {
            return missingQuantity(EconomicsReason.InvalidInput);
        }
        const { expectedFees, expectedPayouts } = cohort;
        if (expectedFees === null || expectedPayouts === null) {
            return missingQuantity(EconomicsReason.InvalidInput);
        }
        return quantityOf(
            {
                attempts,
                budget,
                expectedNet: dollars(expectedPayouts - expectedFees),
                expectedPayouts,
                expectedSpend: expectedFees,
                lossProbability: cohort.lossProbability,
                netP10: cohort.netP10,
                netP90: cohort.netP90,
            },
            risk.disclosures,
        );
    });
}

function curveOf(
    cap: number,
    draws: number,
    losses: Uint32Array,
): Quantity<LossProbabilityCurve> {
    return quantityOf({
        cap,
        draws,
        probabilities: Array.from(losses, (count) => fraction(count / draws)),
    });
}
