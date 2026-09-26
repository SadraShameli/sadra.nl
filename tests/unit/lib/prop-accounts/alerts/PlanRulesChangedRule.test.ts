import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    PlanRulesChangedRule,
} from '~/lib/prop-accounts/alerts';
import { AccountReadIssueKind, UnresolvedPlanReason } from '~/lib/prop-accounts/core';

import { accountFor, alertsOf, ANY_EVAL_PLAN, ledgerOnlyAccountFor } from './alertFixtures';

const rule = new PlanRulesChangedRule();

describe('PlanRulesChangedRule', () => {
    it('warns naming the account when its plan rules changed since purchase', () => {
        const account = accountFor(ANY_EVAL_PLAN, { planRulesChanged: true });
        const alerts = alertsOf(rule, { accounts: [account] });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.PlanRulesChanged);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(account.label);
    });

    it('is silent when the plan rules did not change', () => {
        const account = accountFor(ANY_EVAL_PLAN, { planRulesChanged: false });
        expect(alertsOf(rule, { accounts: [account] })).toEqual([]);
    });

    it('is silent when the stored value is null, a pre-PT-45 account', () => {
        const account = accountFor(ANY_EVAL_PLAN, { planRulesChanged: null });
        expect(alertsOf(rule, { accounts: [account] })).toEqual([]);
    });

    it('is silent for a row with a read issue, even if flagged changed', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            planRulesChanged: true,
            readIssues: [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
        });
        expect(alertsOf(rule, { accounts: [account] })).toEqual([]);
    });

    it('is silent for an unresolvable plan, even if flagged changed', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            planRulesChanged: true,
            planSerial: 'retired-plan',
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.UnknownPlanSerial,
                },
            ],
        });
        expect(alertsOf(rule, { accounts: [account] })).toEqual([]);
    });

    it('is silent for a ledger-only account, which has no plan rules to compare', () => {
        const account = ledgerOnlyAccountFor(ANY_EVAL_PLAN, {
            planRulesChanged: true,
        });
        expect(alertsOf(rule, { accounts: [account] })).toEqual([]);
    });
});
