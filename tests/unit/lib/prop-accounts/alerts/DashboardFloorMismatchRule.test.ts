import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    DashboardFloorMismatchRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import {
    AssumptionBias,
    AssumptionKind,
    inputAssumption,
} from '~/lib/prop-calculator/advisor';

import {
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf } from './alertFixtures';

const rule = new DashboardFloorMismatchRule();

describe('DashboardFloorMismatchRule', () => {
    it('names the entered floor as the one being used, above the engine calculated floor', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            assumptions: [
                inputAssumption(
                    AssumptionKind.DashboardFloorMismatch,
                    AssumptionBias.Conservative,
                ),
            ],
            balance: plan.accountSize + 5000,
            dashboardFloorMismatch: {
                engineFloor: plan.accountSize - 1000,
                enteredFloor: plan.accountSize,
            },
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.DashboardFloorMismatch);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.message).toContain(
            "above the engine's own calculated floor",
        );
        expect(alerts[0]?.message).not.toContain('below');
        expect(alerts[0]?.message).not.toContain('the engine floor is used');
        expect(alerts[0]?.message).toContain(
            'is used as the more conservative one',
        );
    });

    it('names both the engine floor and the entered floor', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            assumptions: [
                inputAssumption(
                    AssumptionKind.DashboardFloorMismatch,
                    AssumptionBias.Conservative,
                ),
            ],
            balance: plan.accountSize + 5000,
            dashboardFloorMismatch: {
                engineFloor: 49_000,
                enteredFloor: 50_000,
            },
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('$49,000');
        expect(alerts[0]?.message).toContain('$50,000');
    });

    it('is silent without the reconstruction warning', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 5000,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toEqual([]);
    });
});
