export enum RecoveryTimeBench {
    Fast = 'fast',
    Moderate = 'moderate',
    Slow = 'slow',
}

export enum UnderwaterBench {
    Brief = 'brief',
    Moderate = 'moderate',
    Prolonged = 'prolonged',
}

export enum VShapeBench {
    Mixed = 'mixed',
    MostlyFast = 'mostly fast',
    MostlySlow = 'mostly slow',
}

export function recoveryTimeBench(days: number): RecoveryTimeBench {
    if (days < 3) return RecoveryTimeBench.Fast;
    return days < 10 ? RecoveryTimeBench.Moderate : RecoveryTimeBench.Slow;
}

export function underwaterBench(share: number): UnderwaterBench {
    if (share < 0.2) return UnderwaterBench.Brief;
    return share < 0.4 ? UnderwaterBench.Moderate : UnderwaterBench.Prolonged;
}

export function vShapeBench(share: number): VShapeBench {
    if (share > 0.6) return VShapeBench.MostlyFast;
    return share > 0.3 ? VShapeBench.Mixed : VShapeBench.MostlySlow;
}
