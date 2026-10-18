import { dollars, fraction } from '~/lib/prop-calculator/core';
import {
    attemptEconomics,
    fundedValueFrom,
} from '~/lib/prop-calculator/economics';

export enum FunnelDiagnosticReason {
    InvalidFigures = 'invalid-figures',
    ModeledFiguresMissing = 'modeled-figures-missing',
}

export enum FunnelStage {
    AttemptCost = 'attempt-cost',
    AveragePayout = 'average-payout',
    PassRate = 'pass-rate',
    PayoutRate = 'payout-rate',
    PayoutsPerPaidFunded = 'payouts-per-paid-funded',
}

export type FunnelDiagnostic =
    | {
          readonly modeledEvPerAttempt: null;
          readonly realizedEvPerAttempt: null;
          readonly reason: FunnelDiagnosticReason;
          readonly stages: null;
          readonly untestedStages: null;
      }
    | {
          readonly modeledEvPerAttempt: number;
          readonly realizedEvPerAttempt: number;
          readonly reason: null;
          readonly stages: readonly FunnelStageDiagnosis[];
          readonly untestedStages: readonly FunnelStageDiagnosis[];
      };

export interface FunnelStageDiagnosis {
    readonly dollarChangePerAttempt: number;
    readonly dollarChangePerMonth: number;
    readonly isBeyondNoise: boolean | null;
    readonly stage: FunnelStage;
}

export interface FunnelStageFigures {
    readonly attemptCost: number;
    readonly averagePayout: number;
    readonly passRate: number;
    readonly payoutRate: number;
    readonly payoutsPerPaidFunded: number;
}

type TestedFunnelStage = Exclude<
    FunnelStage,
    FunnelStage.AveragePayout | FunnelStage.PayoutsPerPaidFunded
>;

const FUNNEL_STAGES: readonly FunnelStage[] = [
    FunnelStage.AttemptCost,
    FunnelStage.PassRate,
    FunnelStage.PayoutRate,
    FunnelStage.PayoutsPerPaidFunded,
    FunnelStage.AveragePayout,
];

export function evPerAttemptOf(figures: FunnelStageFigures): null | number {
    const fundedValue = fundedValueFrom({
        averagePayout: dollars(figures.averagePayout),
        payoutProbabilityGivenFunded: fraction(figures.payoutRate),
        payoutsPerPaidFunded: figures.payoutsPerPaidFunded,
    });
    if (fundedValue.value === null) return null;
    return (
        attemptEconomics({
            attemptCost: dollars(figures.attemptCost),
            fundedValue: fundedValue.value,
            passProbability: fraction(figures.passRate),
        }).value?.expectedNetPerAttempt ?? null
    );
}

export function funnelDiagnostic(
    realized: FunnelStageFigures,
    modeled: FunnelStageFigures | null,
    attemptsPerMonth: number,
    noiseVerdicts: Readonly<Partial<Record<TestedFunnelStage, boolean>>> = {},
): FunnelDiagnostic {
    if (modeled === null)
        return missingDiagnostic(FunnelDiagnosticReason.ModeledFiguresMissing);
    const modeledEvPerAttempt = evPerAttemptOf(modeled);
    const realizedEvPerAttempt = evPerAttemptOf(realized);
    const swappedEvs = FUNNEL_STAGES.map((stage) => ({
        evPerAttempt: evPerAttemptOf(swapStage(modeled, realized, stage)),
        stage,
    }));
    if (
        modeledEvPerAttempt === null ||
        realizedEvPerAttempt === null ||
        swappedEvs.some((entry) => entry.evPerAttempt === null)
    ) {
        return missingDiagnostic(FunnelDiagnosticReason.InvalidFigures);
    }
    const stages = swappedEvs
        .map(({ evPerAttempt, stage }) => {
            const dollarChangePerAttempt =
                (evPerAttempt ?? modeledEvPerAttempt) - modeledEvPerAttempt;
            return {
                dollarChangePerAttempt,
                dollarChangePerMonth: dollarChangePerAttempt * attemptsPerMonth,
                isBeyondNoise: isStageTested(stage)
                    ? (noiseVerdicts[stage] ?? null)
                    : null,
                stage,
            };
        })
        .toSorted(
            (a, b) => a.dollarChangePerAttempt - b.dollarChangePerAttempt,
        );
    return {
        modeledEvPerAttempt,
        realizedEvPerAttempt,
        reason: null,
        stages,
        untestedStages: stages.filter((row) => !isStageTested(row.stage)),
    };
}

function isStageTested(stage: FunnelStage): stage is TestedFunnelStage {
    switch (stage) {
        case FunnelStage.AttemptCost:
        case FunnelStage.PassRate:
        case FunnelStage.PayoutRate: {
            return true;
        }
        case FunnelStage.AveragePayout:
        case FunnelStage.PayoutsPerPaidFunded: {
            return false;
        }
    }
}

function missingDiagnostic(reason: FunnelDiagnosticReason): FunnelDiagnostic {
    return {
        modeledEvPerAttempt: null,
        realizedEvPerAttempt: null,
        reason,
        stages: null,
        untestedStages: null,
    };
}

function swapStage(
    modeled: FunnelStageFigures,
    realized: FunnelStageFigures,
    stage: FunnelStage,
): FunnelStageFigures {
    switch (stage) {
        case FunnelStage.AttemptCost: {
            return { ...modeled, attemptCost: realized.attemptCost };
        }
        case FunnelStage.AveragePayout: {
            return { ...modeled, averagePayout: realized.averagePayout };
        }
        case FunnelStage.PassRate: {
            return { ...modeled, passRate: realized.passRate };
        }
        case FunnelStage.PayoutRate: {
            return { ...modeled, payoutRate: realized.payoutRate };
        }
        case FunnelStage.PayoutsPerPaidFunded: {
            return {
                ...modeled,
                payoutsPerPaidFunded: realized.payoutsPerPaidFunded,
            };
        }
    }
}
