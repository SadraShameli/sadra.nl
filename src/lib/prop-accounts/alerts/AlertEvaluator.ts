import {
    type AccountAlert,
    type AlertSubject,
    AlertSubjectKind,
} from './AccountAlert';
import { type AlertContext } from './AlertContext';
import { type AlertRule } from './AlertRule';
import { alertSeverityRank } from './AlertSeverity';
import { EvalDayCapRule } from './EvalDayCapRule';
import { InvalidStoredDateRule } from './InvalidStoredDateRule';
import { LifetimePayoutCountRule } from './LifetimePayoutCountRule';
import { MixedStageCopyGroupRule } from './MixedStageCopyGroupRule';
import { PayoutCountMismatchRule } from './PayoutCountMismatchRule';
import { PayoutDollarMismatchRule } from './PayoutDollarMismatchRule';
import { StaleSnapshotRule } from './StaleSnapshotRule';
import { SubscriptionRenewalDueRule } from './SubscriptionRenewalDueRule';
import { UnresolvablePlanRule } from './UnresolvablePlanRule';
import { WeeklyReviewDueRule } from './WeeklyReviewDueRule';

export const DEFAULT_ALERT_RULES: readonly AlertRule[] = [
    new InvalidStoredDateRule(),
    new StaleSnapshotRule(),
    new WeeklyReviewDueRule(),
    new EvalDayCapRule(),
    new LifetimePayoutCountRule(),
    new UnresolvablePlanRule(),
    new PayoutCountMismatchRule(),
    new PayoutDollarMismatchRule(),
    new MixedStageCopyGroupRule(),
    new SubscriptionRenewalDueRule(),
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
