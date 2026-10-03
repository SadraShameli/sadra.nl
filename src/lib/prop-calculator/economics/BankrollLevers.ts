import {
    type Dollars,
    dollars,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator/core';

import { bankrollRisk } from './BankrollRiskFigures';
import {
    type EconomicsEstimate,
    EconomicsReason,
    missingQuantity,
    type Quantity,
    quantityOf,
} from './EdgeMath';

export enum BankrollLeverKind {
    Base = 'base',
    RequestSize = 'request-size',
    Risk = 'risk',
    TradesPerDay = 'trades-per-day',
}

export enum BankrollLeverLabel {
    ConflictsWithHardRule3 = 'what-if: conflicts with Hard Rule 3',
    RequestUnchanged = 'what-if: documented request unchanged',
}

export interface BankrollLeverOutputs {
    attemptPaysProbability: EconomicsEstimate<Fraction0to1>;
    costPerAttempt: Dollars;
    expectedMonthlyNet: EconomicsEstimate<Dollars>;
    expectedNetPerAttempt: EconomicsEstimate<Dollars>;
    netValues: readonly number[];
    passProbability: EconomicsEstimate<Fraction0to1>;
}

export interface BankrollLeverRow {
    attemptPaysProbability: EconomicsEstimate<Fraction0to1>;
    deltaAttemptPaysProbability: number;
    deltaEvPerAttempt: Dollars;
    deltaMonthlyNet: Dollars;
    deltaPassProbability: number;
    evPerAttempt: EconomicsEstimate<Dollars>;
    kind: BankrollLeverKind;
    label: BankrollLeverLabel | null;
    lossRisk: Quantity<EconomicsEstimate<Fraction0to1>>;
    monthlyNet: EconomicsEstimate<Dollars>;
    passProbability: EconomicsEstimate<Fraction0to1>;
    value: null | number;
}

export interface BankrollLeverVariant {
    kind:
        | BankrollLeverKind.RequestSize
        | BankrollLeverKind.Risk
        | BankrollLeverKind.TradesPerDay;
    outputs: BankrollLeverOutputs;
    value: number;
}

export interface EmpiricalPayingStats {
    pAttemptPays: Fraction0to1;
    valuePerPayingAttempt: Dollars;
}

export function bankrollLevers(
    base: BankrollLeverOutputs,
    variants: readonly BankrollLeverVariant[],
    bankroll: Dollars,
    seed: number,
): BankrollLeverRow[] {
    const baseRow = leverRow(
        BankrollLeverKind.Base,
        null,
        base,
        base,
        bankroll,
        seed,
        null,
    );
    return [
        baseRow,
        ...variants.map((variant) =>
            leverRow(
                variant.kind,
                variant.value,
                variant.outputs,
                base,
                bankroll,
                seed,
                labelFor(variant.kind),
            ),
        ),
    ];
}

export function empiricalPayingStatsOf(
    netValues: readonly number[],
    attemptCost: number,
): EmpiricalPayingStats {
    const paying = netValues.filter((value) => value > 0);
    const meanPaying =
        paying.length === 0
            ? 0
            : paying.reduce((sum, value) => sum + value, 0) / paying.length;
    return {
        pAttemptPays: fraction(
            netValues.length === 0 ? 0 : paying.length / netValues.length,
        ),
        valuePerPayingAttempt: dollars(meanPaying + attemptCost),
    };
}

function labelFor(kind: BankrollLeverVariant['kind']): BankrollLeverLabel {
    switch (kind) {
        case BankrollLeverKind.RequestSize: {
            return BankrollLeverLabel.RequestUnchanged;
        }
        case BankrollLeverKind.Risk:
        case BankrollLeverKind.TradesPerDay: {
            return BankrollLeverLabel.ConflictsWithHardRule3;
        }
    }
}

function leverRow(
    kind: BankrollLeverKind,
    value: null | number,
    outputs: BankrollLeverOutputs,
    base: BankrollLeverOutputs,
    bankroll: Dollars,
    seed: number,
    label: BankrollLeverLabel | null,
): BankrollLeverRow {
    const { lossProbability } = bankrollRisk(
        {
            attemptPaysProbability: outputs.attemptPaysProbability.value,
            costPerAttempt: outputs.costPerAttempt,
            netValues: outputs.netValues,
        },
        bankroll,
        seed,
    );
    const lossRisk =
        lossProbability === null
            ? missingQuantity(EconomicsReason.InvalidInput)
            : quantityOf(lossProbability);
    return {
        attemptPaysProbability: outputs.attemptPaysProbability,
        deltaAttemptPaysProbability:
            outputs.attemptPaysProbability.value -
            base.attemptPaysProbability.value,
        deltaEvPerAttempt: dollars(
            outputs.expectedNetPerAttempt.value -
                base.expectedNetPerAttempt.value,
        ),
        deltaMonthlyNet: dollars(
            outputs.expectedMonthlyNet.value - base.expectedMonthlyNet.value,
        ),
        deltaPassProbability:
            outputs.passProbability.value - base.passProbability.value,
        evPerAttempt: outputs.expectedNetPerAttempt,
        kind,
        label,
        lossRisk,
        monthlyNet: outputs.expectedMonthlyNet,
        passProbability: outputs.passProbability,
        value,
    };
}
