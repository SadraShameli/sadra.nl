import { describe, expect, it } from 'vitest';

import {
    type AccountAlert,
    AlertEvaluator,
    AlertKind,
    alertKindLabel,
    AlertRule,
    AlertSeverity,
    alertSeverityRank,
    type AlertSubject,
    AlertSubjectKind,
    DEFAULT_ALERT_RULES,
} from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import { type PropAccountRow } from '~/server/db/schemas/prop';

import {
    accountFor,
    ANY_EVAL_PLAN,
    contextOf,
    FRIDAY,
    MONDAY,
    planWhere,
    snapshotFor,
    TUESDAY,
} from './alertFixtures';

const CAPPED_EVAL_PLAN = planWhere(
    (plan) => !plan.isInstantFunded && plan.maxEvalTradingDays !== null,
);
const FUNDED_PLAN = planWhere((plan) => plan.isInstantFunded);
const UNCAPPED_EVAL_PLAN = planWhere(
    (plan) =>
        !plan.isInstantFunded &&
        plan.maxEvalTradingDays === null &&
        plan.fees.monthlySubscription === 0,
);

class FixedRule extends AlertRule {
    readonly kind = AlertKind.StaleSnapshot;

    constructor(private readonly alerts: readonly AccountAlert[]) {
        super();
    }

    evaluate(): readonly AccountAlert[] {
        return this.alerts;
    }
}

function accountSubject(accountId: string, label: string): AlertSubject {
    return { accountId, kind: AlertSubjectKind.Account, label };
}

function alertOf(
    severity: AlertSeverity,
    subject: AlertSubject,
    kind = AlertKind.StaleSnapshot,
): AccountAlert {
    return { disclosures: [], kind, message: kind, severity, subject };
}

const DEFAULT_KINDS = [
    AlertKind.ConsistencyNearBreach,
    AlertKind.DashboardFloorMismatch,
    AlertKind.EvalDayCapNear,
    AlertKind.IdleSessionLimit,
    AlertKind.InvalidStoredDate,
    AlertKind.LifetimeDollarCapNear,
    AlertKind.LifetimePayoutCountNear,
    AlertKind.MixedStageCopyGroup,
    AlertKind.NearFloor,
    AlertKind.PayoutCountMismatch,
    AlertKind.PayoutDollarMismatch,
    AlertKind.PayoutEligible,
    AlertKind.PayoutReadyWithdrawableDrop,
    AlertKind.PlanRulesChanged,
    AlertKind.StaleSnapshot,
    AlertKind.SubscriptionRenewalDue,
    AlertKind.TierChange,
    AlertKind.UnresolvablePlan,
    AlertKind.WeeklyReviewDue,
];

describe('alertKindLabel', () => {
    it('labels a tier change as a DLL or contract tier change, not just a payout tier', () => {
        expect(alertKindLabel(AlertKind.TierChange)).toBe(
            'DLL or contract tier change',
        );
    });
});

describe('alertSeverityRank', () => {
    it('ranks critical before warning before info', () => {
        expect(alertSeverityRank(AlertSeverity.Critical)).toBeLessThan(
            alertSeverityRank(AlertSeverity.Warning),
        );
        expect(alertSeverityRank(AlertSeverity.Warning)).toBeLessThan(
            alertSeverityRank(AlertSeverity.Info),
        );
    });
});

describe('AlertEvaluator', () => {
    it('registers one rule per implemented alert kind', () => {
        expect(
            DEFAULT_ALERT_RULES.map((rule) => rule.kind).toSorted(
                (left, right) => left.localeCompare(right),
            ),
        ).toEqual(
            DEFAULT_KINDS.toSorted((left, right) => left.localeCompare(right)),
        );
    });

    it('sorts by severity, then subject, then kind', () => {
        const alpha = accountSubject('id-2', 'Alpha');
        const beta = accountSubject('id-1', 'Beta');
        const portfolio: AlertSubject = {
            accountIds: [],
            kind: AlertSubjectKind.Portfolio,
        };
        const group: AlertSubject = {
            accountIds: [],
            copyGroupId: 'group-1',
            kind: AlertSubjectKind.CopyGroup,
            name: 'Bravo group',
        };
        const unsorted = [
            alertOf(AlertSeverity.Info, portfolio, AlertKind.WeeklyReviewDue),
            alertOf(AlertSeverity.Warning, beta),
            alertOf(
                AlertSeverity.Warning,
                group,
                AlertKind.MixedStageCopyGroup,
            ),
            alertOf(AlertSeverity.Critical, beta, AlertKind.EvalDayCapNear),
            alertOf(AlertSeverity.Warning, alpha, AlertKind.UnresolvablePlan),
            alertOf(
                AlertSeverity.Warning,
                alpha,
                AlertKind.PayoutCountMismatch,
            ),
            alertOf(
                AlertSeverity.Warning,
                portfolio,
                AlertKind.WeeklyReviewDue,
            ),
        ];
        const sorted = new AlertEvaluator([new FixedRule(unsorted)]).evaluate(
            contextOf({}),
        );
        expect(
            sorted.map((alert) => [alert.severity, alert.kind, alert.subject]),
        ).toEqual([
            [AlertSeverity.Critical, AlertKind.EvalDayCapNear, beta],
            [AlertSeverity.Warning, AlertKind.WeeklyReviewDue, portfolio],
            [AlertSeverity.Warning, AlertKind.PayoutCountMismatch, alpha],
            [AlertSeverity.Warning, AlertKind.UnresolvablePlan, alpha],
            [AlertSeverity.Warning, AlertKind.StaleSnapshot, beta],
            [AlertSeverity.Warning, AlertKind.MixedStageCopyGroup, group],
            [AlertSeverity.Info, AlertKind.WeeklyReviewDue, portfolio],
        ]);
    });

    it('breaks a label tie by subject id', () => {
        const second = accountSubject('id-b', 'Same');
        const first = accountSubject('id-a', 'Same');
        const sorted = new AlertEvaluator([
            new FixedRule([
                alertOf(AlertSeverity.Warning, second),
                alertOf(AlertSeverity.Warning, first),
            ]),
        ]).evaluate(contextOf({}));
        expect(sorted.map((alert) => alert.subject)).toEqual([first, second]);
    });

    it('runs every default rule over a portfolio', () => {
        const staleEval = accountFor(UNCAPPED_EVAL_PLAN, {
            label: 'Eval A',
            stage: AccountStage.Eval,
        });
        const unresolved = accountFor(ANY_EVAL_PLAN, {
            label: 'Old plan',
            planSerial: 'retired-plan',
            stage: AccountStage.Funded,
        });
        const alerts = new AlertEvaluator().evaluate(
            contextOf({
                accounts: [staleEval, unresolved],
                snapshots: [
                    snapshotFor(staleEval, { asOf: FRIDAY }),
                    snapshotFor(unresolved, { asOf: MONDAY }),
                ],
            }),
        );
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.StaleSnapshot,
            AlertKind.UnresolvablePlan,
            AlertKind.WeeklyReviewDue,
        ]);
    });

    it('keeps the critical alerts of other accounts when one row is malformed', () => {
        const capped = accountFor(CAPPED_EVAL_PLAN, {
            label: 'Capped eval',
            purchasedOn: '2026-08-01',
        });
        const corruptOptIns = accountFor(UNCAPPED_EVAL_PLAN, {
            label: 'Corrupt opt-ins',
            optIns: 'broken' as unknown as PropAccountRow['optIns'],
        });
        const badPurchase = accountFor(CAPPED_EVAL_PLAN, {
            label: 'Bad purchase date',
            purchasedOn: '2026-13-01',
        });
        const badSnapshot = accountFor(FUNDED_PLAN, {
            label: 'Bad snapshot date',
            stage: AccountStage.Funded,
        });
        const alerts = new AlertEvaluator().evaluate(
            contextOf({
                accounts: [capped, corruptOptIns, badPurchase, badSnapshot],
                snapshots: [
                    snapshotFor(capped, { asOf: TUESDAY }),
                    snapshotFor(corruptOptIns, { asOf: TUESDAY }),
                    snapshotFor(badPurchase, { asOf: TUESDAY }),
                    snapshotFor(badSnapshot, { asOf: 'yesterday' }),
                ],
            }),
        );
        expect(alerts[0]).toMatchObject({
            kind: AlertKind.EvalDayCapNear,
            severity: AlertSeverity.Critical,
            subject: { accountId: capped.id },
        });
        const warningsFor = (accountId: string) =>
            alerts
                .filter(
                    (alert) =>
                        alert.severity === AlertSeverity.Warning &&
                        alert.subject.kind === AlertSubjectKind.Account &&
                        alert.subject.accountId === accountId,
                )
                .map((alert) => [alert.kind, alert.message]);
        expect(warningsFor(corruptOptIns.id)).toEqual([
            [AlertKind.UnresolvablePlan, expect.stringContaining('opt-ins')],
        ]);
        expect(warningsFor(badPurchase.id)).toEqual([
            [
                AlertKind.InvalidStoredDate,
                expect.stringContaining('purchase date "2026-13-01"'),
            ],
        ]);
        expect(warningsFor(badSnapshot.id)).toEqual([
            [
                AlertKind.InvalidStoredDate,
                expect.stringContaining('snapshot date "yesterday"'),
            ],
        ]);
    });
});
