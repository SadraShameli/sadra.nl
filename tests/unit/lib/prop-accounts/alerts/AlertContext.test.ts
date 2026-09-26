import { describe, expect, expectTypeOf, it } from 'vitest';

import { type AlertAccountRow } from '~/lib/prop-accounts/alerts';
import {
    type AccountReadIssue,
    AccountReadIssueKind,
    PlanKeyResolutionKind,
    type StoredFirmId,
    UnresolvedPlanReason,
} from '~/lib/prop-accounts/core';
import { type FirmId, NO_PLAN_OPT_INS } from '~/lib/prop-calculator';
import { type PropAccountRow } from '~/server/db/schemas/prop';

import {
    accountFor,
    ANY_EVAL_PLAN,
    contextOf,
    MONDAY,
    paidPayout,
    snapshotFor,
    TUESDAY,
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

    it('resolves the plan and never throws for an unresolvable one', () => {
        const resolved = accountFor(ANY_EVAL_PLAN);
        const unknownFirm = accountFor(ANY_EVAL_PLAN, {
            firmId: 'no-such-firm' as FirmId,
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
        expect(monitored?.planKey.readIssues).toEqual(readIssues);
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
        expectTypeOf<AlertAccountRow['firmId']>().toEqualTypeOf<StoredFirmId>();
        expectTypeOf<StoredFirmId>().not.toExtend<FirmId>();
        expectTypeOf<FirmId>().toExtend<StoredFirmId>();
    });

    it('rejects a malformed today', () => {
        expect(() => contextOf({ today: '23-09-2026' })).toThrow(RangeError);
    });
});
