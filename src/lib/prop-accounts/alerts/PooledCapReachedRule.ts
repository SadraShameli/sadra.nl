import {
    AccountStage,
    findStoredFirm,
    isEndedStatus,
    PlanKeyResolutionKind,
} from '~/lib/prop-accounts/core';
import { fundedSlotRoomOf } from '~/lib/prop-accounts/metrics';
import { type Plan, type TradingFirm } from '~/lib/prop-calculator';

import { type AccountAlert, AlertSubjectKind } from './AccountAlert';
import {
    type AlertContext,
    isModeledMonitored,
    type ModeledMonitoredAccount,
} from './AlertContext';
import { AlertKind } from './AlertKind';
import { AlertRule } from './AlertRule';
import { AlertSeverity } from './AlertSeverity';

interface FundedPlanGroup {
    readonly accounts: readonly ModeledMonitoredAccount[];
    readonly firm: TradingFirm;
    readonly plan: Plan;
    readonly planSerial: string;
}

export class PooledCapReachedRule extends AlertRule {
    readonly kind = AlertKind.PooledCapReached;

    evaluate(context: AlertContext): readonly AccountAlert[] {
        const groups = fundedPlanGroupsOf(context);
        const counts = new Map(
            groups.map((group) => [group.planSerial, group.accounts.length]),
        );
        return groups.flatMap((group) => {
            const { freeSlots } = fundedSlotRoomOf(
                group.firm,
                group.plan,
                counts,
            );
            if (freeSlots > 0) return [];
            return [
                {
                    disclosures: [],
                    kind: this.kind,
                    message: `${group.accounts.length} funded ${group.plan.label} slot${group.accounts.length === 1 ? '' : 's'} used; no free slots remain`,
                    severity: AlertSeverity.Warning,
                    subject: {
                        accountIds: group.accounts.map(
                            (monitored) => monitored.account.id,
                        ),
                        kind: AlertSubjectKind.Portfolio,
                    },
                },
            ];
        });
    }
}

function fundedPlanGroupsOf(context: AlertContext): readonly FundedPlanGroup[] {
    const funded = context.accounts.filter(
        (monitored): monitored is ModeledMonitoredAccount =>
            !isEndedStatus(monitored.account.status) &&
            isModeledMonitored(monitored) &&
            monitored.account.stage === AccountStage.Funded &&
            monitored.plan.kind === PlanKeyResolutionKind.Resolved,
    );
    const byPlanSerial = Map.groupBy(
        funded,
        (monitored) => monitored.planKey.planSerial,
    );
    return byPlanSerial
        .values()
        .flatMap((accounts) => {
            const first = accounts[0];
            if (first?.plan.kind !== PlanKeyResolutionKind.Resolved) {
                return [];
            }
            const firm = findStoredFirm(first.planKey.firmId);
            if (firm === undefined) return [];
            return [
                {
                    accounts,
                    firm,
                    plan: first.plan.plan,
                    planSerial: first.planKey.planSerial,
                },
            ];
        })
        .toArray();
}
