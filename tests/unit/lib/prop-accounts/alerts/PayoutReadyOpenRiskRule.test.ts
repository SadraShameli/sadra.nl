import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    PayoutReadyOpenRiskRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountStage,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf, WEDNESDAY } from './alertFixtures';

const rule = new PayoutReadyOpenRiskRule();

function decisionFor(
    accountId: string,
    acceptedRiskCents: number,
    actualRiskCents: null | number,
    decidedOn = WEDNESDAY,
) {
    return {
        acceptedRiskCents: usdCents(acceptedRiskCents),
        accountId,
        actualRiskCents:
            actualRiskCents === null ? null : usdCents(actualRiskCents),
        decidedOn,
    };
}

function documentedRungCents(): number {
    const { funded } = eligibleFunded();
    const rung = createSizingAdvisor(funded, {
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: WEDNESDAY,
        today: WEDNESDAY,
    }).documented()?.rungs[0];
    if (rung === undefined) throw new Error('expected a documented rung');
    return usdCentsFromDollars(rung.risk);
}

function eligibleFunded() {
    const plan = mffProPlan();
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + 20_000,
        cumulativePayout: 0,
        cycleBestDayProfit: 20_000,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return { funded, plan };
}

function rulebookWithThreshold(cents: null | number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        alerts: {
            ...DEFAULT_RULEBOOK.alerts,
            payoutReadyRiskAboveRungCents:
                cents === null ? null : usdCents(cents),
        },
    };
}

function setup(asOf = WEDNESDAY) {
    const { funded, plan } = eligibleFunded();
    const account = accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
    return {
        account,
        entry: reconstructedEntry(account.id, plan, funded, { asOf }),
    };
}

describe('PayoutReadyOpenRiskRule', () => {
    it('has a documented rung above zero for the fixture', () => {
        expect(documentedRungCents()).toBeGreaterThan(0);
    });

    it('is off entirely when payoutReadyRiskAboveRungCents is null', () => {
        const { account, entry } = setup();
        const rung = documentedRungCents();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                decisions: [decisionFor(account.id, rung * 5, rung * 5)],
                rulebook: rulebookWithThreshold(null),
            }),
        ).toEqual([]);
    });

    it('never fires on an eligible account trading exactly the documented rung', () => {
        const { account, entry } = setup();
        const rung = documentedRungCents();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                decisions: [decisionFor(account.id, rung, rung)],
                rulebook: rulebookWithThreshold(1),
            }),
        ).toEqual([]);
    });

    it('warns when the recorded risk is above the rung by more than the threshold', () => {
        const { account, entry } = setup();
        const rung = documentedRungCents();
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [entry],
            decisions: [decisionFor(account.id, rung, rung + 10_000)],
            rulebook: rulebookWithThreshold(5000),
        });
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.PayoutReadyOpenRisk);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.message).toContain('payout');
        expect(alert?.message).toContain('$100');
    });

    it('is silent when the excess equals the threshold and fires one cent above it', () => {
        const { account, entry } = setup();
        const rung = documentedRungCents();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                decisions: [decisionFor(account.id, rung, rung + 5000)],
                rulebook: rulebookWithThreshold(5000),
            }),
        ).toEqual([]);
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                decisions: [decisionFor(account.id, rung, rung + 5001)],
                rulebook: rulebookWithThreshold(5000),
            }),
        ).toHaveLength(1);
    });

    it('uses the accepted risk when no actual risk was recorded', () => {
        const { account, entry } = setup();
        const rung = documentedRungCents();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                decisions: [decisionFor(account.id, rung + 10_000, null)],
                rulebook: rulebookWithThreshold(5000),
            }),
        ).toHaveLength(1);
    });

    it('prefers the actual risk over the accepted risk', () => {
        const { account, entry } = setup();
        const rung = documentedRungCents();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                decisions: [decisionFor(account.id, rung + 10_000, rung)],
                rulebook: rulebookWithThreshold(5000),
            }),
        ).toEqual([]);
    });

    it('uses the latest decision of the day, which is first in the list', () => {
        const { account, entry } = setup();
        const rung = documentedRungCents();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                decisions: [
                    decisionFor(account.id, rung, rung),
                    decisionFor(account.id, rung, rung + 10_000),
                ],
                rulebook: rulebookWithThreshold(5000),
            }),
        ).toEqual([]);
    });

    it('is silent when the account is not payout-eligible per the readiness board', () => {
        const plan = mffProPlan();
        const fresh = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
        });
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const rung = documentedRungCents();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [reconstructedEntry(account.id, plan, fresh)],
                decisions: [decisionFor(account.id, rung * 5, rung * 5)],
                rulebook: rulebookWithThreshold(1),
            }),
        ).toEqual([]);
    });

    it('is silent for an eval account', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Eval },
        );
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(
                        account.id,
                        plan,
                        evalReconstructed(plan),
                    ),
                ],
                decisions: [decisionFor(account.id, 500_000, 500_000)],
                rulebook: rulebookWithThreshold(1),
            }),
        ).toEqual([]);
    });

    it('ignores a decision from another day, another account or none at all', () => {
        const { account, entry } = setup();
        const rung = documentedRungCents();
        const other = accountFor(
            { firmId: mffProPlan().id.firm, plan: mffProPlan() },
            { stage: AccountStage.Funded },
        );
        for (const decisions of [
            [decisionFor(account.id, rung * 5, rung * 5, '2026-09-22')],
            [decisionFor(other.id, rung * 5, rung * 5)],
            [],
        ]) {
            expect(
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    decisions,
                    rulebook: rulebookWithThreshold(1),
                }),
            ).toEqual([]);
        }
    });

    it('is silent on a stale snapshot rather than judging against an outdated rung', () => {
        const { account, entry } = setup('2026-08-01');
        const rung = documentedRungCents();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                decisions: [decisionFor(account.id, rung * 5, rung * 5)],
                rulebook: rulebookWithThreshold(1),
            }),
        ).toEqual([]);
    });
});
