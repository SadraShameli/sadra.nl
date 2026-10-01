import {
    AccountEventKind,
    dayNumberOf,
    type FirmKey,
    firmKeyOf,
    groupByFirmKey,
    isEndedStatus,
    isoDaysBetween,
    paidPayoutCash,
    weekdaysInRange,
} from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';

import { isHorizonMaturedCohort } from './FundedPayoutDistribution';
import { type CopyGroupKey, independentSamples } from './IndependentSamples';
import {
    evalAttemptTally,
    finalState,
    fundedSince,
    hasUnreversedFundedBust,
    isTransitionDateKnown,
    type LedgerAccount,
    type ModeledLedgerAccount,
    type PlanGroup,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
    sampledRate,
} from './PortfolioLedger';

export enum CohortOutcomeKind {
    Failure = 'failure',
    Open = 'open',
    Success = 'success',
}

export interface FirmPayoutRate {
    readonly firmKey: FirmKey;
    readonly openAccounts: number;
    readonly payoutRate: null | SampledEstimate;
}

export interface PlanOutcomes {
    readonly firmId: FirmId;
    readonly fundedSurvival: null | SampledEstimate;
    readonly instantFunded: boolean;
    readonly openFundedAccounts: number;
    readonly passRate: null | SampledEstimate;
    readonly planSerial: string;
    readonly sessionsToFunded: null | SampledEstimate;
}

export interface PlanPayoutRate {
    readonly firmId: FirmId;
    readonly openAccounts: number;
    readonly payoutRate: null | SampledEstimate;
    readonly planSerial: string;
}

export interface RealizedOutcomes {
    readonly ledgerOnlyAccounts: number;
    readonly perPlan: readonly PlanOutcomes[];
    readonly unresolvedAccounts: number;
}

export interface RealizedPayoutRates {
    readonly horizonDays: number;
    readonly perFirm: readonly FirmPayoutRate[];
    readonly perPlan: readonly PlanPayoutRate[];
}

interface DecidedSample extends CopyGroupKey {
    readonly outcome: CohortOutcomeKind.Failure | CohortOutcomeKind.Success;
}

export function realizedOutcomes(ledger: PortfolioLedger): RealizedOutcomes {
    return {
        ledgerOnlyAccounts: ledger.ledgerOnlyAccounts.length,
        perPlan: ledger.planGroups().map((group) => planOutcomes(group)),
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

export function realizedPayoutRates(
    ledger: PortfolioLedger,
    asOfDate: string,
    horizonDays: number,
): RealizedPayoutRates {
    const perPlan = ledger.planGroups().map((group) => {
        const outcome = payoutRateOf(group.accounts, asOfDate, horizonDays);
        return {
            firmId: group.firmId,
            openAccounts: outcome.openAccounts,
            payoutRate: outcome.payoutRate,
            planSerial: group.planSerial,
        };
    });
    const perFirm = groupByFirmKey(ledger.resolvedAccounts, (entry) =>
        firmKeyOf(entry.row),
    ).map(({ firmKey, items }) => {
        const outcome = payoutRateOf(items, asOfDate, horizonDays);
        return {
            firmKey,
            openAccounts: outcome.openAccounts,
            payoutRate: outcome.payoutRate,
        };
    });
    return { horizonDays, perFirm, perPlan };
}

function cohortOutcomeOf(
    entry: ModeledLedgerAccount,
    asOfDate: string,
    horizonDays: number,
): CohortOutcomeKind | null {
    const funded = fundedSince(entry);
    if (funded === null) return null;
    if (hasPaidWithinHorizon(entry, funded.on, horizonDays)) {
        return CohortOutcomeKind.Success;
    }
    return isHorizonMaturedCohort(entry, funded.on, asOfDate, horizonDays)
        ? CohortOutcomeKind.Failure
        : CohortOutcomeKind.Open;
}

function hasPaidWithinHorizon(
    entry: ModeledLedgerAccount,
    fundedOn: string,
    horizonDays: number,
): boolean {
    return entry.payouts.some((row) => {
        const paid = paidPayoutCash(row);
        if (!paid?.paidOn) return false;
        const lag = isoDaysBetween(fundedOn, paid.paidOn);
        return lag >= 0 && lag <= horizonDays;
    });
}

function isStillOpen(entry: LedgerAccount): boolean {
    const status = finalState(entry)?.status;
    return status !== undefined && !isEndedStatus(status);
}

function majorityOutcome(group: readonly DecidedSample[]): CohortOutcomeKind {
    if (group.length === 0) {
        throw new RangeError('an independent-sample group cannot be empty');
    }
    const successes = group.filter(
        (sample) => sample.outcome === CohortOutcomeKind.Success,
    ).length;
    return successes > group.length - successes
        ? CohortOutcomeKind.Success
        : CohortOutcomeKind.Failure;
}

function passRateOf(
    accounts: readonly LedgerAccount[],
): null | SampledEstimate {
    let passes = 0;
    let decided = 0;
    for (const entry of accounts) {
        const tally = evalAttemptTally(entry);
        passes += tally.passes;
        decided += tally.passes + tally.fails;
    }
    return sampledRate(passes, decided);
}

function payoutRateOf(
    accounts: readonly ModeledLedgerAccount[],
    asOfDate: string,
    horizonDays: number,
): {
    readonly openAccounts: number;
    readonly payoutRate: null | SampledEstimate;
} {
    const decided: DecidedSample[] = [];
    let openAccounts = 0;
    for (const entry of accounts) {
        const outcome = cohortOutcomeOf(entry, asOfDate, horizonDays);
        if (outcome === null) continue;
        if (outcome === CohortOutcomeKind.Open) {
            openAccounts += 1;
            continue;
        }
        decided.push({
            copyGroupId: entry.row.copyGroupId,
            outcome,
            purchasedOn: entry.row.purchasedOn,
        });
    }
    const samples = independentSamples(decided).map((group) =>
        majorityOutcome(group),
    );
    const successes = samples.filter(
        (outcome) => outcome === CohortOutcomeKind.Success,
    ).length;
    return { openAccounts, payoutRate: sampledRate(successes, samples.length) };
}

function planOutcomes(group: PlanGroup): PlanOutcomes {
    const isInstantFunded = group.plan.isInstantFunded;
    const funded = group.accounts.filter(
        (entry) => fundedSince(entry) !== null,
    );
    const survived = funded.filter((entry) => !hasUnreversedFundedBust(entry));
    return {
        firmId: group.firmId,
        fundedSurvival: sampledRate(survived.length, funded.length),
        instantFunded: isInstantFunded,
        openFundedAccounts: survived.filter(isStillOpen).length,
        passRate: isInstantFunded ? null : passRateOf(group.accounts),
        planSerial: group.planSerial,
        sessionsToFunded: isInstantFunded
            ? null
            : sessionsToFundedOf(group.accounts),
    };
}

function sessionsToFundedOf(
    accounts: readonly LedgerAccount[],
): null | SampledEstimate {
    const sessions = accounts.flatMap((entry) => {
        const start = entry.transitions[0]?.on;
        const pass = entry.transitions.find(
            (transition) => transition.kind === AccountEventKind.EvalPassed,
        );
        return start === undefined ||
            pass === undefined ||
            !isTransitionDateKnown(pass.provenance)
            ? []
            : [weekdaysInRange(dayNumberOf(start), dayNumberOf(pass.on) + 1)];
    });
    return sampledMean(sessions);
}
