import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    dayLossShareOfContext,
    LargeDayLossRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountStage,
    AccountStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import { DayLossBasis } from '~/lib/prop-accounts/metrics';
import { addIsoDays } from '~/lib/prop-calculator';
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
import { accountFor, alertsOf, contextOf } from './alertFixtures';

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

function fundedLoss(asOf = '2026-09-23', previousAsOf = addIsoDays(asOf, -1)) {
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
            previousAsOf,
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
            accountIds: [first.account.id],
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

    it('says the limit cannot be checked, instead of staying silent, when a loss was measured but there is no available bankroll', () => {
        const { account, entry } = fundedLoss();
        for (const available of [null, usdCents(0), usdCents(-5000)]) {
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                availableBankrollCents: available,
                rulebook: rulebookWithFraction(0.0001),
            });
            expect(alerts).toHaveLength(1);
            const [alert] = alerts;
            expect(alert?.kind).toBe(AlertKind.LargeDayLoss);
            expect(alert?.severity).toBe(AlertSeverity.Info);
            expect(alert?.subject).toEqual({
                accountIds: [account.id],
                kind: AlertSubjectKind.Portfolio,
            });
            expect(alert?.message).toContain('no available bankroll');
            expect(alert?.message).toContain('2026-09-23');
        }
    });

    it('stays off without a fraction and silent without a measured loss when there is no bankroll', () => {
        const { account, entry } = fundedLoss();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                availableBankrollCents: null,
                rulebook: rulebookWithFraction(null),
            }),
        ).toEqual([]);
        expect(
            alertsOf(rule, {
                accounts: [],
                accountStates: [],
                availableBankrollCents: null,
                rulebook: rulebookWithFraction(0.01),
            }),
        ).toEqual([]);
    });

    it('does not turn a loss across several weeks into a day loss', () => {
        const { account, entry } = fundedLoss('2026-09-23', '2026-09-02');
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                availableBankrollCents: usdCents(100_000),
                rulebook: rulebookWithFraction(0.0001),
            }),
        ).toEqual([]);
    });

    it('names the basis of a funded loss as withdrawable, never as expected value', () => {
        const { account, entry } = fundedLoss();
        const [alert] = alertsOf(rule, {
            accounts: [account],
            accountStates: [entry],
            availableBankrollCents: usdCents(100_000),
            rulebook: rulebookWithFraction(0.05),
        });
        expect(alert?.message).toContain('of withdrawable on funded accounts');
        expect(alert?.message).toContain('retained cushion');
        expect(alert?.message).not.toContain('expected value');
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
        expect(alerts[0]?.message).toContain('of estimated eval value');
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

function evalLoss() {
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
    return { account, entry };
}

describe('LargeDayLossRule from-state eval losses (PT-90, F-V29)', () => {
    it('forwards the from-state value loss map into the day loss share', () => {
        const { account, entry } = evalLoss();
        const context = contextOf({
            accounts: [account],
            accountStates: [entry],
            availableBankrollCents: usdCents(10_000),
            evalValueLossDollars: new Map([[account.id, 42.5]]),
            rulebook: rulebookWithFraction(0.01),
        });
        const [day] = dayLossShareOfContext(context).days;
        expect(day?.entries).toEqual([
            {
                accountId: account.id,
                basis: DayLossBasis.EvalFromStateValue,
                lossCents: usdCents(4250),
            },
        ]);
    });

    it('prices the same loss by the retry-fee heuristic when the map holds nothing for the account', () => {
        const { account, entry } = evalLoss();
        const context = contextOf({
            accounts: [account],
            accountStates: [entry],
            availableBankrollCents: usdCents(10_000),
            evalValueLossDollars: new Map([['another-account', 42.5]]),
            rulebook: rulebookWithFraction(0.01),
        });
        const [day] = dayLossShareOfContext(context).days;
        expect(day?.entries.map((row) => row.basis)).toEqual([
            DayLossBasis.EvalFeeHeuristic,
        ]);
    });

    it('says in the alert that the loss is the from-state value change, not the retry-fee approximation', () => {
        const { account, entry } = evalLoss();
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [entry],
            availableBankrollCents: usdCents(10_000),
            evalValueLossDollars: new Map([[account.id, 42.5]]),
            rulebook: rulebookWithFraction(0.01),
        });
        expect(alerts).toHaveLength(1);
        const message = alerts[0]?.message ?? '';
        expect(message).toContain(
            'of eval value lost between the two snapshots',
        );
        expect(message).toContain('from-state');
        expect(message).not.toContain('retry fee');
        expect(message).not.toContain('of estimated eval value');
    });
});
