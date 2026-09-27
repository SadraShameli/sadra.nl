import {
    dayNumberOf,
    isEndedStatus,
    weekdaysInRange,
} from '~/lib/prop-accounts/core';
import { type FirmId } from '~/lib/prop-calculator';
import { RebuyLagBasis } from '~/lib/prop-calculator/advisor';

import { attemptsOf } from './Attempts';
import {
    fundedSince,
    type LedgerAccount,
    type PlanGroup,
    type PortfolioLedger,
    type SampledEstimate,
    sampledMean,
} from './PortfolioLedger';

export { RebuyLagBasis } from '~/lib/prop-calculator/advisor';

export interface PlanReplacementStats {
    readonly attempts: number;
    readonly attemptsPerFundedAccount: null | number;
    readonly firmId: FirmId;
    readonly fundedAccounts: number;
    readonly lagSamples: number;
    readonly lagSessions: null | SampledEstimate;
    readonly planSerial: string;
    readonly unmeasuredReplacements: number;
}

export interface RebuyLagDefault {
    readonly basis: RebuyLagBasis;
    readonly days: number;
    readonly samples: number;
}

export interface ReplacementStats {
    readonly ledgerOnlyAccounts: number;
    readonly perPlan: readonly PlanReplacementStats[];
    readonly unresolvedAccounts: number;
}

export function rebuyLagDefault(
    stats: ReplacementStats,
    planSerial: string,
): RebuyLagDefault {
    const row = stats.perPlan.find((plan) => plan.planSerial === planSerial);
    return row?.lagSessions == null
        ? { basis: RebuyLagBasis.AssumedZero, days: 0, samples: 0 }
        : {
              basis: RebuyLagBasis.Measured,
              days: row.lagSessions.value,
              samples: row.lagSamples,
          };
}

export function replacementStats(ledger: PortfolioLedger): ReplacementStats {
    return {
        ledgerOnlyAccounts: ledger.ledgerOnlyAccounts.length,
        perPlan: ledger.planGroups().map((group) => planStats(ledger, group)),
        unresolvedAccounts: ledger.unresolvedAccounts.length,
    };
}

function endedOn(account: LedgerAccount): null | string {
    let endedAt: null | string = null;
    for (const transition of account.transitions.toReversed()) {
        if (!isEndedStatus(transition.to.status)) break;
        endedAt = transition.on;
    }
    return endedAt;
}

function planStats(
    ledger: PortfolioLedger,
    group: PlanGroup,
): PlanReplacementStats {
    const lags: number[] = [];
    let unmeasuredReplacements = 0;
    for (const entry of group.accounts) {
        if (entry.row.replacesAccountId === null) continue;
        const replaced = ledger.replacedAccountOf(entry);
        const endDate = replaced === null ? null : endedOn(replaced);
        if (endDate === null) {
            unmeasuredReplacements += 1;
            continue;
        }
        lags.push(
            weekdaysInRange(
                dayNumberOf(endDate) + 1,
                dayNumberOf(entry.row.purchasedOn),
            ),
        );
    }
    const fundedAccounts = group.accounts.filter(
        (entry) => fundedSince(entry) !== null,
    ).length;
    const attempts = group.accounts.reduce(
        (sum, entry) => sum + attemptsOf(entry),
        0,
    );
    return {
        attempts,
        attemptsPerFundedAccount:
            fundedAccounts === 0 ? null : attempts / fundedAccounts,
        firmId: group.firmId,
        fundedAccounts,
        lagSamples: lags.length,
        lagSessions: sampledMean(lags),
        planSerial: group.planSerial,
        unmeasuredReplacements,
    };
}
