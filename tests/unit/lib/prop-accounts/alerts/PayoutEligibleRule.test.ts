import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    PayoutEligibleRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, formatUsdCents, usdCentsFromDollars } from '~/lib/prop-accounts/core';
import { minimumPayoutRequest } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    liveReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf } from './alertFixtures';

const rule = new PayoutEligibleRule();

describe('PayoutEligibleRule', () => {
    it('is info-only when the account is eligible for its effective payout request', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.PayoutEligible);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
    });

    it('is silent on any blocking gate, including a pending payout', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const freshlyFunded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, freshlyFunded)],
        });
        expect(alerts).toEqual([]);
    });

    it('is silent for an eval account (no funded payout to be eligible for)', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Eval },
        );
        const evalAccount = evalReconstructed(plan);
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, evalAccount)],
        });
        expect(alerts).toEqual([]);
    });

    it('discloses that live triggers are not checked when a live account is eligible', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Live },
        );
        const probe = liveReconstructed(plan);
        if (probe.state === null) throw new Error('expected a live state');
        const live = liveReconstructed(plan, {
            balance: probe.state.startingBalance + 50_000,
        });
        if (live.state === null) throw new Error('expected a live state');
        live.state.qualifyingDays = 5;
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, live)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Info);
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
    });

    it('names the firm minimum payout request when it raises the request above the personal target', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const rulebook = {
            ...DEFAULT_RULEBOOK,
            payout: { ...DEFAULT_RULEBOOK.payout, requestCents: 100 },
        };
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
            rulebook,
        });
        expect(alerts).toHaveLength(1);
        const minimum = formatUsdCents(
            usdCentsFromDollars(minimumPayoutRequest(plan)),
        );
        const target = formatUsdCents(usdCentsFromDollars(1));
        expect(alerts[0]?.message).toContain(`Eligible to request ${minimum}`);
        expect(alerts[0]?.message).toContain(
            `firm's minimum payout request`,
        );
        expect(alerts[0]?.message).toContain(target);
    });

    it('carries no live-trigger disclosure for a funded account', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.disclosures).toEqual([]);
    });
});
