import { describe, expect, it } from 'vitest';

import { accountAlerts } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountAlerts';
import {
    type OverviewAccountRow,
    type OverviewAlerts,
    OverviewSectionStatus,
    type PortfolioQueries,
    PortfolioSource,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    AccountEventKind,
    AccountStage,
    AlertKind,
    alertKindLabel,
    DashboardBalanceConvention,
    type LedgerAccountRow,
    type LedgerEventRow,
} from '~/lib/prop-accounts';
import {
    findFirm,
    FirmId,
    MffuVariant,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    account,
    event,
    payout,
    type PlanEntry,
} from '../../../../lib/prop-accounts/metrics/ledgerFixtures';

const TODAY = '2026-09-26';

type AccountAlertQueries = Partial<
    Pick<PortfolioQueries, PortfolioSource.Events>
> &
    Pick<
        PortfolioQueries,
        | PortfolioSource.Accounts
        | PortfolioSource.CopyGroups
        | PortfolioSource.Payouts
        | PortfolioSource.Rulebook
        | PortfolioSource.Snapshots
    >;

function capAlertIn(alerts: OverviewAlerts): string {
    if (alerts.kind !== OverviewSectionStatus.Ready) {
        throw new Error(`expected ready alerts, got ${alerts.kind}`);
    }
    const capAlert = alerts.alerts.find(
        (alert) =>
            alert.kindLabel === alertKindLabel(AlertKind.LifetimeDollarCapNear),
    );
    if (capAlert === undefined) {
        throw new Error('expected a lifetime dollar cap alert');
    }
    return capAlert.message;
}

function fixtures(): {
    readonly bravo: LedgerAccountRow;
    readonly charlie: LedgerAccountRow;
} {
    const plan = mffuPro50k();
    const entry: PlanEntry = plan;
    const bravo = account(entry, {
        label: 'Bravo',
        stage: AccountStage.Funded,
    });
    const charlie = account(entry, {
        label: 'Charlie',
        stage: AccountStage.Live,
    });
    return { bravo, charlie };
}

function mffuPro50k(): PlanEntry {
    const firm = findFirm(FirmId.Mffu);
    const plan = firm?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (firm === undefined || plan === undefined) {
        throw new Error('no MFF Pro 50K plan');
    }
    return { firm, plan, serial: serializePlanId(plan.id) };
}

function overviewAccount(row: LedgerAccountRow): OverviewAccountRow {
    return {
        ...row,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        firstFundedTradeOn: null,
        liveStartBalanceCents: null,
    };
}

function queriesFor(
    bravo: LedgerAccountRow,
    charlie: LedgerAccountRow,
    events: readonly LedgerEventRow[] | undefined,
): AccountAlertQueries {
    return {
        [PortfolioSource.Accounts]: {
            data: [bravo, charlie].map(overviewAccount),
            error: null,
        },
        [PortfolioSource.CopyGroups]: { data: [], error: null },
        ...(events !== undefined && {
            [PortfolioSource.Events]: { data: events, error: null },
        }),
        [PortfolioSource.Payouts]: {
            data: [
                payout(bravo, 4_000_000, {
                    netCents: 4_000_000,
                    paidOn: '2026-09-05',
                    requestedOn: '2026-09-03',
                }),
                payout(charlie, 6_000_000, {
                    netCents: 6_000_000,
                    paidOn: '2026-09-10',
                    requestedOn: '2026-09-08',
                }),
                payout(charlie, 3_000_000, {
                    netCents: 3_000_000,
                    paidOn: '2026-09-20',
                    requestedOn: '2026-09-18',
                }),
            ],
            error: null,
        },
        [PortfolioSource.Rulebook]: { data: DEFAULT_RULEBOOK, error: null },
        [PortfolioSource.Snapshots]: { data: [], error: null },
    };
}

describe('accountAlerts', () => {
    it("uses a moved-live sibling's recorded move-live date when its events query is wired in", () => {
        const { bravo, charlie } = fixtures();
        const movedLiveEvent = event(
            charlie,
            AccountEventKind.MovedLive,
            '2026-09-15',
        );
        const message = capAlertIn(
            accountAlerts({
                accountId: bravo.id,
                queries: queriesFor(bravo, charlie, [movedLiveEvent]),
                today: TODAY,
            }),
        );
        expect(message).toContain('no further payout fits under the cap');
        expect(message).toContain(
            'not counting $30,000 paid on 1 account after moving live',
        );
    });

    it('falls back to the unconfirmed moved-live treatment when no events query is wired in', () => {
        const { bravo, charlie } = fixtures();
        const message = capAlertIn(
            accountAlerts({
                accountId: bravo.id,
                queries: queriesFor(bravo, charlie, undefined),
                today: TODAY,
            }),
        );
        expect(message).toContain(
            'which may include live payouts the cap does not count, because the alert does not know when each account moved live',
        );
    });
});
