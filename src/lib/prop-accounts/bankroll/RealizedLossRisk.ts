import {
    compareText,
    isoDaysBetween,
    paidPayoutCash,
} from '~/lib/prop-accounts/core';
import {
    fundedSince,
    isHorizonMaturedCohort,
    type LedgerAccount,
    paidCountWithinHorizon,
    perAttemptNetCents,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
    sampledRate,
} from '~/lib/prop-accounts/metrics';
import { type Dollars, dollars, fraction } from '~/lib/prop-calculator';
import {
    attemptsAffordable,
    batchLossClosedForm,
    cohortOutcome,
    EconomicsReason,
    empiricalPayingStatsOf,
    LossSampleUnit,
    MAX_LOSS_TARGET_CAP,
    minimumBudgetForLossTarget,
    noPayoutProbability as noPayoutProbabilityOf,
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
    const measuredDays = measuredMeanDaysToFirstPayout(inputs.ledger);
    const toFirstPayoutDays =
        measuredDays?.value ?? inputs.toFirstPayoutFallbackDays;
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
    const attempts = attemptsAffordable(
        dollars(inputs.availableCents / 100),
        dollars(attemptCostDollars),
    );
    const batchLossProbability =
        attempts.value === null
            ? null
            : batchLossProbabilityOf(
                  netValuesDollars,
                  attempts.value,
                  inputs.draws,
                  inputs.seed,
              );
    const empirical = empiricalPayingStatsOf(
        netValuesDollars,
        attemptCostDollars,
    );
    const minimumBudget = minimumBudgetForLossTarget({
        cap: MAX_LOSS_TARGET_CAP,
        costPerSample: dollars(attemptCostDollars),
        costUnit: LossSampleUnit.Attempt,
        lossProbability: (attemptCount) =>
            batchLossClosedForm({
                attemptCost: dollars(attemptCostDollars),
                attempts: attemptCount,
                pAttemptPays: empirical.pAttemptPays,
                valuePerPayingAttempt: empirical.valuePerPayingAttempt,
            }).value ?? 1,
        meanNetPerSample: dollars(meanNetCents / 100),
        sampleUnit: LossSampleUnit.Attempt,
        threshold:
            inputs.lossRiskThreshold === null
                ? null
                : fraction(inputs.lossRiskThreshold),
    });
    return {
        ...base,
        attempts: attempts.value,
        batchLossProbability,
        minimumBudget,
        noPayoutProbability:
            attemptPaysRate === null || attempts.value === null
                ? null
                : (noPayoutProbabilityOf(
                      fraction(clamp(attemptPaysRate.value, 0, 1)),
                      attempts.value,
                  ).value ?? null),
        reason: null,
    };
}

function batchLossProbabilityOf(
    netValuesDollars: readonly number[],
    attempts: number,
    draws: number,
    seed: number,
): null | { readonly standardError: null | number; readonly value: number } {
    const outcome = cohortOutcome(netValuesDollars, attempts, draws, seed);
    return outcome.value === null
        ? null
        : {
              standardError: outcome.value.lossProbability.standardError,
              value: outcome.value.lossProbability.value,
          };
}

function measuredMeanDaysToFirstPayout(
    ledger: PortfolioLedger,
): null | SampledEstimate {
    const days = ledger.resolvedAccounts.flatMap((entry) => {
        const funded = fundedSince(entry);
        if (funded === null) return [];
        const paidDates = entry.payouts
            .map((row) => paidPayoutCash(row))
            .flatMap((paid) => (paid?.paidOn ? [paid.paidOn] : []))
            .toSorted(compareText);
        const first = paidDates[0];
        return first === undefined ? [] : [isoDaysBetween(funded.on, first)];
    });
    return sampledMean(days);
}

function pooledAttemptPaysRate(
    ledger: PortfolioLedger,
    asOfDate: string,
    horizonDays: number,
): null | SampledEstimate {
    let successes = 0;
    let decided = 0;
    for (const entry of ledger.resolvedAccounts as readonly LedgerAccount[]) {
        const funded = fundedSince(entry);
        if (
            funded === null ||
            !isHorizonMaturedCohort(entry, funded.on, asOfDate, horizonDays)
        ) {
            continue;
        }
        decided += 1;
        if (paidCountWithinHorizon(entry, funded.on, horizonDays) > 0) {
            successes += 1;
        }
    }
    return sampledRate(successes, decided);
}
