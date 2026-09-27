import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AccountEventKind,
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    BankrollTransferKind,
    FeeKind,
    FirmEngagementStatus,
    paidPayoutCash,
    PayoutStatus,
    RoundStatus,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts/core';
import {
    costAnalytics,
    evalAttemptTally,
    fundedSince,
    hasUnreversedFundedBust,
    isActiveAccount,
    isTransitionDateKnown,
    type LedgerAccount,
    type LedgerAccountRow,
    type PortfolioLedger,
    roundCents,
    sampledMean,
    sampledRate,
    signedFeeCents,
    spendAndPayouts,
    stageFunnel,
    TransitionProvenance,
} from '~/lib/prop-accounts/metrics';
import { NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import { type PropAccountRow } from '~/server/db/schemas/prop';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    firmEngagement,
    FUNDED_RESET_PLAN,
    INSTANT_PLAN,
    ledger,
    OTHER_USER_ID,
    payout,
    type PlanEntry,
    purchased,
    round,
    transfer,
} from './ledgerFixtures';

type Step = readonly [AccountEventKind, string];

function only(portfolio: PortfolioLedger): LedgerAccount {
    const [first] = portfolio.accounts;
    if (first === undefined || portfolio.accounts.length !== 1) {
        throw new Error('expected exactly one account');
    }
    return first;
}

function replayed(
    owner: LedgerAccountRow,
    steps: readonly Step[],
): LedgerAccount {
    const events = [
        purchased(owner),
        ...steps.map(([kind, on]) => event(owner, kind, on)),
    ];
    return only(ledger({ accounts: [owner], events }));
}

describe('a corrupt stored row on the consumer path', () => {
    it('counts one corrupt opt-ins row as unresolved and still builds the rest of the ledger', () => {
        const good = account(EVAL_PLAN, { label: 'Good' });
        const corrupt = account(EVAL_PLAN, {
            label: 'Corrupt',
            optIns: 'broken' as unknown as LedgerAccountRow['optIns'],
        });
        const portfolio = ledger({
            accounts: [good, corrupt],
            events: [
                purchased(good),
                event(good, AccountEventKind.Busted, '2026-09-05'),
                purchased(corrupt),
            ],
            fees: [
                fee(good, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                fee(corrupt, FeeKind.EvalPurchase, 7000, '2026-09-01'),
            ],
        });
        expect(
            portfolio.unresolvedAccounts.map((entry) => [
                entry.row.label,
                entry.unresolvedReason,
            ]),
        ).toEqual([['Corrupt', UnresolvedPlanReason.CorruptOptIns]]);
        expect(
            portfolio.resolvedAccounts.map((entry) => entry.row.label),
        ).toEqual(['Good']);
        expect(portfolio.resolvedAccounts[0]?.transitions).toHaveLength(2);
        expect(spendAndPayouts(portfolio).allTime.spend).toBe(17_000);
        expect(costAnalytics(portfolio, new Map()).unresolvedAccounts).toBe(1);
    });

    it('keeps a row read with placeholder opt-ins and a corrupt opt-ins issue unresolved, never replayed on the placeholder plan', () => {
        const flagged = account(EVAL_PLAN, {
            label: 'Flagged',
            optIns: NO_PLAN_OPT_INS,
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.CorruptOptIns,
                },
            ],
            stage: AccountStage.Funded,
        });
        const portfolio = ledger({
            accounts: [flagged],
            events: [
                purchased(flagged),
                event(flagged, AccountEventKind.EvalPassed, '2026-09-10'),
            ],
            fees: [fee(flagged, FeeKind.EvalPurchase, 7000, '2026-09-01')],
        });
        const entry = only(portfolio);
        expect(entry.plan).toBeNull();
        expect(entry.unresolvedReason).toBe(UnresolvedPlanReason.CorruptOptIns);
        expect(entry.transitions).toEqual([]);
        expect(entry.timelineMatchesRow).toBe(false);
        expect(portfolio.planGroups()).toEqual([]);
        expect(stageFunnel(portfolio)).toEqual({
            byFirm: [],
            ledgerOnlyAccounts: 0,
            unresolvedAccounts: 1,
        });
        expect(costAnalytics(portfolio, new Map()).unresolvedSpend).toBe(7000);
    });

    it('still resolves and replays a row whose only read issue is unreadable personal rules', () => {
        const owner = account(EVAL_PLAN, {
            optIns: NO_PLAN_OPT_INS,
            readIssues: [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
        });
        const entry = only(
            ledger({ accounts: [owner], events: [purchased(owner)] }),
        );
        expect(entry.plan?.planSerial).toBe(EVAL_PLAN.serial);
        expect(entry.unresolvedReason).toBeNull();
        expect(entry.transitions).toHaveLength(1);
    });
});

describe('cash helpers', () => {
    const owner = account(EVAL_PLAN);

    it('signs refunds negative and every other fee positive', () => {
        expect(
            signedFeeCents(fee(owner, FeeKind.Refund, 5000, '2026-09-02')),
        ).toBe(-5000);
        const charges = Object.values(FeeKind).filter(
            (k) => k !== FeeKind.Refund,
        );
        for (const kind of charges) {
            expect(signedFeeCents(fee(owner, kind, 5000, '2026-09-02'))).toBe(
                5000,
            );
        }
    });

    it('counts only Paid payouts, net where given, gross flagged otherwise', () => {
        expect(
            paidPayoutCash(payout(owner, 100_000, { netCents: 90_000 })),
        ).toEqual({
            cents: 90_000,
            grossOnly: false,
            paidOn: '2026-09-20',
        });
        expect(paidPayoutCash(payout(owner, 100_000))).toEqual({
            cents: 100_000,
            grossOnly: true,
            paidOn: '2026-09-20',
        });
        for (const status of [
            PayoutStatus.Requested,
            PayoutStatus.Denied,
            PayoutStatus.Cancelled,
        ]) {
            expect(
                paidPayoutCash(
                    payout(owner, 100_000, { netCents: 90_000, status }),
                ),
            ).toBeNull();
        }
    });

    it('rounds to whole cents half away from zero and never returns negative zero', () => {
        expect(roundCents(2.5)).toBe(3);
        expect(roundCents(-2.5)).toBe(-3);
        expect(Object.is(roundCents(-0.4), 0)).toBe(true);
        expect(roundCents(1234.49)).toBe(1234);
    });

    it('reads only the archived date and the status, so every caller can share it', () => {
        expectTypeOf(isActiveAccount)
            .parameter(0)
            .toEqualTypeOf<Pick<PropAccountRow, 'archivedAt' | 'status'>>();
        const active: Pick<PropAccountRow, 'archivedAt' | 'status'> = {
            archivedAt: null,
            status: AccountStatus.Active,
        };
        expect(isActiveAccount(active)).toBe(true);
        expect(isActiveAccount({ ...active, archivedAt: new Date() })).toBe(
            false,
        );
    });

    it('treats only an Active, non-archived account as active', () => {
        expect(isActiveAccount(account(EVAL_PLAN))).toBe(true);
        const archived = account(EVAL_PLAN, { archivedAt: new Date() });
        expect(isActiveAccount(archived)).toBe(false);
        for (const status of [
            AccountStatus.Busted,
            AccountStatus.Closed,
            AccountStatus.Concluded,
            AccountStatus.Suspended,
        ]) {
            expect(isActiveAccount(account(EVAL_PLAN, { status }))).toBe(false);
        }
    });
});

describe('PortfolioLedger.fromRows', () => {
    it('attaches rows to their account and counts rows it cannot match or that belong to another user', () => {
        const owner = account(EVAL_PLAN);
        const portfolio = ledger({
            accounts: [owner],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.Busted, '2026-09-03', {
                    userId: OTHER_USER_ID,
                }),
                event(owner, AccountEventKind.Busted, '2026-09-03', {
                    accountId: 'missing',
                }),
            ],
            fees: [
                fee(owner, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                fee(owner, FeeKind.Reset, 5000, '2026-09-02', {
                    userId: OTHER_USER_ID,
                }),
            ],
            payouts: [payout(owner, 50_000, { userId: OTHER_USER_ID })],
        });
        const entry = only(portfolio);
        expect(entry.events).toHaveLength(1);
        expect(entry.fees).toHaveLength(1);
        expect(entry.payouts).toHaveLength(0);
        expect(portfolio.unmatched).toEqual({
            accounts: 0,
            events: 2,
            fees: 1,
            payouts: 1,
        });
    });

    it('scopes rounds, transfers and firm engagements to the ledger owner', () => {
        const portfolio = ledger({
            firmEngagements: [
                firmEngagement('firm-a', '2026-01-01', FirmEngagementStatus.Active),
                firmEngagement('firm-a', '2026-01-01', FirmEngagementStatus.Active, {
                    userId: OTHER_USER_ID,
                }),
            ],
            rounds: [
                round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open),
                round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open, {
                    userId: OTHER_USER_ID,
                }),
            ],
            transfers: [
                transfer(BankrollTransferKind.Deposit, 100_000, '2026-01-01'),
                transfer(BankrollTransferKind.Deposit, 100_000, '2026-01-01', {
                    userId: OTHER_USER_ID,
                }),
            ],
        });
        expect(portfolio.rounds).toHaveLength(1);
        expect(portfolio.transfers).toHaveLength(1);
        expect(portfolio.firmEngagements).toHaveLength(1);
    });

    it('resolves the plan and keeps unresolvable accounts apart with the reason', () => {
        const good = account(EVAL_PLAN);
        const bad = account(EVAL_PLAN, { planSerial: 'no-such-plan' });
        const portfolio = ledger({ accounts: [good, bad] });
        expect(portfolio.resolvedAccounts.map((a) => a.row.id)).toEqual([
            good.id,
        ]);
        expect(portfolio.unresolvedAccounts.map((a) => a.row.id)).toEqual([
            bad.id,
        ]);
        const [unresolved] = portfolio.unresolvedAccounts;
        expect(unresolved?.plan).toBeNull();
        expect(unresolved?.unresolvedReason).toBe(
            UnresolvedPlanReason.UnknownPlanSerial,
        );
        expect(unresolved?.transitions).toEqual([]);
        const [resolved] = portfolio.resolvedAccounts;
        expect(resolved?.plan?.planSerial).toBe(EVAL_PLAN.serial);
        expect(resolved?.plan?.firm.id).toBe(EVAL_PLAN.firm.id);
    });

    it('replays events in date, then creation, then id order through the lifecycle', () => {
        const owner = account(EVAL_PLAN, {
            stage: AccountStage.Funded,
            status: AccountStatus.Busted,
        });
        const passed = event(owner, AccountEventKind.EvalPassed, '2026-09-10');
        const busted = event(owner, AccountEventKind.Busted, '2026-09-20');
        const entry = only(
            ledger({
                accounts: [owner],
                events: [busted, passed, purchased(owner)],
            }),
        );
        expect(
            entry.transitions.map((t) => [
                t.kind,
                t.on,
                t.to.stage,
                t.to.status,
            ]),
        ).toEqual([
            [
                AccountEventKind.Purchased,
                '2026-09-01',
                AccountStage.Eval,
                AccountStatus.Active,
            ],
            [
                AccountEventKind.EvalPassed,
                '2026-09-10',
                AccountStage.Funded,
                AccountStatus.Active,
            ],
            [
                AccountEventKind.Busted,
                '2026-09-20',
                AccountStage.Funded,
                AccountStatus.Busted,
            ],
        ]);
        expect(entry.transitions[0]?.from).toBeNull();
        expect(entry.transitions[2]?.from).toEqual({
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
        });
        expect(
            entry.transitions.every(
                (t) => t.provenance === TransitionProvenance.Recorded,
            ),
        ).toBe(true);
        expect(entry.rejectedEvents).toBe(0);
        expect(entry.timelineMatchesRow).toBe(true);
    });

    it('orders same-day events by creation time', () => {
        const owner = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const bust = event(owner, AccountEventKind.Busted, '2026-09-05', {
            createdAt: new Date('2026-09-05T15:00:00Z'),
        });
        const reopen = event(owner, AccountEventKind.Reopened, '2026-09-05', {
            createdAt: new Date('2026-09-05T16:00:00Z'),
        });
        const bustAgain = event(owner, AccountEventKind.Busted, '2026-09-05', {
            createdAt: new Date('2026-09-05T17:00:00Z'),
        });
        const entry = only(
            ledger({
                accounts: [owner],
                events: [bustAgain, reopen, bust, purchased(owner)],
            }),
        );
        expect(entry.transitions.map((t) => t.kind)).toEqual([
            AccountEventKind.Purchased,
            AccountEventKind.Busted,
            AccountEventKind.Reopened,
            AccountEventKind.Busted,
        ]);
        expect(entry.rejectedEvents).toBe(0);
    });

    it('counts events the lifecycle rejects and flags a timeline that disagrees with the row', () => {
        const owner = account(EVAL_PLAN, { stage: AccountStage.Live });
        const entry = only(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.MovedLive, '2026-09-04'),
                    event(owner, AccountEventKind.EvalPassed, '2026-09-06'),
                ],
            }),
        );
        expect(entry.rejectedEvents).toBe(1);
        expect(entry.transitions.map((t) => t.kind)).toEqual([
            AccountEventKind.Purchased,
            AccountEventKind.EvalPassed,
        ]);
        expect(entry.timelineMatchesRow).toBe(false);
    });

    it('implies the pass for a Funded or Live row with no funded date and no recorded pass, placed on the purchase date and marked as an unknown date', () => {
        const funded = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const live = account(EVAL_PLAN, { stage: AccountStage.Live });
        const portfolio = ledger({
            accounts: [funded, live],
            events: [
                purchased(live),
                event(live, AccountEventKind.MovedLive, '2026-09-04'),
            ],
        });
        const [fundedEntry, liveEntry] = portfolio.accounts;
        expect(
            fundedEntry?.transitions.map((t) => [t.kind, t.on, t.provenance]),
        ).toEqual([
            [
                AccountEventKind.Purchased,
                '2026-09-01',
                TransitionProvenance.ImpliedPurchase,
            ],
            [
                AccountEventKind.EvalPassed,
                '2026-09-01',
                TransitionProvenance.ImpliedPassDateUnknown,
            ],
        ]);
        expect(fundedEntry?.timelineMatchesRow).toBe(true);
        expect(
            liveEntry?.transitions.map((t) => [t.kind, t.on, t.provenance]),
        ).toEqual([
            [
                AccountEventKind.Purchased,
                '2026-09-01',
                TransitionProvenance.Recorded,
            ],
            [
                AccountEventKind.EvalPassed,
                '2026-09-01',
                TransitionProvenance.ImpliedPassDateUnknown,
            ],
            [
                AccountEventKind.MovedLive,
                '2026-09-04',
                TransitionProvenance.Recorded,
            ],
        ]);
        expect(
            fundedEntry?.transitions.map((t) =>
                isTransitionDateKnown(t.provenance),
            ),
        ).toEqual([true, false]);
        expect(
            liveEntry?.transitions.map((t) =>
                isTransitionDateKnown(t.provenance),
            ),
        ).toEqual([true, false, true]);
        expect(fundedEntry && fundedSince(fundedEntry)).toEqual({
            on: '2026-09-01',
            provenance: TransitionProvenance.ImpliedPassDateUnknown,
        });
        expect(liveEntry?.rejectedEvents).toBe(0);
        expect(liveEntry?.timelineMatchesRow).toBe(true);
    });

    it('skips Edited events in the replay, so an edit dated before a later-moved purchase is not a rejected event', () => {
        const owner = account(EVAL_PLAN, {
            purchasedOn: '2026-09-10',
            status: AccountStatus.Busted,
        });
        const entry = only(
            ledger({
                accounts: [owner],
                events: [
                    event(owner, AccountEventKind.Edited, '2026-09-05'),
                    purchased(owner),
                    event(owner, AccountEventKind.Busted, '2026-09-12'),
                ],
            }),
        );
        expect(entry.rejectedEvents).toBe(0);
        expect(entry.transitions.map((t) => t.kind)).toEqual([
            AccountEventKind.Purchased,
            AccountEventKind.Busted,
        ]);
        expect(entry.timelineMatchesRow).toBe(true);
        expect(entry.events).toHaveLength(3);
    });

    it('implies the purchase from purchased_on and the pass from funded_on when those events are missing', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-12',
            stage: AccountStage.Funded,
        });
        const entry = only(ledger({ accounts: [owner] }));
        expect(
            entry.transitions.map((t) => [t.kind, t.on, t.provenance]),
        ).toEqual([
            [
                AccountEventKind.Purchased,
                '2026-09-01',
                TransitionProvenance.ImpliedPurchase,
            ],
            [
                AccountEventKind.EvalPassed,
                '2026-09-12',
                TransitionProvenance.ImpliedPassFromFundedDate,
            ],
        ]);
        expect(
            entry.transitions.every((t) => isTransitionDateKnown(t.provenance)),
        ).toBe(true);
        expect(fundedSince(entry)).toEqual({
            on: '2026-09-12',
            provenance: TransitionProvenance.ImpliedPassFromFundedDate,
        });
        expect(entry.timelineMatchesRow).toBe(true);
    });

    it('places the implied pass before events on the funded date itself, as the event router orders them', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-15',
            stage: AccountStage.Funded,
            status: AccountStatus.Busted,
        });
        const entry = only(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.Busted, '2026-09-15'),
                ],
            }),
        );
        expect(
            entry.transitions.map((t) => [t.kind, t.on, t.provenance]),
        ).toEqual([
            [
                AccountEventKind.Purchased,
                '2026-09-01',
                TransitionProvenance.Recorded,
            ],
            [
                AccountEventKind.EvalPassed,
                '2026-09-15',
                TransitionProvenance.ImpliedPassFromFundedDate,
            ],
            [
                AccountEventKind.Busted,
                '2026-09-15',
                TransitionProvenance.Recorded,
            ],
        ]);
        expect(entry.rejectedEvents).toBe(0);
        expect(entry.timelineMatchesRow).toBe(true);
    });

    it('implies no pass for an account still in its evaluation, even with a funded date set, as the event router does', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-15',
            stage: AccountStage.Eval,
            status: AccountStatus.Busted,
        });
        const entry = only(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.Busted, '2026-09-10'),
                ],
            }),
        );
        expect(
            entry.transitions.map((t) => [t.kind, t.on, t.provenance]),
        ).toEqual([
            [
                AccountEventKind.Purchased,
                '2026-09-01',
                TransitionProvenance.Recorded,
            ],
            [
                AccountEventKind.Busted,
                '2026-09-10',
                TransitionProvenance.Recorded,
            ],
        ]);
        expect(entry.rejectedEvents).toBe(0);
        expect(entry.timelineMatchesRow).toBe(true);
        expect(evalAttemptTally(entry)).toEqual({ fails: 1, passes: 0 });
    });

    it('keeps an active evaluation with a funded date in its evaluation', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-15',
            stage: AccountStage.Eval,
        });
        const entry = only(ledger({ accounts: [owner] }));
        expect(entry.transitions.map((t) => t.kind)).toEqual([
            AccountEventKind.Purchased,
        ]);
        expect(entry.timelineMatchesRow).toBe(true);
    });

    it('starts an instant-funded account funded on its purchase date', () => {
        const owner = account(INSTANT_PLAN);
        const entry = only(
            ledger({ accounts: [owner], events: [purchased(owner)] }),
        );
        expect(entry.transitions[0]?.to).toEqual({
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
        });
        expect(fundedSince(entry)).toEqual({
            on: '2026-09-01',
            provenance: TransitionProvenance.Recorded,
        });
    });

    it('drops accounts of another user and joins a replacement only to an account of the ledger user', () => {
        const replaced = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const replacement = account(EVAL_PLAN, {
            purchasedOn: '2026-09-10',
            replacesAccountId: replaced.id,
        });
        const foreign = account(EVAL_PLAN, { userId: OTHER_USER_ID });
        const crossUser = account(EVAL_PLAN, { replacesAccountId: foreign.id });
        const portfolio = ledger({
            accounts: [replaced, replacement, foreign, crossUser],
        });
        const find = (id: string) => {
            const found = portfolio.accounts.find((a) => a.row.id === id);
            if (found === undefined) throw new Error('missing account');
            return found;
        };
        expect(portfolio.replacedAccountOf(find(replacement.id))?.row.id).toBe(
            replaced.id,
        );
        expect(portfolio.replacedAccountOf(find(crossUser.id))).toBeNull();
        expect(portfolio.replacedAccountOf(find(replaced.id))).toBeNull();
        expect(portfolio.accounts.some((a) => a.row.id === foreign.id)).toBe(
            false,
        );
        expect(portfolio.unmatched.accounts).toBe(1);
    });

    it('groups resolved accounts by plan serial', () => {
        const a = account(EVAL_PLAN);
        const b = account(EVAL_PLAN);
        const c = account(INSTANT_PLAN);
        const groups = ledger({ accounts: [a, b, c] }).planGroups();
        const bySerial = new Map(
            groups.map((g) => [g.planSerial, g.accounts.map((x) => x.row.id)]),
        );
        expect(bySerial.get(EVAL_PLAN.serial)).toEqual([a.id, b.id]);
        expect(bySerial.get(INSTANT_PLAN.serial)).toEqual([c.id]);
        expect(
            groups.find((g) => g.planSerial === INSTANT_PLAN.serial)?.firmId,
        ).toBe(INSTANT_PLAN.firm.id);
    });
});

describe('lifecycle readings', () => {
    it('tallies eval attempts: busts and inactivity closures fail, reversed busts and plain closures do not', () => {
        const retried = replayed(
            account(EVAL_PLAN, { stage: AccountStage.Funded }),
            [
                [AccountEventKind.Busted, '2026-09-02'],
                [AccountEventKind.Reopened, '2026-09-03'],
                [AccountEventKind.Busted, '2026-09-04'],
                [AccountEventKind.BustReversed, '2026-09-05'],
                [AccountEventKind.Busted, '2026-09-08'],
                [AccountEventKind.Reopened, '2026-09-09'],
                [AccountEventKind.EvalPassed, '2026-09-15'],
            ],
        );
        expect(evalAttemptTally(retried)).toEqual({ fails: 2, passes: 1 });

        const idle = replayed(
            account(EVAL_PLAN, { status: AccountStatus.Closed }),
            [[AccountEventKind.ClosedInactivity, '2026-10-01']],
        );
        expect(evalAttemptTally(idle)).toEqual({ fails: 1, passes: 0 });

        const abandoned = replayed(
            account(EVAL_PLAN, { status: AccountStatus.Closed }),
            [[AccountEventKind.Closed, '2026-10-01']],
        );
        expect(evalAttemptTally(abandoned)).toEqual({ fails: 0, passes: 0 });
    });

    it('counts one failed attempt when a busted eval is later closed for inactivity', () => {
        const bustedThenIdle = replayed(
            account(EVAL_PLAN, { status: AccountStatus.Closed }),
            [
                [AccountEventKind.Busted, '2026-09-04'],
                [AccountEventKind.ClosedInactivity, '2026-10-05'],
            ],
        );
        expect(bustedThenIdle.rejectedEvents).toBe(0);
        expect(evalAttemptTally(bustedThenIdle)).toEqual({
            fails: 1,
            passes: 0,
        });
    });

    it('counts one failed attempt when a busted eval is edited afterwards', () => {
        const bustedThenEdited = replayed(
            account(EVAL_PLAN, { status: AccountStatus.Busted }),
            [
                [AccountEventKind.Busted, '2026-09-04'],
                [AccountEventKind.Edited, '2026-09-07'],
                [AccountEventKind.Edited, '2026-09-08'],
            ],
        );
        expect(bustedThenEdited.rejectedEvents).toBe(0);
        expect(evalAttemptTally(bustedThenEdited)).toEqual({
            fails: 1,
            passes: 0,
        });
        expect(bustedThenEdited.transitions.map((t) => t.kind)).toEqual([
            AccountEventKind.Purchased,
            AccountEventKind.Busted,
        ]);
        expect(bustedThenEdited.events).toHaveLength(4);
    });

    it('treats a bust as reversed when edits sit between the bust and its reversal', () => {
        const evalReversed = replayed(
            account(EVAL_PLAN, { stage: AccountStage.Funded }),
            [
                [AccountEventKind.Busted, '2026-09-03'],
                [AccountEventKind.Edited, '2026-09-04'],
                [AccountEventKind.BustReversed, '2026-09-05'],
                [AccountEventKind.EvalPassed, '2026-09-10'],
            ],
        );
        expect(evalAttemptTally(evalReversed)).toEqual({
            fails: 0,
            passes: 1,
        });
        const fundedReversed = replayed(
            account(EVAL_PLAN, { stage: AccountStage.Funded }),
            [
                [AccountEventKind.EvalPassed, '2026-09-10'],
                [AccountEventKind.Busted, '2026-09-20'],
                [AccountEventKind.Edited, '2026-09-21'],
                [AccountEventKind.BustReversed, '2026-09-22'],
            ],
        );
        expect(hasUnreversedFundedBust(fundedReversed)).toBe(false);
    });

    it('dates funding from the pass and reports none for an account still in its eval', () => {
        const passed = replayed(
            account(EVAL_PLAN, { stage: AccountStage.Funded }),
            [[AccountEventKind.EvalPassed, '2026-09-15']],
        );
        expect(fundedSince(passed)).toEqual({
            on: '2026-09-15',
            provenance: TransitionProvenance.Recorded,
        });
        const evalOnly = replayed(account(EVAL_PLAN), []);
        expect(fundedSince(evalOnly)).toBeNull();
    });

    it('finds a funded bust unless it was reversed; a funded reset does not undo it', () => {
        const fundedWith = (plan: PlanEntry, steps: readonly Step[]) =>
            replayed(
                account(plan, {
                    optIns: {
                        takesFundedReset: plan.plan.fundedReset !== null,
                    },
                    stage: AccountStage.Funded,
                }),
                [[AccountEventKind.EvalPassed, '2026-09-10'], ...steps],
            );
        const clean = fundedWith(EVAL_PLAN, []);
        expect(hasUnreversedFundedBust(clean)).toBe(false);
        const busted = fundedWith(EVAL_PLAN, [
            [AccountEventKind.Busted, '2026-09-20'],
        ]);
        expect(hasUnreversedFundedBust(busted)).toBe(true);
        const reversed = fundedWith(EVAL_PLAN, [
            [AccountEventKind.Busted, '2026-09-20'],
            [AccountEventKind.BustReversed, '2026-09-21'],
        ]);
        expect(hasUnreversedFundedBust(reversed)).toBe(false);
        const reset = fundedWith(FUNDED_RESET_PLAN, [
            [AccountEventKind.Busted, '2026-09-20'],
            [AccountEventKind.FundedReset, '2026-09-21'],
        ]);
        expect(reset.rejectedEvents).toBe(0);
        expect(reset.transitions.at(-1)?.kind).toBe(
            AccountEventKind.FundedReset,
        );
        expect(hasUnreversedFundedBust(reset)).toBe(true);

        const evalBust = replayed(
            account(EVAL_PLAN, { status: AccountStatus.Busted }),
            [[AccountEventKind.Busted, '2026-09-05']],
        );
        expect(hasUnreversedFundedBust(evalBust)).toBe(false);
    });
});

describe('sampledRate', () => {
    it('attaches a 95% Wilson interval', () => {
        const zero = sampledRate(0, 10);
        expect(zero?.interval?.lower).toBeCloseTo(0, 6);
        expect(zero?.interval?.upper).toBeCloseTo(0.277533, 6);

        const three = sampledRate(3, 10);
        expect(three?.interval?.lower).toBeCloseTo(0.107791, 6);
        expect(three?.interval?.upper).toBeCloseTo(0.603222, 6);

        const ten = sampledRate(10, 10);
        expect(ten?.interval?.lower).toBeCloseTo(0.722467, 6);
        expect(ten?.interval?.upper).toBeCloseTo(1, 6);
    });

    it('is null at n = 0, leaving value and standardError unchanged', () => {
        expect(sampledRate(0, 0)).toBeNull();
    });

    it('keeps the existing value and standard error behaviour', () => {
        const rate = sampledRate(3, 10);
        expect(rate?.n).toBe(10);
        expect(rate?.value).toBe(0.3);
        expect(rate?.standardError).not.toBeNull();

        const degenerate = sampledRate(0, 10);
        expect(degenerate?.standardError).toBeNull();
        expect(degenerate?.interval).not.toBeNull();
    });
});

describe('sampledMean', () => {
    it('widens the interval with a Student t critical value at n = 2, not a fixed 1.96', () => {
        const estimate = sampledMean([10, 30]);
        const se = estimate?.standardError ?? 0;
        expect(estimate?.interval?.lower).toBeCloseTo(
            (estimate?.value ?? 0) - 12.706 * se,
            2,
        );
        expect(estimate?.interval?.upper).toBeCloseTo(
            (estimate?.value ?? 0) + 12.706 * se,
            2,
        );
    });

    it('uses the Student t critical value for df = 4 at n = 5', () => {
        const estimate = sampledMean([10, 12, 14, 16, 18]);
        const se = estimate?.standardError ?? 0;
        expect(estimate?.interval?.lower).toBeCloseTo(
            (estimate?.value ?? 0) - 2.776 * se,
            2,
        );
        expect(estimate?.interval?.upper).toBeCloseTo(
            (estimate?.value ?? 0) + 2.776 * se,
            2,
        );
    });

    it('is close to but still above the fixed 1.96 z-value at n = 30', () => {
        const values = Array.from({ length: 30 }, (_, index) => index + 1);
        const estimate = sampledMean(values);
        const se = estimate?.standardError ?? 0;
        expect(estimate?.interval?.upper).toBeCloseTo(
            (estimate?.value ?? 0) + 2.045 * se,
            2,
        );
        expect(estimate?.interval?.upper).not.toBeCloseTo(
            (estimate?.value ?? 0) + 1.959964 * se,
            2,
        );
    });

    it('is null below n = 2, leaving value unchanged', () => {
        const single = sampledMean([10]);
        expect(single?.value).toBe(10);
        expect(single?.standardError).toBeNull();
        expect(single?.interval).toBeNull();
    });

    it('is null for an empty array', () => {
        expect(sampledMean([])).toBeNull();
    });
});
