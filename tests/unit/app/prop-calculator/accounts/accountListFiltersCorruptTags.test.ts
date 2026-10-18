import { describe, expect, it } from 'vitest';

import {
    type AccountListAccount,
    buildAccountListRows,
    readIssuesOf,
} from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    type ModeledAccountRow,
    PlanKeyResolutionKind,
    resolvePlanKey,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    FirmId,
    NO_PLAN_OPT_INS,
    type PlanId,
    serializePlanId,
} from '~/lib/prop-calculator';
import { STORED_DATA_OWNER_REPAIR } from '~/lib/schemas/propAccountOutputs';

function apexPlanId(): PlanId {
    const plan = ALL_FIRMS.find((firm) => firm.id === FirmId.Apex)?.plans[0];
    if (plan === undefined) throw new Error('no Apex plan to test with');
    return plan.id;
}

const PLAN_ID = apexPlanId();

function account(
    overrides: Partial<ModeledAccountRow<AccountListAccount>> = {},
): ModeledAccountRow<AccountListAccount> {
    return {
        accountSize: PLAN_ID.accountSize,
        archivedAt: null,
        copyGroupId: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FirmId.Apex,
        firstFundedTradeOn: null,
        id: 'tango',
        label: 'tango',
        liveStartBalanceCents: null,
        notes: null,
        optIns: NO_PLAN_OPT_INS,
        planLabel: null,
        planSerial: serializePlanId(PLAN_ID),
        purchasedOn: '2026-09-01',
        readIssues: [],
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

const CORRUPT_RULES = {
    kind: AccountReadIssueKind.CorruptPersonalRules,
} as const;

function onlyRow(stored: ModeledAccountRow<AccountListAccount>) {
    const [row] = buildAccountListRows([stored], []);
    if (row === undefined) throw new Error('no row built');
    return row;
}

describe('a corrupt stored tags value on an account row is a notice, not a read-only issue (PT-110b)', () => {
    it('keeps the row editable and names the tags with the way to repair them', () => {
        const row = onlyRow(account({ hasCorruptTags: true }));
        expect(row.isReadOnly).toBe(false);
        expect(row.planIssue).toBeNull();
        expect(row.readOnlyNotice).toBeNull();
        expect(row.tagsNotice).toMatch(/tags/i);
        expect(row.tagsNotice).toMatch(/saving/i);
    });

    it('does not send the user to the site owner or call the account read-only', () => {
        const { tagsNotice } = onlyRow(account({ hasCorruptTags: true }));
        expect(tagsNotice).not.toContain(STORED_DATA_OWNER_REPAIR);
        expect(tagsNotice).not.toMatch(/read-only|cannot be edited|no sizing/i);
        expect(tagsNotice).not.toContain('\u{2014}');
    });

    it('has no tags notice for a healthy row or an explicit false', () => {
        expect(onlyRow(account()).tagsNotice).toBeNull();
        expect(
            onlyRow(account({ hasCorruptTags: false })).tagsNotice,
        ).toBeNull();
    });

    it('leaves the read issues of a corrupt tags row empty so every gate keeps the account', () => {
        const stored = account({ hasCorruptTags: true });
        const plan = resolvePlanKey(stored);
        expect(plan.kind).toBe(PlanKeyResolutionKind.Resolved);
        expect(readIssuesOf(stored, plan)).toEqual([]);
    });

    it('still reads the account as read-only when another issue blocks it, and keeps the tags notice', () => {
        const row = onlyRow(
            account({ hasCorruptTags: true, readIssues: [CORRUPT_RULES] }),
        );
        expect(row.isReadOnly).toBe(true);
        expect(row.readOnlyNotice).not.toBeNull();
        expect(row.tagsNotice).toMatch(/tags/i);
    });
});
