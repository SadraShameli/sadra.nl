import { type Fraction0to1 } from '~/lib/prop-calculator/core';

import {
    MAX_WALK_CELLS,
    MAX_WALK_RATIO_DENOMINATOR,
    MAX_WALK_WORK,
} from './WalkLimits';

const GROUPED_COUNT = new Intl.NumberFormat('en-US');

export enum EconomicsDisclosure {
    DeterministicIllustration = 'deterministic-illustration',
    DiscreteSawtooth = 'discrete-sawtooth',
    KellyNotPropSizing = 'kelly-not-prop-sizing',
    NearFreshEvalApproximation = 'near-fresh-eval-approximation',
    NoPayoutIgnoresPayoutSize = 'no-payout-ignores-payout-size',
    OnePayoutPerPayingAccount = 'one-payout-per-paying-account',
    OneValuePerPayingAttempt = 'one-value-per-paying-attempt',
    RandomWalkApproximation = 'random-walk-approximation',
    RebuyLagNotPriced = 'rebuy-lag-not-priced',
}

export const ECONOMICS_DISCLOSURE_TEXT: Readonly<
    Record<EconomicsDisclosure, string>
> = {
    [EconomicsDisclosure.DeterministicIllustration]:
        'not a forecast: all payouts inside the cycle, constant multiple, no caps, no variance',
    [EconomicsDisclosure.DiscreteSawtooth]:
        'the loss probability is a sawtooth in the attempt count; the minimum holds for every count from it up to the cap',
    [EconomicsDisclosure.KellyNotPropSizing]:
        'growth optimum for an irreplaceable bankroll; not the prop eval or funded sizing rule',
    [EconomicsDisclosure.NearFreshEvalApproximation]:
        'approximation, valid near a fresh eval',
    [EconomicsDisclosure.NoPayoutIgnoresPayoutSize]:
        'P(no payout from N attempts); ignores payout size',
    [EconomicsDisclosure.OnePayoutPerPayingAccount]:
        'one payout per paying account',
    [EconomicsDisclosure.OneValuePerPayingAttempt]:
        'one value per paying attempt; cross-check only',
    [EconomicsDisclosure.RandomWalkApproximation]:
        'random-walk approximation with a fixed drawdown floor at the starting balance minus the drawdown, so a trailing or end-of-day drawdown is not modelled and the value is optimistic for it; it uses a flat risk per trade with no eval ladder, commissions or contract rounding, and a trade taken with less than one risk of cushion left still wins the full reward, where the simulation by default caps that trade to the remaining cushion, so the value is also optimistic when the drawdown is not a whole multiple of the risk or the reward:risk is not a whole number; it ignores the consistency rule, daily loss limit, daily profit cap, day-stop rule, trades per day and contract limits; the simulated pass rate and trades per pass stay authoritative',
    [EconomicsDisclosure.RebuyLagNotPriced]:
        'the wait before a rebought eval starts is not priced in',
};

export enum EconomicsReason {
    AboveCap = 'above-cap',
    InvalidInput = 'invalid-input',
    NoFundedValue = 'no-funded-value',
    NoPayoutChance = 'no-payout-chance',
    NoPositiveEdge = 'no-positive-edge',
    ThresholdNotSet = 'threshold-not-set',
    Unreachable = 'unreachable',
    UnsupportedRatio = 'unsupported-ratio',
    WalkGridTooLarge = 'walk-grid-too-large',
    ZeroAttemptCost = 'zero-attempt-cost',
}

export const ECONOMICS_REASON_TEXT: Readonly<Record<EconomicsReason, string>> =
    {
        [EconomicsReason.AboveCap]:
            'no attempt count up to the cap meets the loss target',
        [EconomicsReason.InvalidInput]:
            'an input is missing, negative or out of range',
        [EconomicsReason.NoFundedValue]:
            'the funded account has no positive expected value',
        [EconomicsReason.NoPayoutChance]: 'the chance of a payout is zero',
        [EconomicsReason.NoPositiveEdge]:
            'the expected net result is not positive',
        [EconomicsReason.ThresholdNotSet]: 'no loss target is set',
        [EconomicsReason.Unreachable]:
            'the target cannot be reached with these inputs',
        [EconomicsReason.UnsupportedRatio]: `the exact walk only represents a reward:risk that is a fraction with a denominator of at most ${String(MAX_WALK_RATIO_DENOMINATOR)}, which covers every value with at most two decimals; round it to one decimal, such as 1.3 instead of 1.333, which also keeps the walk small enough to solve`,
        [EconomicsReason.WalkGridTooLarge]: `the reward:risk has too many decimals, or the target and drawdown span too many steps of the risk per trade, for the walk to solve exactly within its limits of ${GROUPED_COUNT.format(MAX_WALK_WORK)} solver steps and ${GROUPED_COUNT.format(MAX_WALK_CELLS)} stored values; a reward:risk with fewer decimals, such as 2.4 instead of 2.37, shrinks the walk, and the simulated pass rate stays authoritative`,
        [EconomicsReason.ZeroAttemptCost]:
            'the attempt costs nothing, so there is no cost to compare with',
    };

const KELLY_DISCLOSURES: readonly EconomicsDisclosure[] = [
    EconomicsDisclosure.KellyNotPropSizing,
];

export interface EconomicsEstimate<T extends number = number> {
    standardError: null | number;
    value: T;
}

export type Quantity<T> =
    | {
          readonly disclosures: readonly EconomicsDisclosure[];
          readonly reason: EconomicsReason;
          readonly value: null;
      }
    | {
          readonly disclosures: readonly EconomicsDisclosure[];
          readonly reason: null;
          readonly value: T;
      };

export function compoundedMultiple(
    growthPerTrade: number,
    trades: number,
): Quantity<number> {
    return !Number.isFinite(growthPerTrade) || !isCount(trades)
        ? missingQuantity(EconomicsReason.InvalidInput)
        : quantityOf(Math.exp(trades * growthPerTrade));
}

export function expectancyPerTradeR(
    winrate: Fraction0to1,
    rrRatio: number,
): Quantity<number> {
    return isEdgeInput(winrate, rrRatio)
        ? quantityOf(winrate * rrRatio - (1 - winrate))
        : missingQuantity(EconomicsReason.InvalidInput);
}

export function fullKellyFraction(
    winrate: Fraction0to1,
    rrRatio: number,
): Quantity<number> {
    return isEdgeInput(winrate, rrRatio)
        ? quantityOf((winrate * (rrRatio + 1) - 1) / rrRatio, KELLY_DISCLOSURES)
        : missingQuantity(EconomicsReason.InvalidInput, KELLY_DISCLOSURES);
}

export function isCount(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0;
}

export function isNonNegativeAmount(value: number): boolean {
    return Number.isFinite(value) && value >= 0;
}

export function isProbability(value: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function kellyGrowthPerTrade(
    winrate: Fraction0to1,
    rrRatio: number,
): Quantity<number> {
    const kelly = fullKellyFraction(winrate, rrRatio);
    if (kelly.value === null) return kelly;
    if (kelly.value <= 0) {
        return missingQuantity(
            EconomicsReason.NoPositiveEdge,
            KELLY_DISCLOSURES,
        );
    }
    const winGrowth = winrate * Math.log(1 + kelly.value * rrRatio);
    const lossWeight = 1 - winrate;
    const lossGrowth =
        lossWeight > 0 ? lossWeight * Math.log(1 - kelly.value) : 0;
    return quantityOf(winGrowth + lossGrowth, KELLY_DISCLOSURES);
}

export function missingQuantity(
    reason: EconomicsReason,
    disclosures: readonly EconomicsDisclosure[] = [],
): Quantity<never> {
    return { disclosures, reason, value: null };
}

export function quantityOf<T>(
    value: T,
    disclosures: readonly EconomicsDisclosure[] = [],
): Quantity<T> {
    return { disclosures, reason: null, value };
}

function isEdgeInput(winrate: number, rrRatio: number): boolean {
    return isProbability(winrate) && Number.isFinite(rrRatio) && rrRatio > 0;
}
