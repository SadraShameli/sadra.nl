import { formatCurrency, formatPercent } from '~/lib/format';
import { TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core';

import { compoundedMultiple } from './EdgeMath';
import {
    edgePlausibility,
    type EdgePlausibilityInputs,
    PlausibilityLevel,
    type PlausibilityThresholds,
} from './EdgePlausibility';

export type EdgePlausibilityNoteInputs = Pick<
    EdgePlausibilityInputs,
    'rrRatio' | 'winrate'
> & {
    compoundStartDollars?: number;
    tradesPerDay?: number;
};

const GROUPED_MULTIPLE = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

const KELLY_INFORMATION_LABEL =
    'information, not sizing; Kelly is not prop-firm sizing';

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
    const { expectancyR, kellyGrowthPerTrade, level } = result.value;
    const sign = expectancyR >= 0 ? '+' : '-';
    const winratePercent = (inputs.winrate * 100).toFixed(0);
    const note = `${PLAUSIBILITY_LEVEL_TEXT[level]}: ${sign}${Math.abs(expectancyR).toFixed(2)}R per trade at ${winratePercent}% and 1:${inputs.rrRatio.toFixed(2)} (typical up to +${thresholds.typicalMaxExpectancyR.toFixed(2)}R, strong up to +${thresholds.strongMaxExpectancyR.toFixed(2)}R). ${QV20_EXPECTANCY_DISCLOSURE}.`;
    return kellyGrowthPerTrade.value === null
        ? note
        : `${note} ${kellyGrowthText(kellyGrowthPerTrade.value, inputs)}`;
}

function kellyGrowthText(
    growthPerTrade: number,
    inputs: EdgePlausibilityNoteInputs,
): string {
    const growth = `Full Kelly would grow a bankroll ${formatPercent(Math.expm1(growthPerTrade), 2)} per trade`;
    const pace = paceText(growthPerTrade, inputs);
    return pace === null
        ? `${growth} (${KELLY_INFORMATION_LABEL}).`
        : `${growth}; ${pace} (${KELLY_INFORMATION_LABEL}).`;
}

function paceText(
    growthPerTrade: number,
    { compoundStartDollars, tradesPerDay }: EdgePlausibilityNoteInputs,
): null | string {
    if (
        tradesPerDay === undefined ||
        !Number.isFinite(tradesPerDay) ||
        tradesPerDay <= 0
    ) {
        return null;
    }
    const multiple = compoundedMultiple(
        growthPerTrade,
        Math.round(tradesPerDay * TRADING_DAYS_PER_MONTH),
    ).value;
    const pace = `at ${String(tradesPerDay)} trades per day over ${String(TRADING_DAYS_PER_MONTH)} trading days that compounds to`;
    if (multiple === null || !Number.isFinite(multiple)) {
        return `${pace} a multiple too large to show`;
    }
    const compounded = `${pace} ${GROUPED_MULTIPLE.format(multiple)}x`;
    return compoundStartDollars === undefined ||
        !Number.isFinite(compoundStartDollars) ||
        compoundStartDollars <= 0
        ? compounded
        : `${compounded}, so ${formatCurrency(compoundStartDollars)} becomes ${formatCurrency(compoundStartDollars * multiple)}`;
}
