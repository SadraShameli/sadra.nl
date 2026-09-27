export enum FunnelDiagnosticReason {
    ModeledFiguresMissing = 'modeled-figures-missing',
}

export enum FunnelStage {
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
      }
    | {
          readonly modeledEvPerAttempt: number;
          readonly realizedEvPerAttempt: number;
          readonly reason: null;
          readonly stages: readonly FunnelStageDiagnosis[];
      };

export interface FunnelStageDiagnosis {
    readonly dollarChangePerAttempt: number;
    readonly dollarChangePerMonth: number;
    readonly stage: FunnelStage;
}

export interface FunnelStageFigures {
    readonly attemptCost: number;
    readonly averagePayout: number;
    readonly passRate: number;
    readonly payoutRate: number;
    readonly payoutsPerPaidFunded: number;
}

const FUNNEL_STAGES: readonly FunnelStage[] = [
    FunnelStage.PassRate,
    FunnelStage.PayoutRate,
    FunnelStage.PayoutsPerPaidFunded,
    FunnelStage.AveragePayout,
];

export function evPerAttemptOf(figures: FunnelStageFigures): number {
    return (
        figures.passRate *
            figures.payoutRate *
            figures.payoutsPerPaidFunded *
            figures.averagePayout -
        figures.attemptCost
    );
}

export function funnelDiagnostic(
    realized: FunnelStageFigures,
    modeled: FunnelStageFigures | null,
    attemptsPerMonth: number,
): FunnelDiagnostic {
    if (modeled === null) {
        return {
            modeledEvPerAttempt: null,
            realizedEvPerAttempt: null,
            reason: FunnelDiagnosticReason.ModeledFiguresMissing,
            stages: null,
        };
    }
    const modeledEvPerAttempt = evPerAttemptOf(modeled);
    const stages = FUNNEL_STAGES.map((stage) => {
        const swapped = swapStage(modeled, realized, stage);
        const dollarChangePerAttempt =
            evPerAttemptOf(swapped) - modeledEvPerAttempt;
        return {
            dollarChangePerAttempt,
            dollarChangePerMonth: dollarChangePerAttempt * attemptsPerMonth,
            stage,
        };
    }).toSorted(
        (a, b) => a.dollarChangePerAttempt - b.dollarChangePerAttempt,
    );
    return {
        modeledEvPerAttempt,
        realizedEvPerAttempt: evPerAttemptOf(realized),
        reason: null,
        stages,
    };
}

function swapStage(
    modeled: FunnelStageFigures,
    realized: FunnelStageFigures,
    stage: FunnelStage,
): FunnelStageFigures {
    switch (stage) {
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
