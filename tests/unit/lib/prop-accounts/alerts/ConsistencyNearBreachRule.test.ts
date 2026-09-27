import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    ConsistencyNearBreachRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import { CENTS_PER_DOLLAR, findFirm, FirmId, MffuVariant } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    fundedReconstructed,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf } from './alertFixtures';

const rule = new ConsistencyNearBreachRule();

function mffBuilder() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Builder,
    });
    if (!plan) throw new Error('MFF Builder plan missing');
    return plan;
}

function mffPro() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro plan missing');
    return plan;
}

describe('ConsistencyNearBreachRule', () => {
    it('is critical, with the extra cycle profit needed, once the rule is already violated', () => {
        const plan = mffBuilder();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 10_000,
            cycleBestDayProfit: 8000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.ConsistencyNearBreach);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        expect(alerts[0]?.message).toContain('$6,000');
    });

    it('warns when one documented winning day would break the rule', () => {
        const plan = mffBuilder();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 100,
            cycleBestDayProfit: 40,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(
            `$${(DEFAULT_RULEBOOK.funded.takeProfitCents / CENTS_PER_DOLLAR).toLocaleString('en-US')}`,
        );
    });

    it('is silent with plenty of room before the rule could break', () => {
        const plan = mffBuilder();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 10_000,
            cycleBestDayProfit: 40,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toEqual([]);
    });

    it('is silent for a plan whose funded stage carries no consistency rule', () => {
        const plan = mffPro();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 10_000,
            cycleBestDayProfit: 8000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 0,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toEqual([]);
    });
});
