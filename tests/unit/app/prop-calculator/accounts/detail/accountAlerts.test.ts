import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { accountAlerts } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountAlerts';
import {
    type OverviewAccountRow,
    type OverviewAlerts,
    OverviewSectionStatus,
    type OverviewSnapshotRow,
    type PortfolioQueries,
    PortfolioSource,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    AccountEventKind,
    AccountStage,
    AlertKind,
    alertKindLabel,
    AlertSeverity,
    BankrollTransferKind,
    DashboardBalanceConvention,
    type LedgerAccountRow,
    type LedgerEventRow,
    usdCents,
} from '~/lib/prop-accounts';
import {
    findFirm,
    FirmId,
    MffuVariant,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    account,
    EVAL_PLAN,
    event,
    payout,
    type PlanEntry,
    purchased,
    transfer,
} from '../../../../lib/prop-accounts/metrics/ledgerFixtures';

const TODAY = '2026-09-26';

type AccountAlertQueries = Partial<
    Pick<
        PortfolioQueries,
        | PortfolioSource.Decisions
        | PortfolioSource.Events
        | PortfolioSource.Fees
        | PortfolioSource.Transfers
    >
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

function evalQueries(
    rulebook: RulebookParameters,
    overrides: Partial<AccountAlertQueries> = {},
    omitted: readonly PortfolioSource[] = [],
): { readonly accountId: string; readonly queries: AccountAlertQueries } {
    const { owner, snapshots } = losingEval();
    const isWired = (source: PortfolioSource) => !omitted.includes(source);
    return {
        accountId: owner.id,
        queries: {
            [PortfolioSource.Accounts]: {
                data: [overviewAccount(owner)],
                error: null,
            },
            [PortfolioSource.CopyGroups]: { data: [], error: null },
            ...(isWired(PortfolioSource.Decisions) && {
                [PortfolioSource.Decisions]: { data: [], error: null },
            }),
            [PortfolioSource.Events]: {
                data: [purchased(owner)],
                error: null,
            },
            ...(isWired(PortfolioSource.Fees) && {
                [PortfolioSource.Fees]: { data: [], error: null },
            }),
            [PortfolioSource.Payouts]: { data: [], error: null },
            [PortfolioSource.Rulebook]: { data: rulebook, error: null },
            [PortfolioSource.Snapshots]: { data: snapshots, error: null },
            ...(isWired(PortfolioSource.Transfers) && {
                [PortfolioSource.Transfers]: {
                    data: [
                        transfer(
                            BankrollTransferKind.Deposit,
                            1_000_000,
                            '2026-08-01',
                        ),
                    ],
                    error: null,
                },
            }),
            ...overrides,
        },
    };
}

function labelsOf(alerts: OverviewAlerts): string[] {
    return readyAlertsOf(alerts).alerts.map((alert) => alert.kindLabel);
}

function losingEval() {
    const owner = account(EVAL_PLAN, {
        label: 'Losing eval',
        purchasedOn: '2026-09-01',
    });
    const start = EVAL_PLAN.plan.accountSize;
    return {
        owner,
        snapshots: [
            snapshotAt(owner, '2026-09-25', start + 600, 3),
            snapshotAt(owner, TODAY, start - 900, 4),
        ],
    };
}

function readyAlertsOf(alerts: OverviewAlerts) {
    if (alerts.kind !== OverviewSectionStatus.Ready) {
        throw new Error(`expected ready alerts, got ${alerts.kind}`);
    }
    return alerts;
}

function rulebookWith(
    alerts: Partial<RulebookParameters['alerts']>,
): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        alerts: { ...DEFAULT_RULEBOOK.alerts, ...alerts },
    };
}

function snapshotAt(
    owner: LedgerAccountRow,
    asOf: string,
    balanceDollars: number,
    tradingDays: number,
): OverviewSnapshotRow {
    const peak = usdCents(Math.round((EVAL_PLAN.plan.accountSize + 600) * 100));
    return {
        accountId: owner.id,
        asOf,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(Math.round(balanceDollars * 100)),
        createdAt: new Date(`${asOf}T00:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: peak,
        highestIntradayBalanceCents: peak,
        id: `snapshot-${asOf}-${owner.id}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays,
        userId: owner.userId,
    };
}

describe('accountAlerts day loss and payout-ready risk inputs (PT-69b, F-V19)', () => {
    const dayLossRulebook = rulebookWith({ dayLossBankrollFraction: 0.0001 });
    const riskRulebook = rulebookWith({
        payoutReadyRiskAboveRungCents: usdCents(5000),
    });

    it('raises the large day loss alert on the detail page once the ledger, the bankroll and two snapshots are loaded', () => {
        const { accountId, queries } = evalQueries(dayLossRulebook);
        const alerts = accountAlerts({ accountId, queries, today: TODAY });
        expect(labelsOf(alerts)).toContain(
            alertKindLabel(AlertKind.LargeDayLoss),
        );
        const dayLoss = readyAlertsOf(alerts).alerts.find(
            (alert) =>
                alert.kindLabel === alertKindLabel(AlertKind.LargeDayLoss),
        );
        expect(dayLoss?.severity).toBe(AlertSeverity.Warning);
        expect(dayLoss?.message).toContain('of your available bankroll');
    });

    it('says the day loss alert cannot be checked while the ledger it needs is still loading', () => {
        const { accountId, queries } = evalQueries(dayLossRulebook, {
            [PortfolioSource.Transfers]: { data: undefined, error: null },
        });
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.alerts.map((alert) => alert.kindLabel)).not.toContain(
            alertKindLabel(AlertKind.LargeDayLoss),
        );
        expect(alerts.accountStatesCaveat).toContain('still loading');
    });

    it('says the day loss alert cannot be checked when the ledger it needs failed to load', () => {
        const { accountId, queries } = evalQueries(dayLossRulebook, {
            [PortfolioSource.Fees]: {
                data: undefined,
                error: new Error('down'),
            },
        });
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toContain('could not be loaded');
        expect(alerts.accountStatesCaveat).toContain('fees');
    });

    it('says the day loss alert is not checked on this page when the ledger inputs are not wired in', () => {
        const { accountId, queries } = evalQueries(dayLossRulebook, {}, [
            PortfolioSource.Fees,
            PortfolioSource.Transfers,
        ]);
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toContain('day loss');
        expect(alerts.accountStatesCaveat).toContain('not loaded on this page');
    });

    it('raises the payout-ready risk alert on the detail page for an eligible funded account that risked far above the rung', () => {
        const entry = mffuPro50k();
        const owner = account(entry, {
            fundedOn: '2026-08-01',
            label: 'Eligible funded',
            purchasedOn: '2026-07-01',
            stage: AccountStage.Funded,
        });
        const size = entry.plan.accountSize;
        const eligible: OverviewSnapshotRow = {
            ...snapshotAt(owner, TODAY, size + 20_000, 40),
            balanceAtLastPayoutCents: usdCents((size + 0) * 100),
            cycleBestDayProfitCents: usdCents(2_000_000),
            highestEodBalanceCents: usdCents((size + 20_000) * 100),
            highestIntradayBalanceCents: usdCents((size + 20_000) * 100),
            lastPayoutOn: '2026-08-20',
            payoutsTaken: 1,
            qualifyingDaysSinceLastPayout: 999,
        };
        const queries: AccountAlertQueries = {
            [PortfolioSource.Accounts]: {
                data: [
                    {
                        ...overviewAccount(owner),
                        firstFundedTradeOn: '2026-08-01',
                    },
                ],
                error: null,
            },
            [PortfolioSource.CopyGroups]: { data: [], error: null },
            [PortfolioSource.Decisions]: {
                data: [
                    {
                        acceptedRiskCents: usdCents(1_000_000),
                        accountId: owner.id,
                        actualRiskCents: null,
                        createdAt: new Date(`${TODAY}T09:00:00Z`),
                        decidedOn: TODAY,
                        id: 'decision-eligible',
                    },
                ],
                error: null,
            },
            [PortfolioSource.Events]: {
                data: [purchased(owner)],
                error: null,
            },
            [PortfolioSource.Fees]: { data: [], error: null },
            [PortfolioSource.Payouts]: { data: [], error: null },
            [PortfolioSource.Rulebook]: { data: riskRulebook, error: null },
            [PortfolioSource.Snapshots]: { data: [eligible], error: null },
            [PortfolioSource.Transfers]: {
                data: [
                    transfer(
                        BankrollTransferKind.Deposit,
                        1_000_000,
                        '2026-08-01',
                    ),
                ],
                error: null,
            },
        };
        const alerts = readyAlertsOf(
            accountAlerts({ accountId: owner.id, queries, today: TODAY }),
        );
        expect(labelsOf(alerts)).toContain(
            alertKindLabel(AlertKind.PayoutReadyOpenRisk),
        );
        expect(alerts.accountStatesCaveat).toBeNull();
    });

    it('says the withdrawable drop alert is not checked on this page when the ledger inputs are not wired in', () => {
        const { accountId, queries } = evalQueries(
            rulebookWith({ payoutReadyLossFraction: 0.2 }),
            {},
            [PortfolioSource.Fees, PortfolioSource.Transfers],
        );
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toContain('withdrawable');
        expect(alerts.accountStatesCaveat).toContain('not loaded on this page');
        expect(alerts.accountStatesCaveat).not.toContain('day loss');
    });

    it('says both ledger-only alerts are unchecked when both thresholds are set and nothing is wired in', () => {
        const { accountId, queries } = evalQueries(
            rulebookWith({
                dayLossBankrollFraction: 0.1,
                payoutReadyLossFraction: 0.2,
            }),
            {},
            [PortfolioSource.Fees, PortfolioSource.Transfers],
        );
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toContain('day loss');
        expect(alerts.accountStatesCaveat).toContain('withdrawable');
    });

    it('says nothing about the withdrawable drop alert once the ledger inputs are loaded', () => {
        const { accountId, queries } = evalQueries(
            rulebookWith({ payoutReadyLossFraction: 0.2 }),
        );
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toBeNull();
    });

    it('says nothing about either alert on the default rulebook, wired in or not', () => {
        for (const omitted of [
            [],
            [
                PortfolioSource.Decisions,
                PortfolioSource.Fees,
                PortfolioSource.Transfers,
            ],
        ]) {
            const { accountId, queries } = evalQueries(
                DEFAULT_RULEBOOK,
                {},
                omitted,
            );
            const alerts = readyAlertsOf(
                accountAlerts({ accountId, queries, today: TODAY }),
            );
            expect(alerts.accountStatesCaveat).toBeNull();
        }
    });

    it('stays quiet about the payout-ready risk alert when the decisions loaded', () => {
        const { accountId, queries } = evalQueries(riskRulebook);
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toBeNull();
    });

    it('says the payout-ready risk alert cannot be checked while the sizing decisions are loading', () => {
        const { accountId, queries } = evalQueries(riskRulebook, {
            [PortfolioSource.Decisions]: { data: undefined, error: null },
        });
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toContain(
            'risk above the documented rung',
        );
        expect(alerts.accountStatesCaveat).toContain('still loading');
    });

    it('says the payout-ready risk alert cannot be checked when the sizing decisions failed to load', () => {
        const { accountId, queries } = evalQueries(riskRulebook, {
            [PortfolioSource.Decisions]: {
                data: undefined,
                error: new Error('down'),
            },
        });
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toContain(
            'risk above the documented rung',
        );
        expect(alerts.accountStatesCaveat).toContain('could not be loaded');
    });

    it('says the payout-ready risk alert is not checked on this page when no decisions query is wired in', () => {
        const { accountId, queries } = evalQueries(riskRulebook, {}, [
            PortfolioSource.Decisions,
        ]);
        const alerts = readyAlertsOf(
            accountAlerts({ accountId, queries, today: TODAY }),
        );
        expect(alerts.accountStatesCaveat).toContain(
            'risk above the documented rung',
        );
        expect(alerts.accountStatesCaveat).toContain('not loaded on this page');
    });
});

describe('the alert-extras helpers have one copy (PT-69c, F-V29)', () => {
    const accountsRoot = path.resolve(
        import.meta.dirname,
        '../../../../../../src/app/(app)/prop-calculator/accounts',
    );
    const sources = readdirSync(accountsRoot, {
        recursive: true,
        withFileTypes: true,
    })
        .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
        .map((entry) => {
            const file = path.join(entry.parentPath, entry.name);
            return { file, text: readFileSync(file, 'utf8') };
        });

    function definitionsOf(name: string): string[] {
        const pattern = new RegExp(
            String.raw`(?:function\s+${name}\b|const\s+${name}\b)`,
            'u',
        );
        return sources
            .filter(({ text }) => pattern.test(text))
            .map(({ file }) => path.basename(file));
    }

    it('defines each shared helper once, in the overview model', () => {
        for (const name of [
            'alertExtrasOf',
            'availableBankrollCentsFor',
            'combinedNote',
            'decisionsCaveatFor',
        ]) {
            expect(definitionsOf(name)).toEqual(['overviewModel.ts']);
        }
    });

    it('keeps none of the detail page copies', () => {
        for (const name of [
            'availableBankrollCentsOf',
            'DECISIONS_FAILED',
            'DECISIONS_PENDING',
            'decisionsCaveatOf',
            'joinedNotes',
        ]) {
            expect(definitionsOf(name)).toEqual([]);
        }
    });

    it('calls the shared helpers from the detail alerts', () => {
        const detail = sources.find(
            ({ file }) => path.basename(file) === 'accountAlerts.ts',
        );
        expect(detail?.text).toContain('alertExtrasOf');
        expect(detail?.text).toContain('combinedNote');
        expect(detail?.text).toContain('decisionsCaveatFor');
    });
});
