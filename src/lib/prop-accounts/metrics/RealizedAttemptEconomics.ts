import {
    isEndedStatus,
    isoDaysBetween,
    paidPayoutCash,
    usdCentsToDollars,
} from '~/lib/prop-accounts/core';
import { dollars, type FirmId, fraction } from '~/lib/prop-calculator';
import {
    type AttemptEconomics,
    attemptEconomics,
    fundedValueFrom,
    type Quantity,
} from '~/lib/prop-calculator/economics';
import { clamp } from '~/lib/prop-calculator/stats';

import { attemptsOf } from './Attempts';
import {
    isHorizonMaturedCohort,
    paidCountWithinHorizon,
    PAYOUT_COUNT_CAP,
} from './FundedPayoutDistribution';
import {
    finalState,
    fundedSince,
    type LedgerAccount,
    type ModeledLedgerAccount,
    type PlanGroup,
    type PortfolioLedger,
    roundCents,
    type SampledEstimate,
    sampledMean,
} from './PortfolioLedger';
import { realizedOutcomes, realizedPayoutRates } from './RealizedOutcomes';
import { summarizeCash } from './SpendAndPayouts';

export const MARGIN_ABOVE_BREAKEVEN_HELP_TEXT =
    'Above breakeven only when the pass-rate interval alone clears the breakeven pass rate; the payout-rate and average-payout intervals are not applied.';

export interface PlanAttemptEconomics {
    readonly attemptCost: null | number;
    readonly attempts: number;
    readonly averagePayout: null | SampledEstimate;
    readonly decomposition: null | Quantity<AttemptEconomics>;
    readonly firmId: FirmId;
    readonly marginAboveBreakeven: boolean | null;
    readonly passRate: null | SampledEstimate;
    readonly payoutRate: null | SampledEstimate;
    readonly payoutsPerPaidFunded: null | number;
    readonly planSerial: string;
    readonly realizedEvPerAttempt: null | number;
}

export interface RealizedAttemptEconomics {
    readonly horizonDays: number;
    readonly perPlan: readonly PlanAttemptEconomics[];
}

export function isCohortEndedAttempt(
    entry: ModeledLedgerAccount,
    asOfDate: string,
    horizonDays: number,
): boolean {
    const funded = fundedSince(entry);
    if (funded === null) {
        const status = finalState(entry)?.status;
        return status !== undefined && isEndedStatus(status);
    }
    return isHorizonMaturedCohort(entry, funded.on, asOfDate, horizonDays);
}

export function perAttemptNetCents(
    ledger: PortfolioLedger,
    asOfDate: string,
    horizonDays: number,
): readonly number[] {
    return ledger.resolvedAccounts.flatMap((entry) => {
        if (!isCohortEndedAttempt(entry, asOfDate, horizonDays)) return [];
        const attempts = attemptsOf(entry);
        if (attempts <= 0) return [];
        const net = summarizeCash(entry.fees, entry.payouts).net;
        return Array.from({ length: attempts }, () => net / attempts);
    });
}

export function realizedAttemptEconomics(
    ledger: PortfolioLedger,
    asOfDate: string,
    horizonDays: number,
): RealizedAttemptEconomics {
    const outcomes = realizedOutcomes(ledger);
    const payoutRates = realizedPayoutRates(ledger, asOfDate, horizonDays);
    return {
        horizonDays,
        perPlan: ledger
            .planGroups()
            .map((group) =>
                planEconomics(
                    group,
                    asOfDate,
                    horizonDays,
                    outcomes.perPlan.find(
                        (plan) => plan.planSerial === group.planSerial,
                    )?.passRate ?? null,
                    payoutRates.perPlan.find(
                        (plan) => plan.planSerial === group.planSerial,
                    )?.payoutRate ?? null,
                ),
            ),
    };
}

function averagePayoutOf(
    cohortAccounts: readonly LedgerAccount[],
    horizonDays: number,
): null | SampledEstimate {
    const cents = cohortAccounts.flatMap((entry) => {
        const funded = fundedSince(entry);
        if (funded === null) return [];
        return entry.payouts.flatMap((row) => {
            const paid = paidPayoutCash(row);
            if (!paid?.paidOn) return [];
            const lag = isoDaysBetween(funded.on, paid.paidOn);
            return lag >= 0 && lag <= horizonDays ? [paid.cents] : [];
        });
    });
    return sampledMean(cents);
}

function decompositionOf(
    attemptCost: null | number,
    passRate: null | SampledEstimate,
    payoutRate: null | SampledEstimate,
    payoutsPerPaidFunded: null | number,
    averagePayout: null | SampledEstimate,
): null | Quantity<AttemptEconomics> {
    if (
        attemptCost === null ||
        passRate === null ||
        payoutRate === null ||
        payoutsPerPaidFunded === null ||
        averagePayout === null
    ) {
        return null;
    }
    const fundedValueQuantity = fundedValueFrom({
        averagePayout: usdCentsToDollars(roundCents(averagePayout.value)),
        payoutProbabilityGivenFunded: fraction(clamp(payoutRate.value, 0, 1)),
        payoutsPerPaidFunded,
    });
    if (fundedValueQuantity.value === null) {
        return { ...fundedValueQuantity, value: null };
    }
    return attemptEconomics({
        attemptCost: dollars(attemptCost / 100),
        fundedValue: fundedValueQuantity.value,
        passProbability: fraction(clamp(passRate.value, 0, 1)),
    });
}

function marginAboveBreakevenOf(
    decomposition: null | Quantity<AttemptEconomics>,
    passRate: null | SampledEstimate,
): boolean | null {
    if (decomposition?.value == null || passRate?.interval == null) {
        return null;
    }
    const breakeven = decomposition.value.breakevenPassRate.value;
    return breakeven === null ? null : passRate.interval.lower > breakeven;
}

function payoutsPerPaidFundedOf(
    cohortAccounts: readonly LedgerAccount[],
    horizonDays: number,
): null | number {
    const paidCounts = cohortAccounts.flatMap((entry) => {
        const funded = fundedSince(entry);
        if (funded === null) return [];
        const count = paidCountWithinHorizon(entry, funded.on, horizonDays);
        return count > 0 ? [Math.min(count, PAYOUT_COUNT_CAP)] : [];
    });
    return paidCounts.length === 0
        ? null
        : paidCounts.reduce((sum, count) => sum + count, 0) / paidCounts.length;
}

function planEconomics(
    group: PlanGroup,
    asOfDate: string,
    horizonDays: number,
    passRate: null | SampledEstimate,
    payoutRate: null | SampledEstimate,
): PlanAttemptEconomics {
    const cohortAccounts = group.accounts.filter((entry) =>
        isCohortEndedAttempt(entry, asOfDate, horizonDays),
    );
    const attempts = cohortAccounts.reduce(
        (sum, entry) => sum + attemptsOf(entry),
        0,
    );
    const cash = summarizeCash(
        cohortAccounts.flatMap((entry) => entry.fees),
        cohortAccounts.flatMap((entry) => entry.payouts),
    );
    const attemptCost = attempts === 0 ? null : cash.spend / attempts;
    const payoutsPerPaidFunded = payoutsPerPaidFundedOf(
        cohortAccounts,
        horizonDays,
    );
    const averagePayout = averagePayoutOf(cohortAccounts, horizonDays);
    const decomposition = decompositionOf(
        attemptCost,
        passRate,
        payoutRate,
        payoutsPerPaidFunded,
        averagePayout,
    );
    return {
        attemptCost,
        attempts,
        averagePayout,
        decomposition,
        firmId: group.firmId,
        marginAboveBreakeven: marginAboveBreakevenOf(decomposition, passRate),
        passRate,
        payoutRate,
        payoutsPerPaidFunded,
        planSerial: group.planSerial,
        realizedEvPerAttempt: attempts === 0 ? null : cash.net / attempts,
    };
}
