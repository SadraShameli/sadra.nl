export enum RecoveryTaxBench {
    Heavy = 'heavy',
    Light = 'light',
    Moderate = 'moderate',
}

export function recoveryTaxBench(gainRequired: number): RecoveryTaxBench {
    if (gainRequired < 0.12) return RecoveryTaxBench.Light;
    return gainRequired < 0.25
        ? RecoveryTaxBench.Moderate
        : RecoveryTaxBench.Heavy;
}
