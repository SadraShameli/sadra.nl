import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    PayoutReadyWithdrawableDropRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage } from '~/lib/prop-accounts/core';
import { DEFAULT_RULEBOOK, type RulebookParameters } from '~/lib/prop-calculator/advisor';

import {
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf } from './alertFixtures';

const rule = new PayoutReadyWithdrawableDropRule();

function eligiblePreviousFunded(plan: ReturnType<typeof mffProPlan>, balance: number) {
    const funded = fundedReconstructed(plan, {
        balance,
        cumulativePayout: 0,
        cycleBestDayProfit: balance - plan.accountSize,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a funded tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return funded;
}

function rulebookWithLossFraction(fraction: null | number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        alerts: { ...DEFAULT_RULEBOOK.alerts, payoutReadyLossFraction: fraction },
    };
}

describe('PayoutReadyWithdrawableDropRule', () => {
    it('is off entirely when payoutReadyLossFraction is null', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = eligiblePreviousFunded(plan, plan.accountSize + 20_000);
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 1000,
            cumulativePayout: 0,
            cycleBestDayProfit: 1000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
            rulebook: rulebookWithLossFraction(null),
        });
        expect(alerts).toEqual([]);
    });

    it('fires Critical when the previous snapshot was payout-eligible and the withdrawable fell too far', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = eligiblePreviousFunded(plan, plan.accountSize + 20_000);
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 1000,
            cumulativePayout: 0,
            cycleBestDayProfit: 1000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
            rulebook: rulebookWithLossFraction(0.2),
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.PayoutReadyWithdrawableDrop);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
    });

    it('is silent when the previous snapshot was not payout-eligible', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
        });
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 1000,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
            rulebook: rulebookWithLossFraction(0.2),
        });
        expect(alerts).toEqual([]);
    });

    it('is silent when the drop is within the loss fraction', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = eligiblePreviousFunded(plan, plan.accountSize + 20_000);
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 19_500,
            cumulativePayout: 0,
            cycleBestDayProfit: 19_500,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
            rulebook: rulebookWithLossFraction(0.2),
        });
        expect(alerts).toEqual([]);
    });
});
