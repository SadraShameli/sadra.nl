import { type Fraction0to1 } from '../core';

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
        'random-walk approximation that ignores the consistency rule, daily loss limit, daily profit cap and contract limits; the simulated pass rate and trades per pass stay authoritative',
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
