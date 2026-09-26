import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    UnresolvablePlanRule,
} from '~/lib/prop-accounts/alerts';
import {
    type AccountReadIssue,
    AccountReadIssueKind,
    AccountStatus,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts/core';
import { type FirmId, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import { type PropAccountRow } from '~/server/db/schemas/prop';

import {
    accountFor,
    alertsOf,
    ANY_EVAL_PLAN,
    EXTERNAL_FIRM_ID,
    ledgerOnlyAccountFor,
} from './alertFixtures';

const rule = new UnresolvablePlanRule();

describe('UnresolvablePlanRule', () => {
    it('is silent for a resolvable plan', () => {
        expect(
            alertsOf(rule, { accounts: [accountFor(ANY_EVAL_PLAN)] }),
        ).toEqual([]);
    });

    it('is silent for a ledger-only account at a listed or an external firm, which has no plan to resolve', () => {
        expect(
            alertsOf(rule, {
                accounts: [
                    ledgerOnlyAccountFor(ANY_EVAL_PLAN),
                    ledgerOnlyAccountFor(ANY_EVAL_PLAN, {
                        externalFirmId: EXTERNAL_FIRM_ID,
                        firmId: null,
                    }),
                ],
            }),
        ).toEqual([]);
    });

    it('fires for an unknown plan serial and names the serial', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            planSerial: 'retired-plan',
        });
        const alerts = alertsOf(rule, { accounts: [account] });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.UnresolvablePlan);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('retired-plan');
        expect(alerts[0]?.message).toContain('read-only');
    });

    it('fires without throwing for an unknown firm, whatever the status', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            firmId: 'gone-firm' as FirmId,
            status: AccountStatus.Closed,
        });
        const alerts = alertsOf(rule, { accounts: [account] });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('gone-firm');
    });

    it('fires for an account size that does not match the plan', () => {
        const account = accountFor(ANY_EVAL_PLAN, { accountSize: 123_456 });
        const alerts = alertsOf(rule, { accounts: [account] });
        expect(alerts[0]?.message).toContain('123456');
    });

    it('fires for corrupt stored opt-ins instead of throwing', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            optIns: {
                takesFundedReset: 'yes',
            } as unknown as PropAccountRow['optIns'],
        });
        const alerts = alertsOf(rule, { accounts: [account] });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('opt-ins');
        expect(alerts[0]?.message).toContain(account.planSerial);
        expect(alerts[0]?.message).toContain('read-only');
    });

    it('fires for a row read with placeholder opt-ins and a corrupt opt-ins issue', () => {
        const corruptOptIns: AccountReadIssue = {
            kind: AccountReadIssueKind.UnresolvablePlan,
            reason: UnresolvedPlanReason.CorruptOptIns,
        };
        const account = accountFor(ANY_EVAL_PLAN, {
            optIns: NO_PLAN_OPT_INS,
            readIssues: [corruptOptIns],
        });
        const alerts = alertsOf(rule, { accounts: [account] });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.UnresolvablePlan);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain('opt-ins');
        expect(alerts[0]?.message).toContain(account.planSerial);
        expect(alerts[0]?.message).toContain('read-only');
    });

    it('stays silent for a row whose only read issue is unreadable personal rules', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            readIssues: [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
        });
        expect(alertsOf(rule, { accounts: [account] })).toEqual([]);
    });
});
