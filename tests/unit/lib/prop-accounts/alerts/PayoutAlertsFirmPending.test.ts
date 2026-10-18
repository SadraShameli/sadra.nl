import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    LiveTriggerNearRule,
    PayoutEligibleRule,
    PayoutReadyOpenRiskRule,
    PayoutReadyWithdrawableDropRule,
} from '~/lib/prop-accounts/alerts';
import { firmPayoutCountIn } from '~/lib/prop-accounts/alerts/AlertContext';
import {
    AccountStage,
    PayoutStatus,
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
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    createSizingAdvisor,
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

function requestedPayout(
    account: ReturnType<typeof fundedAccountFor>,
    requestedOn: string,
) {
    return paidPayout(account, {
        netCents: null,
        paidOn: null,
        requestedOn,
        status: PayoutStatus.Requested,
    });
}

function withFirmTotal<T>(cap: number, run: () => T): T {
    return withTriggers(
        [new PayoutCountTotalTrigger(cap, CONFIRMED_SOURCE)],
        run,
    );
}

function withPerAccountCap<T>(run: () => T): T {
    return withTriggers(
        [new PayoutCountPerAccountTrigger(4, CONFIRMED_SOURCE)],
        run,
    );
}

function withTriggers<T>(
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

describe('firmPayoutCountIn: the one firm count the alerts share (PT-36l, F-145)', () => {
    it('counts the paid and the requested payouts of every account at the firm, archived ones included', () => {
        const account = fundedAccountFor();
        const archived = accountFor(
            { firmId: plan.id.firm, plan },
            {
                archivedAt: new Date('2026-09-10T00:00:00Z'),
                stage: AccountStage.Funded,
            },
        );
        const count = firmPayoutCountIn(
            contextOf({
                accounts: [account, archived],
                payouts: [
                    paidPayout(account, { paidOn: '2026-09-02' }),
                    requestedPayout(archived, '2026-09-15'),
                    requestedPayout(account, '2026-09-16'),
                ],
            }),
            plan.id.firm,
        );
        expect(count).toMatchObject({
            asOf: WEDNESDAY,
            firmId: plan.id.firm,
            paidPayoutsSinceLastLiveAccount: 1,
            requestedPayoutsSinceLastLiveAccount: 2,
        });
    });

    it('is null while a sibling payout has an invalid stored date, so no surface treats an unknown count as zero', () => {
        const account = fundedAccountFor();
        const sibling = fundedAccountFor();
        const context = contextOf({
            accounts: [account, sibling],
            payouts: [paidPayout(sibling, { paidOn: 'not a date' })],
        });
        expect(firmPayoutCountIn(context, plan.id.firm)).toBeNull();
    });

    it('is null while an archived account at the firm cannot be read', () => {
        const account = fundedAccountFor();
        const unreadable = accountFor(
            { firmId: plan.id.firm, plan },
            {
                archivedAt: new Date('2026-09-10T00:00:00Z'),
                planSerial: null,
                stage: AccountStage.Funded,
            },
        );
        expect(
            firmPayoutCountIn(
                contextOf({ accounts: [account, unreadable] }),
                plan.id.firm,
            ),
        ).toBeNull();
    });

    it('is computed at the date it is asked for and records that date', () => {
        const account = fundedAccountFor();
        const context = contextOf({
            accounts: [account],
            payouts: [
                paidPayout(account, { paidOn: '2026-09-02' }),
                paidPayout(account, { paidOn: '2026-09-18' }),
            ],
        });
        expect(
            firmPayoutCountIn(context, plan.id.firm, '2026-09-10'),
        ).toMatchObject({
            asOf: '2026-09-10',
            paidPayoutsSinceLastLiveAccount: 1,
        });
    });

    it('is the only place under the alerts that filters the members of a firm', () => {
        const alertsDirectory = path.resolve(
            import.meta.dirname,
            '../../../../../src/lib/prop-accounts/alerts',
        );
        const source = readFileSync(
            path.join(alertsDirectory, 'LiveTriggerNearRule.ts'),
            'utf8',
        );
        expect(source).not.toMatch(/member\.account\.firmId/);
        expect(source).not.toMatch(/\.\.\.context\.archivedAccounts/);
    });
});

describe('every payout alert counts the sibling requested payouts the near-live alert counts (PT-36l, F-145)', () => {
    const rulebook: RulebookParameters = {
        ...DEFAULT_RULEBOOK,
        alerts: {
            ...DEFAULT_RULEBOOK.alerts,
            payoutReadyLossFraction: 0.2,
            payoutReadyRiskAboveRungCents: usdCents(1),
        },
    };

    function surfacesAt(cap: number) {
        const account = fundedAccountFor();
        const sibling = fundedAccountFor();
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
        const inputs = {
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
            payouts: [
                paidPayout(account, { paidOn: '2026-09-02' }),
                paidPayout(sibling, { paidOn: '2026-09-03' }),
                requestedPayout(sibling, '2026-09-10'),
                requestedPayout(sibling, '2026-09-11'),
            ],
            rulebook,
        };
        const kinds = (
            rule: Parameters<typeof alertsOf>[0],
            accountStates: Parameters<typeof alertsOf>[1]['accountStates'],
        ) =>
            withFirmTotal(cap, () =>
                alertsOf(rule, { ...inputs, accountStates }).map(
                    (alert) => alert.kind,
                ),
            );
        const eligibleOnly = [reconstructedEntry(account.id, plan, funded)];
        const droppedSince = [
            reconstructedEntry(account.id, plan, latest, {
                previous: funded,
                previousAsOf: '2026-09-16',
            }),
        ];
        return {
            drop: kinds(new PayoutReadyWithdrawableDropRule(), droppedSince),
            eligible: kinds(new PayoutEligibleRule(), eligibleOnly),
            near: withFirmTotal(cap, () =>
                alertsOf(new LiveTriggerNearRule(), {
                    ...inputs,
                    accountStates: eligibleOnly,
                }),
            ),
            openRisk: kinds(new PayoutReadyOpenRiskRule(), eligibleOnly),
            withdrawable: fundedWithdrawableDollarsOf(rulebook, funded),
        };
    }

    it('says nothing is eligible where the near-live alert says the next payout would trigger the move live', () => {
        const surfaces = surfacesAt(5);
        expect(surfaces.near.map((alert) => alert.kind)).toEqual([
            AlertKind.LiveTriggerNear,
        ]);
        expect(surfaces.near[0]?.severity).toBe(AlertSeverity.Warning);
        expect(surfaces.eligible).toEqual([]);
        expect(surfaces.openRisk).toEqual([]);
        expect(surfaces.drop).toEqual([]);
        expect(surfaces.withdrawable).toBeGreaterThan(0);
    });

    it('offers the payout in every alert while the sibling requests still leave the next payout under the cap', () => {
        const surfaces = surfacesAt(6);
        expect(surfaces.near).toEqual([]);
        expect(surfaces.eligible).toEqual([AlertKind.PayoutEligible]);
        expect(surfaces.openRisk).toEqual([AlertKind.PayoutReadyOpenRisk]);
        expect(surfaces.drop).toEqual([AlertKind.PayoutReadyWithdrawableDrop]);
    });
});

function eligibleKindsWith(hasOwnRequest: boolean) {
    const account = fundedAccountFor();
    const funded = eligibleFunded();
    const payouts = [paidPayout(account, { paidOn: '2026-09-02' })];
    if (hasOwnRequest) payouts.push(requestedPayout(account, '2026-09-10'));
    const alerts = withFirmTotal(3, () =>
        alertsOf(new PayoutEligibleRule(), {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
            payouts,
        }),
    );
    return alerts.map((alert) => alert.kind);
}

describe('the eligible alert counts a request the account made before its snapshot (PT-36l, F-145)', () => {
    it('is silent when the paid and the requested payouts make the next one the third', () => {
        expect(eligibleKindsWith(true)).toEqual([]);
    });

    it('stays eligible with only the paid payout counted', () => {
        expect(eligibleKindsWith(false)).toEqual([AlertKind.PayoutEligible]);
    });
});

function eligibleKindsUnderPerAccountCap(ownRequestDates: readonly string[]) {
    const account = fundedAccountFor();
    const funded = eligibleFunded();
    const alerts = withPerAccountCap(() =>
        alertsOf(new PayoutEligibleRule(), {
            accounts: [account],
            accountStates: [reconstructedEntry(account.id, plan, funded)],
            payouts: ownRequestDates.map((day) =>
                requestedPayout(account, day),
            ),
        }),
    );
    return alerts.map((alert) => alert.kind);
}

describe('the eligible alert counts every own request against a per-account cap (PT-36l, F-145)', () => {
    it('is silent when one issued and two requested payouts make the next one the fourth of a cap of four', () => {
        expect(
            eligibleKindsUnderPerAccountCap(['2026-09-10', '2026-09-11']),
        ).toEqual([]);
    });

    it('stays eligible with one issued and one requested payout under the same cap', () => {
        expect(eligibleKindsUnderPerAccountCap(['2026-09-10'])).toEqual([
            AlertKind.PayoutEligible,
        ]);
    });

    it('agrees with the readiness board for the same account', () => {
        const account = fundedAccountFor();
        const funded = eligibleFunded();
        const board = withPerAccountCap(() =>
            payoutReadinessBoardOf(
                DEFAULT_RULEBOOK,
                [reconstructedEntry(account.id, plan, funded)],
                new Map([
                    [
                        account.id,
                        {
                            paidPayoutsSinceLastLiveAccount: 0,
                            pendingPayoutCounts: {
                                otherAccountsPendingPayoutCount: 0,
                                pendingPayoutCount: 2,
                            },
                        },
                    ],
                ]),
            ),
        );
        expect(board.rows[0]?.kind).toBe(PayoutReadinessRowKind.Blocked);
        expect(
            eligibleKindsUnderPerAccountCap(['2026-09-10', '2026-09-11']),
        ).toEqual([]);
    });
});
