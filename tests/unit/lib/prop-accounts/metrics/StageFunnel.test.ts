import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    AccountEventKind,
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    PayoutStatus,
    type StoredFirmId,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts/core';
import { type FirmFunnel, stageFunnel } from '~/lib/prop-accounts/metrics';
import { type FirmId } from '~/lib/prop-calculator';

import {
    account,
    EVAL_PLAN,
    event,
    INSTANT_PLAN,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    payout,
    purchased,
} from './ledgerFixtures';

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
            result.byFirm.find((f) => f.firmId === EVAL_PLAN.firm.id),
        ).toEqual({
            firmId: EVAL_PLAN.firm.id,
            firstPayout: 2,
            funded: 3,
            movedLive: 1,
            passed: 3,
            purchased: 4,
        });
        expect(
            result.byFirm.find(
                (f) => f.firmId === OTHER_FIRM_EVAL_PLAN.firm.id,
            ),
        ).toEqual({
            firmId: OTHER_FIRM_EVAL_PLAN.firm.id,
            firstPayout: 0,
            funded: 0,
            movedLive: 0,
            passed: 0,
            purchased: 1,
        });
        expect(result.unresolvedAccounts).toBe(0);
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
        expect(result.byFirm).toEqual([
            {
                firmId: INSTANT_PLAN.firm.id,
                firstPayout: 0,
                funded: 1,
                movedLive: 0,
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
        expect(result.byFirm.map((row) => row.firmId)).toEqual([
            OTHER_FIRM_EVAL_PLAN.firm.id,
        ]);
        expect(result.unresolvedAccounts).toBe(1);
        expectTypeOf<FirmFunnel['firmId']>().toEqualTypeOf<FirmId>();
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
        expect(result.byFirm).toEqual([
            {
                firmId: EVAL_PLAN.firm.id,
                firstPayout: 0,
                funded: 1,
                movedLive: 0,
                passed: 1,
                purchased: 1,
            },
        ]);
        expect(result.unresolvedAccounts).toBe(1);
    });
});
