import {
    AccountEventKind,
    AccountStatus,
    dayNumberOf,
    weekdaysInRange,
} from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';

import {
    evalAttemptTally,
    finalState,
    fundedSince,
    hasUnreversedFundedBust,
    isTransitionDateKnown,
    type LedgerAccount,
    type PlanGroup,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
    sampledRate,
} from './PortfolioLedger';

export interface PlanOutcomes {
    readonly firmId: FirmId;
    readonly fundedSurvival: null | SampledEstimate;
    readonly instantFunded: boolean;
    readonly openFundedAccounts: number;
    readonly passRate: null | SampledEstimate;
    readonly planSerial: string;
    readonly sessionsToFunded: null | SampledEstimate;
}

export interface RealizedOutcomes {
    readonly perPlan: readonly PlanOutcomes[];
    readonly unresolvedAccounts: number;
}

export function realizedOutcomes(ledger: PortfolioLedger): RealizedOutcomes {
    return {
        perPlan: ledger.planGroups().map((group) => planOutcomes(group)),
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

function isStillOpen(entry: LedgerAccount): boolean {
    const status = finalState(entry)?.status;
    return (
        status === AccountStatus.Active || status === AccountStatus.Suspended
    );
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
