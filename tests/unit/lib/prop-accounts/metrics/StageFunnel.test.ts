import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AccountEventKind,
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    FeeKind,
    type FirmKey,
    firmKeyId,
    FirmKeyKind,
    PayoutStatus,
    type StoredFirmId,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts/core';
import { type FirmFunnel, stageFunnel } from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    INSTANT_PLAN,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    purchased,
} from './ledgerFixtures';

function modeledFirm(firmId: StoredFirmId): FirmKey {
    return { firmId, kind: FirmKeyKind.Modeled };
}

function modeledKeyId(firmId: StoredFirmId): string {
    return firmKeyId({ firmId, kind: FirmKeyKind.Modeled });
}

describe('stageFunnel', () => {
    it('counts purchased, passed, funded, first payout and moved live per firm from events', () => {
        const failed = account(EVAL_PLAN, { status: AccountStatus.Busted });
        const passed = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const live = account(EVAL_PLAN, { stage: AccountStage.Live });
        const pending = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const other = account(OTHER_FIRM_EVAL_PLAN);
        const result = stageFunnel(
            ledger({
                accounts: [failed, passed, live, pending, other],
                events: [
                    purchased(failed),
                    event(failed, AccountEventKind.Busted, '2026-09-04'),
                    purchased(passed),
                    event(passed, AccountEventKind.EvalPassed, '2026-09-10'),
                    purchased(live),
                    event(live, AccountEventKind.EvalPassed, '2026-09-08'),
                    event(live, AccountEventKind.MovedLive, '2026-09-25'),
                    purchased(pending),
                    event(pending, AccountEventKind.EvalPassed, '2026-09-12'),
                    purchased(other),
                ],
                payouts: [
                    payout(passed, 50_000),
                    payout(passed, 60_000),
                    payout(live, 50_000),
                    payout(pending, 50_000, {
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                ],
            }),
        );
        expect(
            result.byFirm.find(
                (f) => firmKeyId(f.firmKey) === modeledKeyId(EVAL_PLAN.firm.id),
            ),
        ).toMatchObject({
            attempts: 4,
            feesCents: 0,
            firmKey: modeledFirm(EVAL_PLAN.firm.id),
            firstPayout: 2,
            funded: 3,
            movedLive: 1,
            netCents: 160_000,
            netPayoutsCents: 160_000,
            passed: 3,
            purchased: 4,
        });
        expect(
            result.byFirm.find(
                (f) =>
                    firmKeyId(f.firmKey) ===
                    modeledKeyId(OTHER_FIRM_EVAL_PLAN.firm.id),
            ),
        ).toMatchObject({
            attempts: 0,
            feesCents: 0,
            firmKey: modeledFirm(OTHER_FIRM_EVAL_PLAN.firm.id),
            firstPayout: 0,
            funded: 0,
            movedLive: 0,
            netCents: 0,
            netPayoutsCents: 0,
            passed: 0,
            purchased: 1,
        });
        expect(result.unresolvedAccounts).toBe(0);
    });

    it('counts a ledger-only account as one attempt alongside a modeled account at the same firm', () => {
        const modeled = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const ledgerOnly = account(EVAL_PLAN, {
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const result = stageFunnel(
            ledger({
                accounts: [modeled, ledgerOnly],
                events: [
                    purchased(modeled),
                    event(modeled, AccountEventKind.EvalPassed, '2026-09-10'),
                    purchased(ledgerOnly),
                ],
            }),
        );
        const firm = result.byFirm.find(
            (f) => firmKeyId(f.firmKey) === modeledKeyId(EVAL_PLAN.firm.id),
        );
        expect(firm?.purchased).toBe(2);
        expect(firm?.attempts).toBe(2);
    });

    it('sums fees and net paid payouts per firm, net of refunds', () => {
        const owner = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const result = stageFunnel(
            ledger({
                accounts: [owner],
                events: [
                    purchased(owner),
                    event(owner, AccountEventKind.EvalPassed, '2026-09-10'),
                ],
                fees: [
                    fee(owner, FeeKind.EvalPurchase, 15_000, '2026-09-01'),
                    fee(owner, FeeKind.Refund, 5000, '2026-09-02'),
                ],
                payouts: [payout(owner, 40_000)],
            }),
        );
        const firm = result.byFirm.find(
            (f) => firmKeyId(f.firmKey) === modeledKeyId(EVAL_PLAN.firm.id),
        );
        expect(firm?.feesCents).toBe(10_000);
        expect(firm?.netPayoutsCents).toBe(40_000);
        expect(firm?.netCents).toBe(30_000);
        expect(firm?.attempts).toBe(1);
    });

    it('counts an instant-funded purchase as funded without a pass, and keeps unresolved accounts apart', () => {
        const instant = account(INSTANT_PLAN);
        const lost = account(INSTANT_PLAN, { planSerial: 'retired-plan' });
        const result = stageFunnel(
            ledger({
                accounts: [instant, lost],
                events: [purchased(instant), purchased(lost)],
            }),
        );
        expect(result.byFirm).toMatchObject([
            {
                attempts: 1,
                feesCents: 0,
                firmKey: modeledFirm(INSTANT_PLAN.firm.id),
                firstPayout: 0,
                funded: 1,
                movedLive: 0,
                netCents: 0,
                netPayoutsCents: 0,
                passed: 0,
                purchased: 1,
            },
        ]);
        expect(result.unresolvedAccounts).toBe(1);
    });

    it('names each funnel row by the firm of its resolved plan and leaves a removed firm to the unresolved count', () => {
        const removed: StoredFirmId = 'gone-firm';
        const lost = account(EVAL_PLAN, { firmId: removed });
        const kept = account(OTHER_FIRM_EVAL_PLAN);
        const result = stageFunnel(
            ledger({
                accounts: [lost, kept],
                events: [purchased(lost), purchased(kept)],
            }),
        );
        expect(result.byFirm.map((row) => firmKeyId(row.firmKey))).toEqual([
            modeledKeyId(OTHER_FIRM_EVAL_PLAN.firm.id),
        ]);
        expect(result.unresolvedAccounts).toBe(1);
        expectTypeOf<FirmFunnel['firmKey']>().toEqualTypeOf<FirmKey>();
    });

    it('keeps counting an archived account whose only issue is unreadable personal rules, so adding it again would count it twice', () => {
        const archivedAt = new Date('2026-09-20T00:00:00Z');
        const unreadableRules = account(EVAL_PLAN, {
            archivedAt,
            readIssues: [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
            stage: AccountStage.Funded,
        });
        const unreadableOptIns = account(EVAL_PLAN, {
            archivedAt,
            readIssues: [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.CorruptOptIns,
                },
            ],
            stage: AccountStage.Funded,
        });
        const result = stageFunnel(
            ledger({
                accounts: [unreadableRules, unreadableOptIns],
                events: [
                    purchased(unreadableRules),
                    event(
                        unreadableRules,
                        AccountEventKind.EvalPassed,
                        '2026-09-10',
                    ),
                    purchased(unreadableOptIns),
                    event(
                        unreadableOptIns,
                        AccountEventKind.EvalPassed,
                        '2026-09-10',
                    ),
                ],
            }),
        );
        expect(result.byFirm).toMatchObject([
            {
                attempts: 1,
                feesCents: 0,
                firmKey: modeledFirm(EVAL_PLAN.firm.id),
                firstPayout: 0,
                funded: 1,
                movedLive: 0,
                netCents: 0,
                netPayoutsCents: 0,
                passed: 1,
                purchased: 1,
            },
        ]);
        expect(result.unresolvedAccounts).toBe(1);
    });

    it('shows independent counts beside account counts, merging copies bought together on one date', () => {
        const copies = [
            account(EVAL_PLAN, {
                copyGroupId: 'group-1',
                stage: AccountStage.Funded,
            }),
            account(EVAL_PLAN, {
                copyGroupId: 'group-1',
                stage: AccountStage.Funded,
            }),
            account(EVAL_PLAN, {
                copyGroupId: 'group-1',
                stage: AccountStage.Funded,
            }),
        ];
        const alone = account(EVAL_PLAN);
        const result = stageFunnel(
            ledger({
                accounts: [...copies, alone],
                events: [
                    ...copies.flatMap((entry) => [
                        purchased(entry),
                        event(entry, AccountEventKind.EvalPassed, '2026-09-10'),
                    ]),
                    purchased(alone),
                ],
                payouts: copies.map((entry) => payout(entry, 40_000)),
            }),
        );
        const firm = result.byFirm.find(
            (f) => firmKeyId(f.firmKey) === modeledKeyId(EVAL_PLAN.firm.id),
        );
        expect(firm?.purchased).toBe(4);
        expect(firm?.passed).toBe(3);
        expect(firm?.independent).toEqual({
            firstPayout: 1,
            funded: 1,
            movedLive: 0,
            passed: 1,
            purchased: 2,
        });
    });

    it('carries fees, net payouts and net for the accounts that reached each stage', () => {
        const passedFunded = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const passedOnly = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const bought = account(EVAL_PLAN);
        const ledgerOnly = account(EVAL_PLAN, {
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const result = stageFunnel(
            ledger({
                accounts: [passedFunded, passedOnly, bought, ledgerOnly],
                events: [
                    purchased(passedFunded),
                    event(
                        passedFunded,
                        AccountEventKind.EvalPassed,
                        '2026-09-10',
                    ),
                    purchased(passedOnly),
                    event(
                        passedOnly,
                        AccountEventKind.EvalPassed,
                        '2026-09-10',
                    ),
                    purchased(bought),
                    purchased(ledgerOnly),
                ],
                fees: [
                    ...[passedFunded, passedOnly, bought, ledgerOnly].map(
                        (entry) =>
                            fee(
                                entry,
                                FeeKind.EvalPurchase,
                                15_000,
                                '2026-09-01',
                            ),
                    ),
                    fee(passedFunded, FeeKind.Activation, 10_000, '2026-09-11'),
                    fee(passedOnly, FeeKind.Activation, 10_000, '2026-09-11'),
                ],
                payouts: [
                    payout(passedFunded, 40_000),
                    payout(passedFunded, 50_000),
                ],
            }),
        );
        const firm = result.byFirm.find(
            (f) => firmKeyId(f.firmKey) === modeledKeyId(EVAL_PLAN.firm.id),
        );
        expect(firm?.stages).toEqual({
            firstPayout: {
                feesCents: 25_000,
                netCents: 65_000,
                netPayoutsCents: 90_000,
            },
            funded: {
                feesCents: 65_000,
                netCents: 25_000,
                netPayoutsCents: 90_000,
            },
            movedLive: { feesCents: 0, netCents: 0, netPayoutsCents: 0 },
            passed: {
                feesCents: 50_000,
                netCents: 40_000,
                netPayoutsCents: 90_000,
            },
            purchased: {
                feesCents: 80_000,
                netCents: 10_000,
                netPayoutsCents: 90_000,
            },
        });
        expect(firm?.feesCents).toBe(80_000);
        expect(firm?.netPayoutsCents).toBe(90_000);
    });

    it('counts a modeled account with no recorded purchase event as purchased through the implied purchase, so the purchased stage covers the firm total', () => {
        const noPurchaseEvent = account(EVAL_PLAN, {
            stage: AccountStage.Funded,
        });
        const bought = account(EVAL_PLAN);
        const result = stageFunnel(
            ledger({
                accounts: [noPurchaseEvent, bought],
                events: [
                    event(
                        noPurchaseEvent,
                        AccountEventKind.EvalPassed,
                        '2026-09-10',
                    ),
                    purchased(bought),
                ],
                fees: [
                    fee(
                        noPurchaseEvent,
                        FeeKind.EvalPurchase,
                        15_000,
                        '2026-09-01',
                    ),
                    fee(bought, FeeKind.EvalPurchase, 15_000, '2026-09-01'),
                ],
                payouts: [payout(noPurchaseEvent, 40_000)],
            }),
        );
        const firm = result.byFirm.find(
            (f) => firmKeyId(f.firmKey) === modeledKeyId(EVAL_PLAN.firm.id),
        );
        expect(firm?.purchased).toBe(2);
        expect(firm?.feesCents).toBe(30_000);
        expect(firm?.stages.purchased.feesCents).toBe(firm?.feesCents);
        expect(firm?.stages.purchased.netPayoutsCents).toBe(
            firm?.netPayoutsCents,
        );
        expect(firm?.stages.funded.feesCents).toBe(15_000);
    });
});
