import {
    type AccountAlert,
    type AlertSubject,
    AlertSubjectKind,
} from './AccountAlert';
import { type AlertContext } from './AlertContext';
import { type AlertRule } from './AlertRule';
import { alertSeverityRank } from './AlertSeverity';
import { BankrollLossRiskAboveThresholdRule } from './BankrollLossRiskAboveThresholdRule';
import { CalendarInactivityRule } from './CalendarInactivityRule';
import { CapacityExceededRule } from './CapacityExceededRule';
import { ConcentratedFirmProfitRule } from './ConcentratedFirmProfitRule';
import { ConductPatternRule } from './ConductPatternRule';
import { ConsistencyNearBreachRule } from './ConsistencyNearBreachRule';
import { CooldownActiveRule } from './CooldownActiveRule';
import { DashboardFloorMismatchRule } from './DashboardFloorMismatchRule';
import { EvalDayCapRule } from './EvalDayCapRule';
import { FirmPayoutTotalMismatchRule } from './FirmPayoutTotalMismatchRule';
import { IdleSessionLimitRule } from './IdleSessionLimitRule';
import { InvalidStoredDateRule } from './InvalidStoredDateRule';
import { LargeDayLossRule } from './LargeDayLossRule';
import { LifetimeDollarCapRule } from './LifetimeDollarCapRule';
import { LifetimePayoutCountRule } from './LifetimePayoutCountRule';
import { LiveExclusivityRule } from './LiveExclusivityRule';
import { LiveTriggerNearRule } from './LiveTriggerNearRule';
import { MixedStageCopyGroupRule } from './MixedStageCopyGroupRule';
import { NearFloorRule } from './NearFloorRule';
import { PayoutCountMismatchRule } from './PayoutCountMismatchRule';
import { PayoutDollarMismatchRule } from './PayoutDollarMismatchRule';
import { PayoutEligibleRule } from './PayoutEligibleRule';
import { PayoutReadyOpenRiskRule } from './PayoutReadyOpenRiskRule';
import { PayoutReadyWithdrawableDropRule } from './PayoutReadyWithdrawableDropRule';
import { PlanRulesChangedRule } from './PlanRulesChangedRule';
import { PooledCapReachedRule } from './PooledCapReachedRule';
import { RoundBudgetReachedRule } from './RoundBudgetReachedRule';
import { StaleSnapshotRule } from './StaleSnapshotRule';
import { SubscriptionRenewalDueRule } from './SubscriptionRenewalDueRule';
import { TierChangeRule } from './TierChangeRule';
import { UnresolvablePlanRule } from './UnresolvablePlanRule';
import { WeeklyReviewDueRule } from './WeeklyReviewDueRule';

export const DEFAULT_ALERT_RULES: readonly AlertRule[] = [
    new InvalidStoredDateRule(),
    new ConsistencyNearBreachRule(),
    new DashboardFloorMismatchRule(),
    new StaleSnapshotRule(),
    new WeeklyReviewDueRule(),
    new EvalDayCapRule(),
    new IdleSessionLimitRule(),
    new LifetimePayoutCountRule(),
    new LifetimeDollarCapRule(),
    new UnresolvablePlanRule(),
    new PayoutCountMismatchRule(),
    new PayoutDollarMismatchRule(),
    new PayoutEligibleRule(),
    new PayoutReadyWithdrawableDropRule(),
    new PayoutReadyOpenRiskRule(),
    new MixedStageCopyGroupRule(),
    new NearFloorRule(),
    new SubscriptionRenewalDueRule(),
    new PlanRulesChangedRule(),
    new TierChangeRule(),
    new RoundBudgetReachedRule(),
    new BankrollLossRiskAboveThresholdRule(),
    new FirmPayoutTotalMismatchRule(),
    new LiveTriggerNearRule(),
    new PooledCapReachedRule(),
    new LiveExclusivityRule(),
    new CooldownActiveRule(),
    new CalendarInactivityRule(),
    new ConductPatternRule(),
    new LargeDayLossRule(),
    new ConcentratedFirmProfitRule(),
    new CapacityExceededRule(),
];

const SORT_LOCALE = 'en';

interface SubjectSortKey {
    readonly id: string;
    readonly label: string;
    readonly rank: number;
}

export class AlertEvaluator {
    constructor(readonly rules: readonly AlertRule[] = DEFAULT_ALERT_RULES) {}

    evaluate(context: AlertContext): readonly AccountAlert[] {
        return this.rules
            .flatMap((rule) => rule.evaluate(context))
            .toSorted(compareAlerts);
    }
}

export function compareAlerts(left: AccountAlert, right: AccountAlert): number {
    const leftSubject = subjectSortKey(left.subject);
    const rightSubject = subjectSortKey(right.subject);
    return (
        alertSeverityRank(left.severity) - alertSeverityRank(right.severity) ||
        leftSubject.rank - rightSubject.rank ||
        leftSubject.label.localeCompare(rightSubject.label, SORT_LOCALE) ||
        leftSubject.id.localeCompare(rightSubject.id, SORT_LOCALE) ||
        left.kind.localeCompare(right.kind, SORT_LOCALE)
    );
}

function subjectSortKey(subject: AlertSubject): SubjectSortKey {
    switch (subject.kind) {
        case AlertSubjectKind.Account: {
            return { id: subject.accountId, label: subject.label, rank: 1 };
        }
        case AlertSubjectKind.CopyGroup: {
            return { id: subject.copyGroupId, label: subject.name, rank: 1 };
        }
        case AlertSubjectKind.Portfolio: {
            return { id: '', label: '', rank: 0 };
        }
    }
}
