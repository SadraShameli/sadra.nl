import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    AlertKind,
    AlertSeverity,
    LiveTriggerNearRule,
    PayoutEligibleRule,
    PayoutReadyOpenRiskRule,
    PayoutReadyWithdrawableDropRule,
} from '~/lib/prop-accounts/alerts';
import { pendingPayoutCountsIn } from '~/lib/prop-accounts/alerts/AlertContext';
import {
    AccountStage,
    PayoutStatus,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    findFirm,
    FirmAccountPolicy,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    PendingPayoutCountsStatus,
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
    contextOf,
    paidPayout,
    WEDNESDAY,
} from './alertFixtures';

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

const plan = mffProPlan();

const rulebook: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    alerts: {
        ...DEFAULT_RULEBOOK.alerts,
        payoutReadyLossFraction: 0.2,
        payoutReadyRiskAboveRungCents: usdCents(1),
    },
};

function eligibleFunded() {
    const balance = plan.accountSize + 20_000;
    const funded = fundedReconstructed(plan, {
        balance,
        cumulativePayout: 0,
        cycleBestDayProfit: balance - plan.accountSize,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    funded.state.qualifyingDays = 999;
    return funded;
}

function fundedAccountFor() {
    return accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
}

function scenario(isSiblingReadable: boolean) {
    const account = fundedAccountFor();
    const sibling = isSiblingReadable
        ? accountFor(
              { firmId: plan.id.firm, plan },
              {
                  archivedAt: new Date('2026-09-10T00:00:00Z'),
                  stage: AccountStage.Funded,
              },
          )
        : unreadableSibling();
    const funded = eligibleFunded();
    const latest = fundedReconstructed(plan, {
        balance: plan.accountSize + 1000,
        cumulativePayout: 0,
        cycleBestDayProfit: 1000,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    const rung = createSizingAdvisor(funded, {
        rulebook,
        snapshotAsOf: WEDNESDAY,
        substate: null,
        today: WEDNESDAY,
    }).documented()?.rungs[0];
    if (rung === undefined) throw new Error('expected a documented rung');
    const riskCents = usdCents(usdCentsFromDollars(rung.risk) + 50_000);
    return {
        account,
        droppedSince: [
            reconstructedEntry(account.id, plan, latest, {
                previous: funded,
                previousAsOf: '2026-09-16',
            }),
        ],
        eligibleOnly: [reconstructedEntry(account.id, plan, funded)],
        inputs: {
            accounts: [account, sibling],
            decisions: [
                {
                    acceptedRiskCents: riskCents,
                    accountId: account.id,
                    actualRiskCents: riskCents,
                    createdAt: new Date('2026-09-23T10:00:00Z'),
                    decidedOn: WEDNESDAY,
                    id: 'decision-1',
                },
            ],
            payouts: [paidPayout(account, { paidOn: '2026-09-02' })],
            rulebook,
        },
    };
}

function unreadableSibling() {
    return accountFor(
        { firmId: plan.id.firm, plan },
        {
            archivedAt: new Date('2026-09-10T00:00:00Z'),
            planSerial: null,
            stage: AccountStage.Funded,
        },
    );
}

function withPerAccountCap<T>(run: () => T): T {
    const firm = findFirm(plan.id.firm) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy([
        new PayoutCountPerAccountTrigger(4, CONFIRMED_SOURCE),
    ]);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('pendingPayoutCountsIn says so when the firm count cannot be read (PT-36m, F-145)', () => {
    it('returns a not-checked outcome, not an own-account count, while an archived sibling cannot be read', () => {
        const account = fundedAccountFor();
        const context = contextOf({
            accounts: [account, unreadableSibling()],
            payouts: [
                paidPayout(account, {
                    netCents: null,
                    paidOn: null,
                    requestedOn: '2026-09-10',
                    status: PayoutStatus.Requested,
                }),
            ],
        });
        const [monitored] = context.accounts;
        if (monitored === undefined) throw new Error('no monitored account');
        expect(pendingPayoutCountsIn(context, monitored, WEDNESDAY)).toEqual({
            status: PendingPayoutCountsStatus.NotChecked,
        });
    });

    it('returns the requested payouts of the account and of the other accounts when the count is readable', () => {
        const account = fundedAccountFor();
        const sibling = fundedAccountFor();
        const requested = (owner: typeof account, day: string) =>
            paidPayout(owner, {
                netCents: null,
                paidOn: null,
                requestedOn: day,
                status: PayoutStatus.Requested,
            });
        const context = contextOf({
            accounts: [account, sibling],
            payouts: [
                requested(account, '2026-09-10'),
                requested(account, '2026-09-11'),
                requested(sibling, '2026-09-12'),
            ],
        });
        const [monitored] = context.accounts;
        if (monitored === undefined) throw new Error('no monitored account');
        expect(pendingPayoutCountsIn(context, monitored, WEDNESDAY)).toEqual({
            counts: {
                otherAccountsPendingPayoutCount: 1,
                pendingPayoutCount: 2,
            },
            status: PendingPayoutCountsStatus.Counted,
        });
    });

    it('does not turn the dollars of a pending payout in the snapshot into a request the ledger does not hold', () => {
        const account = fundedAccountFor();
        const context = contextOf({ accounts: [account] });
        const [monitored] = context.accounts;
        if (monitored === undefined) throw new Error('no monitored account');
        expect(pendingPayoutCountsIn(context, monitored, WEDNESDAY)).toEqual({
            counts: {
                otherAccountsPendingPayoutCount: 0,
                pendingPayoutCount: 0,
            },
            status: PendingPayoutCountsStatus.Counted,
        });
    });
});

type Scenario = ReturnType<typeof scenario>;

function disclosuresOf(
    isSiblingReadable: boolean,
    pick: (fixture: Scenario) => ReturnType<typeof alertsOf>,
) {
    return withPerAccountCap(() =>
        pick(scenario(isSiblingReadable)).map((alert) => alert.disclosures),
    );
}

function dropPick(fixture: Scenario) {
    return alertsOf(new PayoutReadyWithdrawableDropRule(), {
        ...fixture.inputs,
        accountStates: fixture.droppedSince,
    });
}

function eligiblePick(fixture: Scenario) {
    return alertsOf(new PayoutEligibleRule(), {
        ...fixture.inputs,
        accountStates: fixture.eligibleOnly,
    });
}

function openRiskPick(fixture: Scenario) {
    return alertsOf(new PayoutReadyOpenRiskRule(), {
        ...fixture.inputs,
        accountStates: fixture.eligibleOnly,
    });
}

describe('every payout alert discloses a pending count it cannot read (PT-36m, F-145)', () => {
    it('says the live triggers are not checked on the eligible alert, and nothing when the count is readable', () => {
        expect(disclosuresOf(false, eligiblePick)).toEqual([
            [AlertDisclosure.LiveTriggersNotChecked],
        ]);
        expect(disclosuresOf(true, eligiblePick)).toEqual([[]]);
    });

    it('says the live triggers are not checked on the open-risk alert, and nothing when the count is readable', () => {
        expect(disclosuresOf(false, openRiskPick)).toEqual([
            [AlertDisclosure.LiveTriggersNotChecked],
        ]);
        expect(disclosuresOf(true, openRiskPick)).toEqual([[]]);
    });

    it('says the live triggers are not checked on the withdrawable-drop alert, and nothing when the count is readable', () => {
        expect(disclosuresOf(false, dropPick)).toEqual([
            [AlertDisclosure.LiveTriggersNotChecked],
        ]);
        expect(disclosuresOf(true, dropPick)).toEqual([[]]);
    });

    it('warns on the near-live alert that a per-account trigger is not checked, rather than staying silent', () => {
        const alerts = withPerAccountCap(() => {
            const fixture = scenario(false);
            return alertsOf(new LiveTriggerNearRule(), {
                ...fixture.inputs,
                accountStates: fixture.eligibleOnly,
            });
        });
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.LiveTriggerNear,
        ]);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
        expect(alerts[0]?.message).toContain('cannot be read');
    });

    it('stays silent on the near-live alert for a readable count that is far from the cap', () => {
        const alerts = withPerAccountCap(() => {
            const fixture = scenario(true);
            return alertsOf(new LiveTriggerNearRule(), {
                ...fixture.inputs,
                accountStates: fixture.eligibleOnly,
            });
        });
        expect(alerts).toEqual([]);
    });
});
