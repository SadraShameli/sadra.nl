import {
    attemptsOf,
    fundedSince,
    isCohortEndedAttempt,
    paidCountWithinHorizon,
    payoutTiming,
    perAttemptNetCents,
    type PortfolioLedger,
    type SampledEstimate,
    sampledRate,
} from '~/lib/prop-accounts/metrics';
import { type Dollars, dollars, fraction } from '~/lib/prop-calculator';
import {
    bankrollAttemptsAt,
    bankrollCohortRisk,
    bankrollNoPayoutAt,
    compoundMinimumBudget,
    EconomicsReason,
    type Quantity,
} from '~/lib/prop-calculator/economics';
import { clamp, mean } from '~/lib/prop-calculator/stats';

export interface RealizedLossRisk {
    readonly attemptPaysRate: null | SampledEstimate;
    readonly attempts: null | number;
    readonly batchLossProbability: null | {
        readonly standardError: null | number;
        readonly value: number;
    };
    readonly meanNetPerAttemptCents: number;
    readonly minimumBudget: Quantity<Dollars>;
    readonly noPayoutProbability: null | number;
    readonly reason: EconomicsReason | null;
    readonly sampleCount: number;
    readonly toFirstPayoutDays: number;
    readonly toFirstPayoutMeasured: boolean;
}

export interface RealizedLossRiskInputs {
    readonly asOfDate: string;
    readonly attemptCostCents: number;
    readonly availableCents: number;
    readonly draws: number;
    readonly ledger: PortfolioLedger;
    readonly lossRiskThreshold: null | number;
    readonly seed: number;
    readonly toFirstPayoutFallbackDays: number;
}

export function realizedLossRisk(
    inputs: RealizedLossRiskInputs,
): RealizedLossRisk {
    const measuredDays = measuredMeanDaysToFirstPayout(
        inputs.ledger,
        inputs.asOfDate,
    );
    const toFirstPayoutDays = measuredDays ?? inputs.toFirstPayoutFallbackDays;
    const netValuesCents = perAttemptNetCents(
        inputs.ledger,
        inputs.asOfDate,
        toFirstPayoutDays,
    );
    const netValuesDollars = netValuesCents.map((cents) => cents / 100);
    const meanNetCents = netValuesCents.length === 0 ? 0 : mean(netValuesCents);
    const attemptPaysRate = pooledAttemptPaysRate(
        inputs.ledger,
        inputs.asOfDate,
        toFirstPayoutDays,
    );
    const base = {
        attemptPaysRate,
        meanNetPerAttemptCents: meanNetCents,
        sampleCount: netValuesCents.length,
        toFirstPayoutDays,
        toFirstPayoutMeasured: measuredDays !== null,
    };
    if (netValuesCents.length === 0 || meanNetCents <= 0) {
        return {
            ...base,
            attempts: null,
            batchLossProbability: null,
            minimumBudget: {
                disclosures: [],
                reason: EconomicsReason.NoPositiveEdge,
                value: null,
            },
            noPayoutProbability: null,
            reason: EconomicsReason.NoPositiveEdge,
        };
    }
    const attemptCostDollars = inputs.attemptCostCents / 100;
    const attempts = bankrollAttemptsAt(
        dollars(inputs.availableCents / 100),
        dollars(attemptCostDollars),
    );
    const batchLossProbability =
        attempts === null
            ? null
            : batchLossProbabilityOf(
                  netValuesDollars,
                  attempts,
                  inputs.draws,
                  inputs.seed,
              );
    const minimumBudget = compoundMinimumBudget({
        costPerAttempt: dollars(attemptCostDollars),
        lossThreshold:
            inputs.lossRiskThreshold === null
                ? null
                : fraction(inputs.lossRiskThreshold),
        netValues: netValuesDollars,
        seed: inputs.seed,
    });
    return {
        ...base,
        attempts,
        batchLossProbability,
        minimumBudget,
        noPayoutProbability:
            attemptPaysRate === null || attempts === null
                ? null
                : bankrollNoPayoutAt(
                      fraction(clamp(attemptPaysRate.value, 0, 1)),
                      attempts,
                  ),
        reason: null,
    };
}

function batchLossProbabilityOf(
    netValuesDollars: readonly number[],
    attempts: number,
    draws: number,
    seed: number,
): null | { readonly standardError: null | number; readonly value: number } {
    const outcome = bankrollCohortRisk(
        netValuesDollars,
        attempts,
        draws,
        seed,
    ).value;
    return outcome === null
        ? null
        : {
              standardError: outcome.lossProbability.standardError,
              value: outcome.lossProbability.value,
          };
}

function measuredMeanDaysToFirstPayout(
    ledger: PortfolioLedger,
    asOfDate: string,
): null | number {
    let weightedDays = 0;
    let samples = 0;
    for (const plan of payoutTiming(ledger, asOfDate).perPlan) {
        if (plan.toFirstPayout === null) continue;
        weightedDays += plan.toFirstPayout.value * plan.toFirstPayout.n;
        samples += plan.toFirstPayout.n;
    }
    return samples === 0 ? null : weightedDays / samples;
}

function pooledAttemptPaysRate(
    ledger: PortfolioLedger,
    asOfDate: string,
    horizonDays: number,
): null | SampledEstimate {
    let successes = 0;
    let attempts = 0;
    for (const entry of ledger.resolvedAccounts) {
        if (!isCohortEndedAttempt(entry, asOfDate, horizonDays)) continue;
        const entryAttempts = attemptsOf(entry);
        if (entryAttempts <= 0) continue;
        attempts += entryAttempts;
        const funded = fundedSince(entry);
        if (
            funded !== null &&
            paidCountWithinHorizon(entry, funded.on, horizonDays) > 0
        ) {
            successes += 1;
        }
    }
    return sampledRate(successes, attempts);
}
