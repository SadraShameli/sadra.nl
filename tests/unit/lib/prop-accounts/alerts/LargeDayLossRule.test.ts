import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    LargeDayLossRule,
} from '~/lib/prop-accounts/alerts';
import { AccountStage, AccountStatus, usdCents } from '~/lib/prop-accounts/core';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf } from './alertFixtures';

const rule = new LargeDayLossRule();

function fundedAt(extraProfit: number) {
    const plan = mffProPlan();
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + extraProfit,
        cumulativePayout: 0,
        cycleBestDayProfit: Math.max(0, extraProfit),
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return funded;
}

function fundedLoss(asOf = '2026-09-23') {
    const plan = mffProPlan();
    const account = accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
    return {
        account,
        entry: reconstructedEntry(account.id, plan, fundedAt(1000), {
            asOf,
            previous: fundedAt(20_000),
            previousAsOf: '2026-09-18',
        }),
    };
}

function rulebookWithFraction(fraction: null | number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        alerts: {
            ...DEFAULT_RULEBOOK.alerts,
            dayLossBankrollFraction: fraction,
        },
    };
}

describe('LargeDayLossRule', () => {
    it('is off when dayLossBankrollFraction is null', () => {
        const { account, entry } = fundedLoss();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                availableBankrollCents: usdCents(100_000),
                rulebook: rulebookWithFraction(null),
            }),
        ).toEqual([]);
    });

    it('warns when a recent day lost more than the fraction of the available bankroll', () => {
        const { account, entry } = fundedLoss();
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [entry],
            availableBankrollCents: usdCents(100_000),
            rulebook: rulebookWithFraction(0.05),
        });
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.LargeDayLoss);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject).toEqual({
            accountIds: [account.id],
            kind: AlertSubjectKind.Portfolio,
        });
        expect(alert?.message).toContain('2026-09-23');
    });

    it('raises one alert for the worst day even when several recent days exceed the fraction, so the alert list never repeats a key', () => {
        const first = fundedLoss('2026-09-23');
        const second = fundedLoss('2026-09-22');
        const alerts = alertsOf(rule, {
            accounts: [first.account, second.account],
            accountStates: [first.entry, second.entry],
            availableBankrollCents: usdCents(100_000),
            rulebook: rulebookWithFraction(0.05),
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('2 recent days');
        expect(alerts[0]?.subject).toEqual({
            accountIds: expect.arrayContaining([first.account.id]),
            kind: AlertSubjectKind.Portfolio,
        });
    });

    it('is silent when the loss is below the fraction', () => {
        const { account, entry } = fundedLoss();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                availableBankrollCents: usdCents(100_000_000),
                rulebook: rulebookWithFraction(0.5),
            }),
        ).toEqual([]);
    });

    it('is silent without an available bankroll, because the share cannot be computed', () => {
        const { account, entry } = fundedLoss();
        for (const available of [null, usdCents(0)]) {
            expect(
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    availableBankrollCents: available,
                    rulebook: rulebookWithFraction(0.0001),
                }),
            ).toEqual([]);
        }
    });

    it('ignores a loss day older than a week so the alert clears itself', () => {
        const { account, entry } = fundedLoss('2026-09-10');
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                availableBankrollCents: usdCents(100_000),
                rulebook: rulebookWithFraction(0.01),
            }),
        ).toEqual([]);
    });

    it('labels an eval loss as the retry-fee approximation, never as fees already paid', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Eval },
        );
        const entry = reconstructedEntry(
            account.id,
            plan,
            evalReconstructed(plan, { balance: plan.accountSize - 1000 }),
            {
                asOf: '2026-09-23',
                previous: evalReconstructed(plan),
                previousAsOf: '2026-09-22',
            },
        );
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [entry],
            availableBankrollCents: usdCents(10_000),
            rulebook: rulebookWithFraction(0.01),
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('approximation');
        expect(alerts[0]?.message).toContain('retry fee');
    });

    it('does not count an ended account', () => {
        const { account, entry } = fundedLoss();
        const ended = { ...account, status: AccountStatus.Busted };
        expect(
            alertsOf(rule, {
                accounts: [ended],
                accountStates: [entry],
                availableBankrollCents: usdCents(100_000),
                rulebook: rulebookWithFraction(0.01),
            }),
        ).toEqual([]);
    });
});
