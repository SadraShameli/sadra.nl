export enum GainChanceBench {
    Fair = 'fair',
    Slim = 'slim',
    Strong = 'strong',
}

export enum LossChanceBench {
    High = 'high',
    Low = 'low',
    Moderate = 'moderate',
}

export enum TailRatioBench {
    DownsideHeavy = 'downside-heavy',
    Healthy = 'healthy',
    Marginal = 'marginal',
}

export function gainChanceBench(probability: number): GainChanceBench {
    if (probability > 0.5) return GainChanceBench.Strong;
    return probability > 0.25 ? GainChanceBench.Fair : GainChanceBench.Slim;
}

export function lossChanceBench(probability: number): LossChanceBench {
    if (probability > 0.25) return LossChanceBench.High;
    return probability > 0.1 ? LossChanceBench.Moderate : LossChanceBench.Low;
}

export function tailRatioBench(ratio: number): TailRatioBench {
    if (ratio > 1.5) return TailRatioBench.Healthy;
    return ratio > 1 ? TailRatioBench.Marginal : TailRatioBench.DownsideHeavy;
}
