import {
    edgePlausibility,
    type EdgePlausibilityInputs,
    PlausibilityLevel,
    type PlausibilityThresholds,
} from './EdgePlausibility';

export type EdgePlausibilityNoteInputs = Pick<
    EdgePlausibilityInputs,
    'rrRatio' | 'winrate'
>;

export const PLAUSIBILITY_LEVEL_TEXT: Readonly<
    Record<PlausibilityLevel, string>
> = {
    [PlausibilityLevel.Implausible]: 'Implausible edge',
    [PlausibilityLevel.NoEdge]: 'No edge',
    [PlausibilityLevel.Strong]: 'Strong edge',
    [PlausibilityLevel.Typical]: 'Typical edge',
};

export const QV20_EXPECTANCY_DISCLOSURE =
    'while QV-20 is open: this note uses +0.20R from 40% at 1:2, the trading skill computes +0.26R from the same inputs';

export function edgePlausibilityNoteText(
    inputs: EdgePlausibilityNoteInputs,
    thresholds: PlausibilityThresholds,
): null | string {
    const result = edgePlausibility({ ...inputs, thresholds });
    if (
        result.value === null ||
        result.value.level === PlausibilityLevel.Typical
    ) {
        return null;
    }
    const { expectancyR, level } = result.value;
    const sign = expectancyR >= 0 ? '+' : '-';
    const winratePercent = (inputs.winrate * 100).toFixed(0);
    return `${PLAUSIBILITY_LEVEL_TEXT[level]}: ${sign}${Math.abs(expectancyR).toFixed(2)}R per trade at ${winratePercent}% and 1:${inputs.rrRatio.toFixed(2)} (typical up to +${thresholds.typicalMaxExpectancyR.toFixed(2)}R, strong up to +${thresholds.strongMaxExpectancyR.toFixed(2)}R). ${QV20_EXPECTANCY_DISCLOSURE}.`;
}
