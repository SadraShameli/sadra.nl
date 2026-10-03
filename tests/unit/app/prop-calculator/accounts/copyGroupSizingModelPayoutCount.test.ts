import { describe, expect, it } from 'vitest';

import {
    type CopyGroupAccount,
    copyGroupRows,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    type OverviewAccountRow,
    type OverviewPayoutRow,
    type OverviewSnapshotRow,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { copyGroupSizingSectionsOf } from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts';
import {
    CENTS_PER_DOLLAR,
    findFirm,
    FirmId,
    MffuVariant,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    CopyGroupSizingRejectionKind,
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
} from '~/lib/prop-calculator/advisor';

const USER_ID = 'user-a';
const TODAY = '2026-09-26';
const GROUP = {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Main copy',
    notes: null,
};

const PLAN = (() => {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
})();
const DOCUMENTED_RISK = DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR;
const PEAK = PLAN.accountSize + 20_000;
const THRESHOLD = PEAK - PLAN.fundedDrawdown.amount;
const ROOMY_BALANCE_CENTS = Math.round((THRESHOLD + DOCUMENTED_RISK * 5) * 100);

function accountRow(
    id: string,
    overrides: Record<string, unknown> = {},
): CopyGroupAccount & OverviewAccountRow {
    return {
        accountSize: PLAN.accountSize,
        archivedAt: null,
        copyGroupId: GROUP.id,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: PLAN.id.firm,
        firstFundedTradeOn: '2026-08-01',
        fundedOn: '2026-08-01',
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-07-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
        ...overrides,
    } as unknown as CopyGroupAccount & OverviewAccountRow;
}

function payoutRow(accountId: string, paidOn: string): OverviewPayoutRow {
    return {
        accountId,
        approvedOn: null,
        grossCents: usdCents(100_000),
        id: `${accountId}-payout`,
        netCents: usdCents(90_000),
        paidOn,
        requestedOn: '2026-09-10',
        status: PayoutStatus.Paid,
        userId: USER_ID,
    };
}

function sectionFor(
    accounts: readonly (CopyGroupAccount & OverviewAccountRow)[],
    payouts: readonly OverviewPayoutRow[] = [],
) {
    const sections = copyGroupSizingSectionsOf(
        DEFAULT_RULEBOOK,
        USER_ID,
        TODAY,
        accounts,
        [],
        payouts,
        accounts.map((account) => snapshotRow(account.id)),
        copyGroupRows([GROUP], accounts).groups,
    );
    const section = sections.get(GROUP.id);
    if (section === undefined) throw new Error('no section for the group');
    return section;
}

function snapshotRow(accountId: string): OverviewSnapshotRow {
    return {
        accountId,
        asOf: TODAY,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(ROOMY_BALANCE_CENTS),
        createdAt: new Date(`${TODAY}T00:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(Math.round(PEAK * 100)),
        highestIntradayBalanceCents: null,
        id: `${accountId}-snapshot`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 20,
        userId: USER_ID,
    };
}

describe('the copy-group sizing model hands each member its personal payout overrides (PT-36n, F-145)', () => {
    it("carries each member's own personal retained cushion and request override and no one else's", () => {
        const section = sectionFor([
            accountRow('loose'),
            accountRow('careful', {
                personalRules: {
                    payoutRequestOverrideCents: 200_000,
                    retainedCushionCents: 350_000,
                },
            }),
        ]);
        const memberOf = (id: string) =>
            section.inputs.members.find((member) => member.id === id);
        expect(memberOf('careful')).toMatchObject({
            personalRequestOverride: 2000,
            personalRetainedCushion: 3500,
        });
        expect(memberOf('loose')).toMatchObject({
            personalRequestOverride: null,
            personalRetainedCushion: null,
        });
    });
});

describe('the copy-group sizing model with an unreadable firm count (PT-36n, F-145)', () => {
    it('leaves every member of the firm unsized with the firm count reason instead of sizing them on an undercount', () => {
        const section = sectionFor(
            [accountRow('a'), accountRow('b')],
            [payoutRow('b', 'sometime')],
        );
        expect(section.result).toMatchObject({
            kind: CopyGroupSizingResultKind.Rejected,
            rejection: { kind: CopyGroupSizingRejectionKind.NoMembers },
        });
        expect(section.unsizedMembers).toHaveLength(2);
        for (const member of section.unsizedMembers) {
            expect(member.reason).toContain('payout count');
        }
    });
});
