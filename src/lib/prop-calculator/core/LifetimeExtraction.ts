export interface LifetimeExtractionCycle {
    costOfOneMoreAttempt: number;
    expectedNet: number;
    fundedBustProbability: number;
}

export function lifetimeExpectedNet(perCycle: LifetimeExtractionCycle): number {
    const { costOfOneMoreAttempt, expectedNet, fundedBustProbability } =
        perCycle;
    if (fundedBustProbability >= 1) {
        throw new Error(
            `lifetimeExpectedNet: fundedBustProbability must be < 1, got ${fundedBustProbability}`,
        );
    }
    return (
        (expectedNet - fundedBustProbability * costOfOneMoreAttempt) /
        (1 - fundedBustProbability)
    );
}
