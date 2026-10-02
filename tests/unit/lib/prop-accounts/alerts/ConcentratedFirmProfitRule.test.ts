import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    ConcentratedFirmProfitRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountStage,
    AccountStatus,
    FirmKeyKind,
    firmKeyLabel,
} from '~/lib/prop-accounts/core';
import {
    ALL_FIRMS,
    DiscretionaryTrigger,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import {
    accountFor,
    alertsOf,
    movedLiveEvent,
    paidPayout,
} from './alertFixtures';

const rule = new ConcentratedFirmProfitRule();

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function fundedAccount(extraProfit = 20_000) {
    const plan = mffProPlan();
    const account = accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
    return {
        account,
        entry: reconstructedEntry(account.id, plan, inProfit(extraProfit)),
    };
}

function inProfit(extraProfit: number) {
    const plan = mffProPlan();
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + extraProfit,
        cumulativePayout: 0,
        cycleBestDayProfit: extraProfit,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return funded;
}

function rulebookWith(
    count: null | number,
    share: null | number,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        alerts: {
            ...DEFAULT_RULEBOOK.alerts,
            firmProfitConcentrationCount: count,
            firmProfitConcentrationShare: share,
        },
    };
}

function withStubbedPolicy<T>(policy: FirmAccountPolicy, run: () => T): T {
    const plan = mffProPlan();
    const firm = ALL_FIRMS.find((candidate) => candidate.id === plan.id.firm);
    if (firm === undefined)
        throw new Error('expected the firm to be registered');
    const mutable = firm as { accountPolicy: FirmAccountPolicy };
    const original = mutable.accountPolicy;
    mutable.accountPolicy = policy;
    try {
        return run();
    } finally {
        mutable.accountPolicy = original;
    }
}

describe('ConcentratedFirmProfitRule', () => {
    it('is off when both thresholds are null', () => {
        const first = fundedAccount();
        const second = fundedAccount();
        expect(
            alertsOf(rule, {
                accounts: [first.account, second.account],
                accountStates: [first.entry, second.entry],
                rulebook: rulebookWith(null, null),
            }),
        ).toEqual([]);
    });

    it('fires once for the firm at the count of funded accounts in profit', () => {
        const first = fundedAccount();
        const second = fundedAccount();
        const alerts = alertsOf(rule, {
            accounts: [first.account, second.account],
            accountStates: [first.entry, second.entry],
            rulebook: rulebookWith(2, null),
        });
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.ConcentratedFirmProfit);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject).toEqual({
            accountIds: [first.account.id, second.account.id],
            kind: AlertSubjectKind.Portfolio,
        });
        expect(alert?.message).toContain('2 funded accounts');
    });

    it('raises one alert that names every firm over the limit, so the alert list never repeats a key', () => {
        const plan = mffProPlan();
        const mffu = [fundedAccount(), fundedAccount()];
        const apex = [1, 2].map(() => {
            const account = accountFor(
                { firmId: FirmId.Apex, plan },
                { stage: AccountStage.Funded },
            );
            return {
                account,
                entry: reconstructedEntry(account.id, plan, inProfit(20_000)),
            };
        });
        const all = [...mffu, ...apex];
        const alerts = alertsOf(rule, {
            accounts: all.map((item) => item.account),
            accountStates: all.map((item) => item.entry),
            rulebook: rulebookWith(2, null),
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain(
            firmKeyLabel(
                { firmId: FirmId.Mffu, kind: FirmKeyKind.Modeled },
                [],
            ),
        );
        expect(alerts[0]?.message).toContain(
            firmKeyLabel(
                { firmId: FirmId.Apex, kind: FirmKeyKind.Modeled },
                [],
            ),
        );
        const subject = alerts[0]?.subject;
        expect(subject?.kind).toBe(AlertSubjectKind.Portfolio);
        const named =
            subject !== undefined && 'accountIds' in subject
                ? subject.accountIds
                : [];
        const expected = all.map((item) => item.account.id);
        expect(new Set(named)).toEqual(new Set(expected));
        expect(named).toHaveLength(expected.length);
    });

    it('says how many funded accounts rest on a stale snapshot and how many accounts could not be read, because the withdrawable may be out of date', () => {
        const fresh = fundedAccount();
        const plan = mffProPlan();
        const staleAccount = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const stale = {
            account: staleAccount,
            entry: reconstructedEntry(
                staleAccount.id,
                plan,
                inProfit(20_000),
                { asOf: '2026-08-01' },
            ),
        };
        const unread = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const [alert] = alertsOf(rule, {
            accounts: [fresh.account, stale.account, unread],
            accountStates: [fresh.entry, stale.entry],
            rulebook: rulebookWith(2, null),
        });
        expect(alert?.message).toContain(
            '1 funded account has a stale snapshot',
        );
        expect(alert?.message).toContain('1 active account could not be read');
    });

    it('adds no caveat when every snapshot is fresh and readable', () => {
        const first = fundedAccount();
        const second = fundedAccount();
        const [alert] = alertsOf(rule, {
            accounts: [first.account, second.account],
            accountStates: [first.entry, second.entry],
            rulebook: rulebookWith(2, null),
        });
        expect(alert?.message).not.toContain('stale snapshot');
        expect(alert?.message).not.toContain('could not be read');
    });

    it('is silent just below the count', () => {
        const first = fundedAccount();
        const second = fundedAccount();
        expect(
            alertsOf(rule, {
                accounts: [first.account, second.account],
                accountStates: [first.entry, second.entry],
                rulebook: rulebookWith(3, null),
            }),
        ).toEqual([]);
    });

    it('does not count an account that is not in profit', () => {
        const winning = fundedAccount();
        const flat = fundedAccount(0);
        expect(
            alertsOf(rule, {
                accounts: [winning.account, flat.account],
                accountStates: [winning.entry, flat.entry],
                rulebook: rulebookWith(2, null),
            }),
        ).toEqual([]);
    });

    it('does not count an ended account', () => {
        const winning = fundedAccount();
        const ended = fundedAccount();
        expect(
            alertsOf(rule, {
                accounts: [
                    winning.account,
                    { ...ended.account, status: AccountStatus.Busted },
                ],
                accountStates: [winning.entry, ended.entry],
                rulebook: rulebookWith(2, null),
            }),
        ).toEqual([]);
    });

    it('fires at the share of all withdrawable money held at one firm', () => {
        const only = fundedAccount();
        const alerts = alertsOf(rule, {
            accounts: [only.account],
            accountStates: [only.entry],
            rulebook: rulebookWith(null, 0.5),
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('100.0%');
    });

    it('is silent on the share when nothing is withdrawable', () => {
        const flat = fundedAccount(0);
        expect(
            alertsOf(rule, {
                accounts: [flat.account],
                accountStates: [flat.entry],
                rulebook: rulebookWith(null, 0.01),
            }),
        ).toEqual([]);
    });

    it('reports recent payouts and payouts since the last move live', () => {
        const first = fundedAccount();
        const second = fundedAccount();
        const alerts = alertsOf(rule, {
            accounts: [first.account, second.account],
            accountStates: [first.entry, second.entry],
            events: [movedLiveEvent(first.account, '2026-08-01')],
            payouts: [paidPayout(first.account, { paidOn: '2026-09-10' })],
            rulebook: rulebookWith(2, null),
        });
        expect(alerts[0]?.message).toContain('since the last move live');
        expect(alerts[0]?.message).toContain('last 30 days');
    });

    it('says a verified discretionary firm publishes no threshold', () => {
        const first = fundedAccount();
        const second = fundedAccount();
        const alerts = withStubbedPolicy(
            new StubTriggerPolicy([new DiscretionaryTrigger(CONFIRMED_SOURCE)]),
            () =>
                alertsOf(rule, {
                    accounts: [first.account, second.account],
                    accountStates: [first.entry, second.entry],
                    rulebook: rulebookWith(2, null),
                }),
        );
        expect(alerts[0]?.message).toContain('publishes no threshold');
    });

    it('points to the live trigger alert when the firm publishes a verified numeric trigger', () => {
        const first = fundedAccount();
        const second = fundedAccount();
        const alerts = withStubbedPolicy(
            new StubTriggerPolicy([
                new PayoutCountTotalTrigger(5, CONFIRMED_SOURCE),
            ]),
            () =>
                alertsOf(rule, {
                    accounts: [first.account, second.account],
                    accountStates: [first.entry, second.entry],
                    rulebook: rulebookWith(2, null),
                }),
        );
        expect(alerts[0]?.message).toContain('live trigger alert');
        expect(alerts[0]?.message).not.toContain('publishes no threshold');
    });

    it('does not claim the firm publishes no threshold when its triggers are unverified', () => {
        const first = fundedAccount();
        const second = fundedAccount();
        const alerts = alertsOf(rule, {
            accounts: [first.account, second.account],
            accountStates: [first.entry, second.entry],
            rulebook: rulebookWith(2, null),
        });
        expect(alerts[0]?.message).not.toContain('publishes no threshold');
        expect(alerts[0]?.message).toContain('No verified');
    });
});
