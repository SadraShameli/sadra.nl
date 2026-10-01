import { type AlertKind } from './AlertKind';
import { type AlertSeverity } from './AlertSeverity';

export enum AlertDisclosure {
    GrossUsedForMissingNet = 'gross-used-for-missing-net',
    LiveTriggersNotChecked = 'live-triggers-not-checked',
    NoHolidayCalendar = 'no-holiday-calendar',
    SessionLimitApproximatedAsCalendarDays = 'session-limit-approximated-as-calendar-days',
    ThirtyDayBillingCycle = 'thirty-day-billing-cycle',
}

export enum AlertSubjectKind {
    Account = 'account',
    CopyGroup = 'copy-group',
    Portfolio = 'portfolio',
}

export interface AccountAlert {
    readonly disclosures: readonly AlertDisclosure[];
    readonly kind: AlertKind;
    readonly message: string;
    readonly severity: AlertSeverity;
    readonly subject: AlertSubject;
}

export type AlertSubject =
    | {
          readonly accountId: string;
          readonly kind: AlertSubjectKind.Account;
          readonly label: string;
      }
    | {
          readonly accountIds: readonly string[];
          readonly copyGroupId: string;
          readonly kind: AlertSubjectKind.CopyGroup;
          readonly name: string;
      }
    | {
          readonly accountIds: readonly string[];
          readonly kind: AlertSubjectKind.Portfolio;
      };
