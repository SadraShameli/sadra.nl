import { formatCurrency, formatPercent, formatR } from '~/lib/format';
import { TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core';

import { compoundedMultiple } from './EdgeMath';
import {
    EDGE_COMPARISON_TOLERANCE,
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

interface SecondExpectancySource {
    readonly confirmedRrRatio: number;
    readonly confirmedWinrate: number;
    readonly skillExpectancyR: number;
}

const GROUPED_MULTIPLE = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

const MAX_SHOWN_COMPOUNDED_MULTIPLE = 1000;

const TRADING_SKILL_EXPECTANCY: SecondExpectancySource = {
    confirmedRrRatio: 2,
    confirmedWinrate: 0.4,
    skillExpectancyR: 0.26,
};

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
    const plausibility = `${PLAUSIBILITY_LEVEL_TEXT[level]}: ${sign}${Math.abs(expectancyR).toFixed(2)}R per trade at ${winratePercent}% and 1:${inputs.rrRatio.toFixed(2)} (typical up to +${thresholds.typicalMaxExpectancyR.toFixed(2)}R, strong up to +${thresholds.strongMaxExpectancyR.toFixed(2)}R).`;
    const secondSource = secondSourceText(inputs);
    const note =
        secondSource === null
            ? plausibility
            : `${plausibility} ${secondSource}`;
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
    if (multiple > MAX_SHOWN_COMPOUNDED_MULTIPLE) {
        return `${pace} more than ${GROUPED_MULTIPLE.format(MAX_SHOWN_COMPOUNDED_MULTIPLE)}x`;
    }
    const compounded = `${pace} ${GROUPED_MULTIPLE.format(multiple)}x`;
    return compoundStartDollars === undefined ||
        !Number.isFinite(compoundStartDollars) ||
        compoundStartDollars <= 0
        ? compounded
        : `${compounded}, so ${formatCurrency(compoundStartDollars)} becomes ${formatCurrency(compoundStartDollars * multiple)}`;
}

function secondSourceText({
    rrRatio,
    winrate,
}: EdgePlausibilityNoteInputs): null | string {
    const { confirmedRrRatio, confirmedWinrate, skillExpectancyR } =
        TRADING_SKILL_EXPECTANCY;
    const isConfirmedEdge =
        Math.abs(winrate - confirmedWinrate) <= EDGE_COMPARISON_TOLERANCE &&
        Math.abs(rrRatio - confirmedRrRatio) <= EDGE_COMPARISON_TOLERANCE;
    return isConfirmedEdge
        ? `The trading skill's own numbers put this edge at ${formatR(skillExpectancyR)}.`
        : null;
}
