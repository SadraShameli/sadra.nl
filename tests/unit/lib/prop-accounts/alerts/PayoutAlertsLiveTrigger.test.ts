import { describe, expect, it } from 'vitest';

import {
    AlertDisclosure,
    AlertKind,
    PayoutEligibleRule,
    PayoutReadyOpenRiskRule,
    PayoutReadyWithdrawableDropRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountEventKind,
    AccountStage,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    fundedWithdrawableDollarsOf,
    payoutReadinessBoardOf,
    PayoutReadinessRowKind,
} from '~/lib/prop-accounts/metrics';
import {
    findFirm,
    FirmAccountPolicy,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    PayoutRequestDecisionKind,
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

function eligibleFunded(
    plan: Plan,
    balance = plan.accountSize + 20_000,
    pendingPayouts = 0,
) {
    const funded = fundedReconstructed(plan, {
        balance,
        cumulativePayout: 0,
        cycleBestDayProfit: balance - plan.accountSize,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
        pendingPayouts,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    funded.state.qualifyingDays = 999;
    return funded;
}

function fundedAccountFor(plan: Plan) {
    return accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
}

function withPolicy<T>(
    plan: Plan,
    triggers: readonly LiveTransitionTrigger[],
    run: () => T,
): T {
    const firm = findFirm(plan.id.firm) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy(triggers);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('the board, the advisor and the eligible alert count a pending payout the same way (PT-36g)', () => {
    const plan = mffProPlan();

    function surfacesAt(cap: number) {
        const account = fundedAccountFor(plan);
        const sibling = fundedAccountFor(plan);
        const funded = eligibleFunded(plan, plan.accountSize + 20_000, 1000);
        const entry = reconstructedEntry(account.id, plan, funded);
        return withPolicy(
            plan,
            [new PayoutCountTotalTrigger(cap, CONFIRMED_SOURCE)],
            () => {
                const [row] = payoutReadinessBoardOf(
                    DEFAULT_RULEBOOK,
                    [entry],
                    new Map([
                        [
                            account.id,
                            { paidPayoutsSinceLastLiveAccount: 2 },
                        ],
                    ]),
                ).rows;
                const advice = createSizingAdvisor(funded, {
                    accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
                    paidPayoutsSinceLastLiveAccount: 2,
                    rulebook: DEFAULT_RULEBOOK,
                    snapshotAsOf: WEDNESDAY,
                    substate: null,
                    today: WEDNESDAY,
                }).assemble([]);
                const alerts = alertsOf(new PayoutEligibleRule(), {
                    accounts: [account, sibling],
                    accountStates: [entry],
                    payouts: [
                        paidPayout(account, { paidOn: '2026-09-02' }),
                        paidPayout(sibling, { paidOn: '2026-09-03' }),
                    ],
                });
                return {
                    advisor: advice.payoutAdvice?.documented.kind,
                    alerts: alerts.map((alert) => alert.kind),
                    board: row?.kind,
                };
            },
        );
    }

    it('all hold the payout that the pending payout makes the one reaching the verified firm total', () => {
        expect(surfacesAt(4)).toEqual({
            advisor: PayoutRequestDecisionKind.NotEligible,
            alerts: [],
            board: PayoutReadinessRowKind.Blocked,
        });
    });

    it('all offer the payout while the pending payout still leaves it under the verified firm total', () => {
        expect(surfacesAt(5)).toEqual({
            advisor: PayoutRequestDecisionKind.Request,
            alerts: [AlertKind.PayoutEligible],
            board: PayoutReadinessRowKind.Eligible,
        });
    });
});

describe('PayoutEligibleRule under a verified live trigger (PT-36g)', () => {
    const rule = new PayoutEligibleRule();
    const plan = mffProPlan();

    it('is silent when the next payout is the one a verified per-account trigger moves live', () => {
        const account = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountPerAccountTrigger(2, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [
                        reconstructedEntry(
                            account.id,
                            plan,
                            eligibleFunded(plan),
                        ),
                    ],
                }),
        );
        expect(alerts).toEqual([]);
    });

    it('still says eligible one payout under the verified per-account trigger', () => {
        const account = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [
                        reconstructedEntry(
                            account.id,
                            plan,
                            eligibleFunded(plan),
                        ),
                    ],
                }),
        );
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutEligible,
        ]);
    });

    it('is silent when the firm-wide count across the firm accounts reaches the verified firm trigger', () => {
        const account = fundedAccountFor(plan);
        const sibling = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [
                        reconstructedEntry(
                            account.id,
                            plan,
                            eligibleFunded(plan),
                        ),
                    ],
                    payouts: [
                        paidPayout(account, { paidOn: '2026-09-02' }),
                        paidPayout(sibling, { paidOn: '2026-09-03' }),
                    ],
                }),
        );
        expect(alerts).toEqual([]);
    });

    it('counts only the payouts paid after the firm latest move live', () => {
        const account = fundedAccountFor(plan);
        const sibling = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [
                        reconstructedEntry(
                            account.id,
                            plan,
                            eligibleFunded(plan),
                        ),
                    ],
                    events: [movedLiveEvent(sibling, '2026-09-04')],
                    payouts: [
                        paidPayout(account, { paidOn: '2026-09-02' }),
                        paidPayout(sibling, { paidOn: '2026-09-03' }),
                    ],
                }),
        );
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutEligible,
        ]);
    });

    it('counts the payouts of an archived account at the firm', () => {
        const account = fundedAccountFor(plan);
        const archived = accountFor(
            { firmId: plan.id.firm, plan },
            {
                archivedAt: new Date('2026-09-10T00:00:00Z'),
                stage: AccountStage.Funded,
            },
        );
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, archived],
                    accountStates: [
                        reconstructedEntry(
                            account.id,
                            plan,
                            eligibleFunded(plan),
                        ),
                    ],
                    payouts: [
                        paidPayout(account, { paidOn: '2026-09-02' }),
                        paidPayout(archived, { paidOn: '2026-09-03' }),
                    ],
                }),
        );
        expect(alerts).toEqual([]);
    });

    it('counts the account pending payout toward a verified firm total, as the readiness board does', () => {
        const account = fundedAccountFor(plan);
        const sibling = fundedAccountFor(plan);
        const funded = eligibleFunded(
            plan,
            plan.accountSize + 20_000,
            1000,
        );
        const entry = reconstructedEntry(account.id, plan, funded);
        const payouts = [
            paidPayout(account, { paidOn: '2026-09-02' }),
            paidPayout(sibling, { paidOn: '2026-09-03' }),
        ];
        const inputs = {
            accounts: [account, sibling],
            accountStates: [entry],
            payouts,
        };
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE)],
            () => alertsOf(rule, inputs),
        );
        const [boardRow] = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE)],
            () =>
                payoutReadinessBoardOf(
                    DEFAULT_RULEBOOK,
                    [entry],
                    new Map([
                        [account.id, { paidPayoutsSinceLastLiveAccount: 2 }],
                    ]),
                ).rows,
        );
        expect(boardRow?.kind).toBe(PayoutReadinessRowKind.Blocked);
        expect(alerts).toEqual([]);
    });

    it('still says eligible at the same firm count when the account has no pending payout', () => {
        const account = fundedAccountFor(plan);
        const sibling = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [
                        reconstructedEntry(
                            account.id,
                            plan,
                            eligibleFunded(plan),
                        ),
                    ],
                    payouts: [
                        paidPayout(account, { paidOn: '2026-09-02' }),
                        paidPayout(sibling, { paidOn: '2026-09-03' }),
                    ],
                }),
        );
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutEligible,
        ]);
    });

    it('does not block on a firm total whose count cannot be read because a sibling has an invalid stored date', () => {
        const account = fundedAccountFor(plan);
        const sibling = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [
                        reconstructedEntry(
                            account.id,
                            plan,
                            eligibleFunded(plan),
                        ),
                    ],
                    payouts: [
                        paidPayout(account, { paidOn: '2026-09-02' }),
                        paidPayout(account, { paidOn: '2026-09-03' }),
                        paidPayout(sibling, { paidOn: 'not a date' }),
                    ],
                }),
        );
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutEligible,
        ]);
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
    });

    it('does not disclose a live-trigger check when every trigger is verified and the firm count is known', () => {
        const account = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(9, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [
                        reconstructedEntry(
                            account.id,
                            plan,
                            eligibleFunded(plan),
                        ),
                    ],
                    payouts: [paidPayout(account, { paidOn: '2026-09-02' })],
                }),
        );
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutEligible,
        ]);
        expect(alerts[0]?.disclosures).toEqual([]);
    });
});

describe('PayoutReadyOpenRiskRule under a verified live trigger (PT-36g)', () => {
    const rule = new PayoutReadyOpenRiskRule();
    const plan = mffProPlan();
    const rulebook: RulebookParameters = {
        ...DEFAULT_RULEBOOK,
        alerts: {
            ...DEFAULT_RULEBOOK.alerts,
            payoutReadyRiskAboveRungCents: usdCents(1),
        },
    };

    function setup() {
        const account = fundedAccountFor(plan);
        const funded = eligibleFunded(plan);
        const rung = createSizingAdvisor(funded, {
            rulebook,
            snapshotAsOf: WEDNESDAY,
            substate: null,
            today: WEDNESDAY,
        }).documented()?.rungs[0];
        if (rung === undefined) throw new Error('expected a documented rung');
        const riskCents = usdCentsFromDollars(rung.risk) + 50_000;
        return {
            account,
            decision: {
                acceptedRiskCents: usdCents(riskCents),
                accountId: account.id,
                actualRiskCents: usdCents(riskCents),
                createdAt: new Date('2026-09-23T10:00:00Z'),
                decidedOn: WEDNESDAY,
                id: 'decision-1',
            },
            entry: reconstructedEntry(account.id, plan, funded),
        };
    }

    it('warns on an eligible account over the rung', () => {
        const { account, decision, entry } = setup();
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [entry],
            decisions: [decision],
            rulebook,
        });
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutReadyOpenRisk,
        ]);
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
    });

    it('does not disclose a live-trigger check when every trigger is verified and the firm count is known', () => {
        const { account, decision, entry } = setup();
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(9, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    decisions: [decision],
                    payouts: [paidPayout(account, { paidOn: '2026-09-02' })],
                    rulebook,
                }),
        );
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutReadyOpenRisk,
        ]);
        expect(alerts[0]?.disclosures).toEqual([]);
    });

    it('discloses that live triggers were not checked when the firm count cannot be read', () => {
        const { account, decision, entry } = setup();
        const sibling = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(9, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [entry],
                    decisions: [decision],
                    payouts: [paidPayout(sibling, { paidOn: 'not a date' })],
                    rulebook,
                }),
        );
        expect(alerts.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutReadyOpenRisk,
        ]);
        expect(alerts[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
    });

    it('is silent when the next payout goes live under a verified per-account trigger, so no payout is available', () => {
        const { account, decision, entry } = setup();
        const alerts = withPolicy(
            plan,
            [new PayoutCountPerAccountTrigger(2, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    decisions: [decision],
                    rulebook,
                }),
        );
        expect(alerts).toEqual([]);
    });

    it('is silent when the account pending payout makes the next payout the one that reaches the verified firm trigger', () => {
        const { account, decision } = setup();
        const sibling = fundedAccountFor(plan);
        const funded = eligibleFunded(plan, plan.accountSize + 20_000, 1000);
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [
                        reconstructedEntry(account.id, plan, funded),
                    ],
                    decisions: [decision],
                    payouts: [
                        paidPayout(account, { paidOn: '2026-09-02' }),
                        paidPayout(sibling, { paidOn: '2026-09-03' }),
                    ],
                    rulebook,
                }),
        );
        expect(alerts).toEqual([]);
    });

    it('is silent when the firm-wide count reaches the verified firm trigger', () => {
        const { account, decision, entry } = setup();
        const sibling = fundedAccountFor(plan);
        const alerts = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [entry],
                    decisions: [decision],
                    payouts: [
                        paidPayout(account, { paidOn: '2026-09-02' }),
                        paidPayout(sibling, { paidOn: '2026-09-03' }),
                    ],
                    rulebook,
                }),
        );
        expect(alerts).toEqual([]);
    });
});

describe('PayoutReadyWithdrawableDropRule under a verified live trigger (PT-36g)', () => {
    const rule = new PayoutReadyWithdrawableDropRule();
    const plan = mffProPlan();
    const rulebook: RulebookParameters = {
        ...DEFAULT_RULEBOOK,
        alerts: { ...DEFAULT_RULEBOOK.alerts, payoutReadyLossFraction: 0.2 },
    };

    function fixtures() {
        const account = fundedAccountFor(plan);
        const previous = eligibleFunded(plan);
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 1000,
            cumulativePayout: 0,
            cycleBestDayProfit: 1000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        const droppedCents = Math.round(
            (fundedWithdrawableDollarsOf(rulebook, previous) -
                fundedWithdrawableDollarsOf(rulebook, latest)) *
                100,
        );
        return {
            account,
            droppedCents,
            entry: reconstructedEntry(account.id, plan, latest, {
                previous,
                previousAsOf: '2026-09-16',
            }),
            latest,
            plan,
        };
    }

    it('fires for the account that was payout-ready', () => {
        const { account, entry } = fixtures();
        expect(
            alertsOf(rule, {
                accounts: [account],
                accountStates: [entry],
                rulebook,
            }).map((alert) => alert.kind),
        ).toEqual([AlertKind.PayoutReadyWithdrawableDrop]);
    });

    it('discloses that live triggers were not checked for an unverified firm and not for a verified one with a known count', () => {
        const { account, entry } = fixtures();
        const unverified = alertsOf(rule, {
            accounts: [account],
            accountStates: [entry],
            rulebook,
        });
        expect(unverified[0]?.disclosures).toEqual([
            AlertDisclosure.LiveTriggersNotChecked,
        ]);
        const verified = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(9, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    rulebook,
                }),
        );
        expect(verified[0]?.disclosures).toEqual([]);
    });

    it('is silent when the earlier state was one whose next payout goes live, so it was never payout-ready', () => {
        const { account, entry } = fixtures();
        const alerts = withPolicy(
            plan,
            [new PayoutCountPerAccountTrigger(2, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    rulebook,
                }),
        );
        expect(alerts).toEqual([]);
    });

    it('counts the earlier pending payout toward a verified firm total, so the account was never payout-ready', () => {
        const { account, latest } = fixtures();
        const sibling = fundedAccountFor(plan);
        const previous = eligibleFunded(plan, plan.accountSize + 20_000, 1000);
        const pendingEntry = reconstructedEntry(account.id, plan, latest, {
            previous,
            previousAsOf: '2026-09-16',
        });
        const payouts = [
            paidPayout(account, { paidOn: '2026-09-02' }),
            paidPayout(sibling, { paidOn: '2026-09-03' }),
        ];
        const fires = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(5, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [pendingEntry],
                    payouts,
                    rulebook,
                }),
        );
        expect(fires.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutReadyWithdrawableDrop,
        ]);
        const silent = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(4, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account, sibling],
                    accountStates: [pendingEntry],
                    payouts,
                    rulebook,
                }),
        );
        expect(silent).toEqual([]);
    });

    it('does not let a live move recorded after the earlier snapshot reset the count of the earlier state', () => {
        const { account, entry } = fixtures();
        const earlyPayouts = [
            paidPayout(account, { paidOn: '2026-09-02' }),
            paidPayout(account, { paidOn: '2026-09-03' }),
        ];
        const silent = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    events: [movedLiveEvent(account, '2026-09-20')],
                    payouts: earlyPayouts,
                    rulebook,
                }),
        );
        expect(silent).toEqual([]);
    });

    it('counts the firm payouts paid up to the earlier snapshot, not later ones', () => {
        const { account, entry } = fixtures();
        const earlyPayouts = [
            paidPayout(account, { paidOn: '2026-09-02' }),
            paidPayout(account, { paidOn: '2026-09-03' }),
        ];
        const silent = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    payouts: earlyPayouts,
                    rulebook,
                }),
        );
        expect(silent).toEqual([]);
        const fires = withPolicy(
            plan,
            [new PayoutCountTotalTrigger(3, CONFIRMED_SOURCE)],
            () =>
                alertsOf(rule, {
                    accounts: [account],
                    accountStates: [entry],
                    events: [
                        {
                            accountId: account.id,
                            kind: AccountEventKind.MovedLive,
                            occurredOn: '2026-09-10',
                        },
                    ],
                    payouts: earlyPayouts,
                    rulebook,
                }),
        );
        expect(fires.map((alert) => alert.kind)).toEqual([
            AlertKind.PayoutReadyWithdrawableDrop,
        ]);
    });
});
