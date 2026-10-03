import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type AlertAccountRow,
    AlertDisclosure,
    AlertKind,
    PayoutCountMismatchRule,
    PayoutDollarMismatchRule,
} from '~/lib/prop-accounts/alerts';
import {
    grossDisclosureOf,
    isActive,
    NO_PERSONAL_POLICY,
    paidLedgerTotal,
    payoutsTakenOf,
    personalPolicyIn,
    personalRulebookOf,
    requestedLedgerTotal,
} from '~/lib/prop-accounts/alerts/AlertContext';
import {
    type AccountReadIssue,
    AccountReadIssueKind,
    AccountRowShapeError,
    AccountStage,
    AccountStatus,
    AccountTracking,
    PayoutStatus,
    PlanKeyResolutionKind,
    type StoredFirmId,
    UnresolvedPlanReason,
    usdCents,
} from '~/lib/prop-accounts/core';
import {
    type AccountStateEntry,
    AccountStateKind,
    AccountStateUnavailableKind,
} from '~/lib/prop-accounts/metrics';
import { dollars, type FirmId, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { type PropAccountRow } from '~/server/db/schemas/prop';

import {
    accountFor,
    alertsOf,
    ANY_EVAL_PLAN,
    contextOf,
    EXTERNAL_FIRM_ID,
    ledgerOnlyAccountFor,
    MONDAY,
    movedLiveEvent,
    paidPayout,
    personalPoliciesFor,
    snapshotFor,
    TUESDAY,
    WEDNESDAY,
} from './alertFixtures';

describe('createAlertContext', () => {
    it('picks the latest snapshot by as-of date, then creation time, then id', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const older = snapshotFor(account, { asOf: MONDAY });
        const sameDayEarly = snapshotFor(account, {
            asOf: TUESDAY,
            createdAt: new Date('2026-09-22T08:00:00Z'),
            id: '20000000-0000-4000-8000-000000000009',
        });
        const sameDayLate = snapshotFor(account, {
            asOf: TUESDAY,
            createdAt: new Date('2026-09-22T09:00:00Z'),
            id: '20000000-0000-4000-8000-000000000001',
        });
        const context = contextOf({
            accounts: [account],
            snapshots: [sameDayLate, older, sameDayEarly],
        });
        expect(context.accounts[0]?.latestSnapshot).toBe(sameDayLate);

        const tieLow = { ...sameDayLate, id: 'a' };
        const tieHigh = { ...sameDayLate, id: 'b' };
        expect(
            contextOf({ accounts: [account], snapshots: [tieLow, tieHigh] })
                .accounts[0]?.latestSnapshot,
        ).toBe(tieHigh);
    });

    it('exposes the previous snapshot by the same ordering, next to the unchanged latest', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const oldest = snapshotFor(account, { asOf: MONDAY });
        const middle = snapshotFor(account, { asOf: TUESDAY });
        const newest = snapshotFor(account, {
            asOf: '2026-09-24',
        });
        const context = contextOf({
            accounts: [account],
            snapshots: [newest, oldest, middle],
        });
        expect(context.accounts[0]?.latestSnapshot).toBe(newest);
        expect(context.accounts[0]?.previousSnapshot).toBe(middle);
    });

    it('has no previous snapshot with zero or one dated snapshot', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        expect(
            contextOf({ accounts: [account] }).accounts[0]?.previousSnapshot,
        ).toBeNull();
        const only = snapshotFor(account);
        expect(
            contextOf({ accounts: [account], snapshots: [only] }).accounts[0]
                ?.previousSnapshot,
        ).toBeNull();
    });

    it('passes lastTradedOn through onto the snapshot row', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const context = contextOf({
            accounts: [account],
            snapshots: [snapshotFor(account, { lastTradedOn: MONDAY })],
        });
        expect(context.accounts[0]?.latestSnapshot?.lastTradedOn).toBe(MONDAY);
    });

    it("defaults a monitored account's state to null when no entry names its id", () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const context = contextOf({ accounts: [account] });
        expect(context.accounts[0]?.accountState).toBeNull();
    });

    it("attaches the account state entry matching the account id, never another account's", () => {
        const first = accountFor(ANY_EVAL_PLAN);
        const second = accountFor(ANY_EVAL_PLAN);
        const secondState: AccountStateEntry = {
            accountId: second.id,
            state: {
                kind: AccountStateKind.Unavailable,
                reason: { kind: AccountStateUnavailableKind.NoSnapshot },
            },
        };
        const context = contextOf({
            accounts: [first, second],
            accountStates: [secondState],
        });
        expect(context.accounts[0]?.accountState).toBeNull();
        expect(context.accounts[1]?.accountState).toEqual(secondState.state);
    });

    it('attaches only the account own payouts and snapshots', () => {
        const first = accountFor(ANY_EVAL_PLAN);
        const second = accountFor(ANY_EVAL_PLAN);
        const payout = paidPayout(second);
        const context = contextOf({
            accounts: [first, second],
            payouts: [payout],
            snapshots: [snapshotFor(second)],
        });
        expect(context.accounts[0]?.payouts).toEqual([]);
        expect(context.accounts[0]?.latestSnapshot).toBeNull();
        expect(context.accounts[1]?.payouts).toEqual([payout]);
    });

    it('leaves archived accounts out', () => {
        const archived = accountFor(ANY_EVAL_PLAN, {
            archivedAt: new Date('2026-09-01T00:00:00Z'),
        });
        const kept = accountFor(ANY_EVAL_PLAN);
        const context = contextOf({ accounts: [archived, kept] });
        expect(context.accounts.map((entry) => entry.account.id)).toEqual([
            kept.id,
        ]);
    });

    it('keeps archived accounts, with their own payouts, apart for the rules that pool paid payouts', () => {
        const archived = accountFor(ANY_EVAL_PLAN, {
            archivedAt: new Date('2026-09-01T00:00:00Z'),
            stage: AccountStage.Funded,
        });
        const kept = accountFor(ANY_EVAL_PLAN);
        const payout = paidPayout(archived);
        const context = contextOf({
            accounts: [archived, kept],
            payouts: [payout],
        });
        expect(
            context.archivedAccounts.map((entry) => entry.account.id),
        ).toEqual([archived.id]);
        expect(context.archivedAccounts[0]?.payouts).toEqual([payout]);
        expect(context.archivedAccounts[0]?.plan.kind).toBe(
            PlanKeyResolutionKind.Resolved,
        );
    });

    it('never counts an archived account as active, even one handed to a rule directly', () => {
        const [monitored] = contextOf({
            accounts: [accountFor(ANY_EVAL_PLAN)],
        }).accounts;
        if (monitored === undefined) throw new Error('expected one account');
        expect(isActive(monitored)).toBe(true);
        expect(
            isActive({
                ...monitored,
                account: {
                    ...monitored.account,
                    archivedAt: new Date('2026-09-01T00:00:00Z'),
                },
            }),
        ).toBe(false);
        for (const status of [
            AccountStatus.Busted,
            AccountStatus.Closed,
            AccountStatus.Concluded,
            AccountStatus.Suspended,
        ]) {
            expect(
                isActive({
                    ...monitored,
                    account: { ...monitored.account, status },
                }),
            ).toBe(false);
        }
    });

    it('resolves the plan and never throws for an unresolvable one', () => {
        const resolved = accountFor(ANY_EVAL_PLAN);
        const unknownFirm = accountFor(ANY_EVAL_PLAN, {
            firmId: 'no-such-firm',
        });
        const context = contextOf({ accounts: [resolved, unknownFirm] });
        expect(context.accounts.map((entry) => entry.plan.kind)).toEqual([
            PlanKeyResolutionKind.Resolved,
            PlanKeyResolutionKind.Unresolved,
        ]);
    });

    it('reports corrupt stored opt-ins as an unresolved plan instead of throwing', () => {
        const corrupt = accountFor(ANY_EVAL_PLAN, {
            optIns: [1, 2] as unknown as PropAccountRow['optIns'],
        });
        const context = contextOf({ accounts: [corrupt] });
        expect(context.accounts[0]?.plan).toEqual({
            kind: PlanKeyResolutionKind.Unresolved,
            reason: UnresolvedPlanReason.CorruptOptIns,
        });
    });

    it('forwards the read issues into the plan key, so a flagged row never resolves to its placeholder plan', () => {
        const readIssues: readonly AccountReadIssue[] = [
            {
                kind: AccountReadIssueKind.UnresolvablePlan,
                reason: UnresolvedPlanReason.CorruptOptIns,
            },
        ];
        const flagged = accountFor(ANY_EVAL_PLAN, {
            optIns: NO_PLAN_OPT_INS,
            readIssues,
        });
        const [monitored] = contextOf({ accounts: [flagged] }).accounts;
        expect(monitored?.planKey?.readIssues).toEqual(readIssues);
        expect(monitored?.plan).toEqual({
            kind: PlanKeyResolutionKind.Unresolved,
            reason: UnresolvedPlanReason.CorruptOptIns,
        });
    });

    it('keeps a row whose only read issue is unreadable personal rules on its plan', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            readIssues: [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
        });
        expect(contextOf({ accounts: [account] }).accounts[0]?.plan.kind).toBe(
            PlanKeyResolutionKind.Resolved,
        );
    });

    it('types the row with required read issues and an honest stored firm id', () => {
        expectTypeOf<AlertAccountRow['readIssues']>().toEqualTypeOf<
            readonly AccountReadIssue[]
        >();
        expectTypeOf<
            AlertAccountRow['firmId']
        >().toEqualTypeOf<null | StoredFirmId>();
        expectTypeOf<StoredFirmId>().not.toExtend<FirmId>();
        expectTypeOf<FirmId>().toExtend<StoredFirmId>();
    });

    it('monitors a ledger-only account as LedgerOnly, with no plan key', () => {
        const [atListedFirm, atExternalFirm] = contextOf({
            accounts: [
                ledgerOnlyAccountFor(ANY_EVAL_PLAN),
                ledgerOnlyAccountFor(ANY_EVAL_PLAN, {
                    externalFirmId: EXTERNAL_FIRM_ID,
                    firmId: null,
                }),
            ],
        }).accounts;
        for (const monitored of [atListedFirm, atExternalFirm]) {
            expect(monitored?.plan).toEqual({
                kind: PlanKeyResolutionKind.LedgerOnly,
            });
            expect(monitored?.planKey).toBeNull();
            expect(monitored?.account.tracking).toBe(
                AccountTracking.LedgerOnly,
            );
        }
    });

    it('still runs the payout mismatch rules on a ledger-only account, which need no plan', () => {
        const account = ledgerOnlyAccountFor(ANY_EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const inputs = {
            accounts: [account],
            payouts: [paidPayout(account, { paidOn: '2026-09-10' })],
            snapshots: [
                snapshotFor(account, {
                    asOf: '2026-09-20',
                    cumulativePayoutCents: usdCents(900_000),
                    payoutsTaken: 3,
                }),
            ],
        };
        expect(
            alertsOf(new PayoutCountMismatchRule(), inputs).map(
                (alert) => alert.kind,
            ),
        ).toEqual([AlertKind.PayoutCountMismatch]);
        expect(
            alertsOf(new PayoutDollarMismatchRule(), inputs).map(
                (alert) => alert.kind,
            ),
        ).toEqual([AlertKind.PayoutDollarMismatch]);
    });

    it('fails loud on an account row that breaks the tracking shape', () => {
        expect(() =>
            contextOf({
                accounts: [
                    accountFor(ANY_EVAL_PLAN, {
                        planSerial: null,
                        tracking: AccountTracking.Modeled,
                    }),
                ],
            }),
        ).toThrow(AccountRowShapeError);
    });

    it('sets a malformed archived row apart as unreadable instead of failing every alert', () => {
        const broken = accountFor(ANY_EVAL_PLAN, {
            archivedAt: new Date('2026-09-01T00:00:00Z'),
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.Modeled,
        });
        const kept = accountFor(ANY_EVAL_PLAN);
        const context = contextOf({ accounts: [broken, kept] });
        expect(context.unreadableArchivedAccounts).toEqual([broken]);
        expect(context.archivedAccounts).toEqual([]);
        expect(context.accounts.map((entry) => entry.account.id)).toEqual([
            kept.id,
        ]);
    });

    it('keeps payouts with an invalid stored date apart as undated payouts', () => {
        const account = accountFor(ANY_EVAL_PLAN, {
            archivedAt: new Date('2026-09-01T00:00:00Z'),
            stage: AccountStage.Funded,
        });
        const dated = paidPayout(account);
        const undated = paidPayout(account, { paidOn: '2026-13-45' });
        const [monitored] = contextOf({
            accounts: [account],
            payouts: [dated, undated],
        }).archivedAccounts;
        expect(monitored?.payouts).toEqual([dated]);
        expect(monitored?.undatedPayouts).toEqual([undated]);
    });

    it('defaults the available bankroll to null and the decisions to none', () => {
        const context = contextOf({});
        expect(context.availableBankrollCents).toBeNull();
        expect(context.decisions).toEqual([]);
    });

    it('carries the available bankroll and the decisions it is given', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const decision = {
            acceptedRiskCents: usdCents(40_000),
            accountId: account.id,
            actualRiskCents: null,
            createdAt: new Date('2026-09-23T10:00:00Z'),
            decidedOn: WEDNESDAY,
            id: 'decision-1',
        };
        const context = contextOf({
            availableBankrollCents: usdCents(250_000),
            decisions: [decision],
        });
        expect(context.availableBankrollCents).toBe(250_000);
        expect(context.decisions).toEqual([decision]);
    });

    it('rejects a malformed today', () => {
        expect(() => contextOf({ today: '23-09-2026' })).toThrow(RangeError);
    });

    it('leaves movedLiveOn null without a recorded MovedLive event', () => {
        const account = accountFor(ANY_EVAL_PLAN, { stage: AccountStage.Live });
        const context = contextOf({ accounts: [account] });
        expect(context.accounts[0]?.movedLiveOn).toBeNull();
    });

    it('derives movedLiveOn from the latest recorded MovedLive event, for that account only', () => {
        const movedLive = accountFor(ANY_EVAL_PLAN, {
            stage: AccountStage.Live,
        });
        const other = accountFor(ANY_EVAL_PLAN, { stage: AccountStage.Live });
        const context = contextOf({
            accounts: [movedLive, other],
            events: [
                movedLiveEvent(movedLive, MONDAY),
                movedLiveEvent(movedLive, TUESDAY),
            ],
        });
        expect(context.accounts[0]?.movedLiveOn).toBe(TUESDAY);
        expect(context.accounts[1]?.movedLiveOn).toBeNull();
    });

    it('never trusts a MovedLive event with a malformed occurredOn as the move-live date', () => {
        const account = accountFor(ANY_EVAL_PLAN, { stage: AccountStage.Live });
        const context = contextOf({
            accounts: [account],
            events: [movedLiveEvent(account, '2026-13-45')],
        });
        expect(context.accounts[0]?.movedLiveOn).toBeNull();
    });
});

function monitoredWith(
    payoutsTaken: null | number,
    payouts: readonly ReturnType<typeof paidPayout>[],
) {
    const account = accountFor(ANY_EVAL_PLAN, {
        stage: AccountStage.Funded,
    });
    const [monitored] = contextOf({
        accounts: [account],
        payouts: payouts.map((payout) => ({
            ...payout,
            accountId: account.id,
        })),
        snapshots: [snapshotFor(account, { payoutsTaken })],
    }).accounts;
    if (monitored === undefined) throw new Error('expected one account');
    return monitored;
}

describe('the shared paid-ledger helpers', () => {
    const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
    const LEDGER_RULES = [
        'src/lib/prop-accounts/alerts/LifetimeDollarCapRule.ts',
        'src/lib/prop-accounts/alerts/LifetimePayoutCountRule.ts',
        'src/lib/prop-accounts/alerts/PayoutDollarMismatchRule.ts',
    ];

    it('counts payouts taken as the larger of the snapshot count and the paid ledger', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const paid = [paidPayout(account), paidPayout(account)];
        const pending = paidPayout(account, {
            paidOn: null,
            status: PayoutStatus.Requested,
        });
        expect(payoutsTakenOf(monitoredWith(null, [...paid, pending]))).toBe(2);
        expect(payoutsTakenOf(monitoredWith(5, paid))).toBe(5);
        expect(payoutsTakenOf(monitoredWith(1, paid))).toBe(2);
        expect(payoutsTakenOf(monitoredWith(null, []))).toBe(0);
    });

    it('totals only paid payouts, net where recorded and gross where not, and counts the gross ones', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const net = paidPayout(account, {
            grossCents: usdCents(100_000),
            netCents: usdCents(80_000),
        });
        const grossOnly = paidPayout(account, {
            grossCents: usdCents(50_000),
            netCents: null,
        });
        const zeroNet = paidPayout(account, { netCents: usdCents(0) });
        const ledger = paidLedgerTotal([
            net,
            grossOnly,
            zeroNet,
            paidPayout(account, {
                paidOn: null,
                status: PayoutStatus.Requested,
            }),
            paidPayout(account, { status: PayoutStatus.Denied }),
            paidPayout(account, { status: PayoutStatus.Cancelled }),
        ]);
        expect(ledger).toEqual({
            cents: 130_000,
            grossCounted: 1,
            netCents: 80_000,
        });
        expect(paidLedgerTotal([])).toEqual({
            cents: 0,
            grossCounted: 0,
            netCents: 0,
        });
    });

    it('totals only requested payouts, net where recorded and gross where not, and counts the gross ones', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const requested = (netCents: null | number) =>
            paidPayout(account, {
                grossCents: usdCents(50_000),
                netCents: netCents === null ? null : usdCents(netCents),
                paidOn: null,
                status: PayoutStatus.Requested,
            });
        expect(
            requestedLedgerTotal([
                requested(40_000),
                requested(null),
                paidPayout(account),
                paidPayout(account, { status: PayoutStatus.Denied }),
            ]),
        ).toEqual({ cents: 90_000, grossCounted: 1, netCents: 40_000 });
        expect(requestedLedgerTotal([])).toEqual({
            cents: 0,
            grossCounted: 0,
            netCents: 0,
        });
    });

    it('discloses gross only when a payout was counted at gross', () => {
        expect(grossDisclosureOf(0)).toEqual([]);
        expect(grossDisclosureOf(2)).toEqual([
            AlertDisclosure.GrossUsedForMissingNet,
        ]);
    });

    it('leaves no hand-written paid-ledger total or payouts-taken count in the rules', () => {
        const copies = LEDGER_RULES.flatMap((file) => {
            const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
            return [
                /paidPayoutCash/,
                /grossOnly/,
                /function payoutsTakenOf/,
                /netCents \?\?/,
            ]
                .filter((pattern) => pattern.test(text))
                .map((pattern) => `${file}: ${String(pattern)}`);
        });
        expect(copies).toEqual([]);
    });
});

describe('the eval value loss map of the alert context (PT-90, F-V29)', () => {
    it('is empty when the inputs carry none', () => {
        expect(contextOf({}).evalValueLossDollars.size).toBe(0);
    });

    it('carries the map the inputs were given, keyed by account id', () => {
        const losses = new Map([['account-1', 42.5]]);
        const context = contextOf({ evalValueLossDollars: losses });
        expect(context.evalValueLossDollars.get('account-1')).toBe(42.5);
        expect(context.evalValueLossDollars.size).toBe(1);
    });

    it('does not share one default map between two contexts', () => {
        expect(contextOf({}).evalValueLossDollars).not.toBe(
            contextOf({ evalValueLossDollars: new Map() }).evalValueLossDollars,
        );
    });
});

describe('the personal policies of the alert context (PT-102, F-84)', () => {
    it('is empty when the inputs carry none, and an account then has no personal rules', () => {
        const context = contextOf({});
        expect(context.personalPolicies.size).toBe(0);
        expect(personalPolicyIn(context, 'account-1')).toEqual(
            NO_PERSONAL_POLICY,
        );
    });

    it('does not share one default map between two contexts', () => {
        expect(contextOf({}).personalPolicies).not.toBe(
            contextOf({}).personalPolicies,
        );
    });

    it('returns the policy the inputs gave an account and no rules for any other', () => {
        const account = accountFor(ANY_EVAL_PLAN);
        const other = accountFor(ANY_EVAL_PLAN);
        const context = contextOf({
            personalPolicies: personalPoliciesFor(account, {
                payoutRequestOverride: dollars(1000),
                retainedCushionRequest: dollars(3000),
            }),
        });
        expect(personalPolicyIn(context, account.id)).toEqual({
            ...NO_PERSONAL_POLICY,
            payoutRequestOverride: 1000,
            retainedCushionRequest: 3000,
        });
        expect(personalPolicyIn(context, other.id)).toEqual(NO_PERSONAL_POLICY);
    });

    it('leaves the rulebook untouched for an account with no personal rules', () => {
        expect(
            personalRulebookOf(DEFAULT_RULEBOOK, NO_PERSONAL_POLICY),
        ).toEqual(DEFAULT_RULEBOOK);
    });

    it('takes the personal request, and the larger of the personal and rulebook retained cushion', () => {
        const above = personalRulebookOf(DEFAULT_RULEBOOK, {
            ...NO_PERSONAL_POLICY,
            payoutRequestOverride: dollars(1000),
            retainedCushionRequest: dollars(3000),
        });
        expect(above.payout.requestCents).toBe(100_000);
        expect(above.payout.retainedCushionCents).toBe(300_000);
        const below = personalRulebookOf(DEFAULT_RULEBOOK, {
            ...NO_PERSONAL_POLICY,
            retainedCushionRequest: dollars(1),
        });
        expect(below.payout.retainedCushionCents).toBe(
            DEFAULT_RULEBOOK.payout.retainedCushionCents,
        );
        expect(below.payout.requestCents).toBe(
            DEFAULT_RULEBOOK.payout.requestCents,
        );
    });
});
