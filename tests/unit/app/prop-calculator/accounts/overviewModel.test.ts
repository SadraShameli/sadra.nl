import { describe, expect, it } from 'vitest';

import { accountAlerts } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountAlerts';
import {
    accountEventKindLabel,
    alertsFor,
    buildOverview,
    feeKindLabel,
    KpiTone,
    ledgerOrDateFailure,
    OVERVIEW_TIMELINE_LIMIT,
    type OverviewAccountRow,
    type OverviewAlert,
    type OverviewAlerts,
    type OverviewInputs,
    OverviewKpiKind,
    type OverviewLedger,
    type OverviewLedgerCards,
    OverviewNoticeKind,
    type OverviewPayoutRow,
    OverviewSectionStatus,
    type OverviewSnapshotRow,
    payoutStatusLabel,
    portfolioAlerts,
    portfolioLoad,
    type PortfolioQueries,
    type PortfolioRows,
    PortfolioSource,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    AccountEventKind,
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    AlertEvaluator,
    AlertKind,
    alertKindLabel,
    AlertSubjectKind,
    BankrollTransferKind,
    createAlertContext,
    DashboardBalanceConvention,
    DEFAULT_ALERT_RULES,
    FeeKind,
    firmKeyId,
    FirmKeyKind,
    formatUsdCents,
    IsoDateError,
    type LedgerAccountRow,
    PayoutStatus,
    SampleLevel,
    usdCents,
} from '~/lib/prop-accounts';
import {
    CENTS_PER_DOLLAR,
    findFirm,
    FirmId,
    MffuVariant,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import {
    PropLimitRejection,
    PropQuota,
    PropRecord,
    type PropRejection,
    propRejectionOf,
    PropStoredRecordRejection,
} from '~/lib/schemas/propAccountOutputs';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    OTHER_FIRM_EVAL_PLAN,
    OTHER_USER_ID,
    payout,
    type PlanEntry,
    purchased,
    transfer,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

const EVAL_FIRM_KEY = firmKeyId({
    firmId: EVAL_PLAN.firm.id,
    kind: FirmKeyKind.Modeled,
});
const OTHER_FIRM_KEY = firmKeyId({
    firmId: OTHER_FIRM_EVAL_PLAN.firm.id,
    kind: FirmKeyKind.Modeled,
});

const TODAY = '2026-09-26';
const USER_ID = 'user-a';
const RULEBOOK_MESSAGE =
    'Your stored rulebook is not valid: x. Save a valid rulebook or reset it to the defaults';

function alertRichRows(): PortfolioRows {
    const pinned = pinnedRows();
    const [alpha, bravo] = pinned.accounts;
    if (alpha === undefined || bravo === undefined) {
        throw new Error('the pinned fixture has two accounts');
    }
    const groupId = 'group-mirror';
    const charlie = overviewAccount(
        account(EVAL_PLAN, {
            label: 'Charlie',
            purchasedOn: '2026-01-05',
        }),
    );
    const unknown = overviewAccount(
        account(EVAL_PLAN, {
            label: 'Unknown plan',
            planSerial: 'no-such-plan',
        }),
    );
    const badDate = overviewAccount(
        account(EVAL_PLAN, { label: 'Bad date', purchasedOn: '2026-02-30' }),
    );
    return {
        ...pinned,
        accounts: [
            { ...alpha, copyGroupId: groupId },
            bravo,
            { ...charlie, copyGroupId: groupId },
            unknown,
            badDate,
        ],
        copyGroups: [{ id: groupId, name: 'Mirror' }],
    };
}

function answered(rows: PortfolioRows): PortfolioQueries {
    return {
        [PortfolioSource.Accounts]: { data: rows.accounts, error: null },
        [PortfolioSource.CopyGroups]: { data: rows.copyGroups, error: null },
        [PortfolioSource.Events]: { data: rows.events, error: null },
        [PortfolioSource.Fees]: { data: rows.fees, error: null },
        [PortfolioSource.Payouts]: { data: rows.payouts, error: null },
        [PortfolioSource.Rulebook]: { data: rows.rulebook, error: null },
        [PortfolioSource.Snapshots]: { data: rows.snapshots, error: null },
        [PortfolioSource.Transfers]: { data: rows.transfers, error: null },
    };
}

function cardsOf(rows: Partial<PortfolioRows>): OverviewLedgerCards {
    return readyCards(buildOverview(inputs(rows)).ledger);
}

function cents(value: number): string {
    return formatUsdCents(usdCents(value));
}

function detailAlertsOf(
    rows: PortfolioRows,
    accountId: string,
): OverviewAlerts {
    const answeredRows = answered(rows);
    return accountAlerts({
        accountId,
        queries: {
            [PortfolioSource.Accounts]: answeredRows[PortfolioSource.Accounts],
            [PortfolioSource.CopyGroups]:
                answeredRows[PortfolioSource.CopyGroups],
            [PortfolioSource.Payouts]: answeredRows[PortfolioSource.Payouts],
            [PortfolioSource.Rulebook]: answeredRows[PortfolioSource.Rulebook],
            [PortfolioSource.Snapshots]:
                answeredRows[PortfolioSource.Snapshots],
        },
        today: TODAY,
    });
}

function errorWith(message: string, data: unknown): Error {
    return Object.assign(new Error(message), { data });
}

function inputs(
    rows: Partial<PortfolioRows>,
    overrides: Partial<PortfolioQueries> = {},
): OverviewInputs {
    return {
        externalFirms: [],
        load: portfolioLoad({ ...answered(rowsOf(rows)), ...overrides }),
        today: TODAY,
        userId: USER_ID,
    };
}

function ledgerOnlyCards(): OverviewLedgerCards {
    const modeled = account(EVAL_PLAN, {
        fundedOn: '2026-09-10',
        label: 'Modeled',
        purchasedOn: '2026-09-01',
        stage: AccountStage.Funded,
    });
    const big = account(EVAL_PLAN, {
        accountSize: 150_000,
        label: 'Big',
        planLabel: 'Rapid 150K',
        planSerial: null,
        purchasedOn: '2026-09-01',
        stage: AccountStage.Funded,
        tracking: AccountTracking.LedgerOnly,
    });
    return cardsOf({
        accounts: [modeled, big].map(overviewAccount),
        events: [
            purchased(modeled),
            event(modeled, AccountEventKind.EvalPassed, '2026-09-10'),
        ],
        fees: [
            fee(modeled, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
            fee(big, FeeKind.EvalPurchase, 30_000, '2026-09-01'),
        ],
    });
}

function mffProEntry(): PlanEntry {
    const firm = findFirm(FirmId.Mffu);
    if (firm === undefined) throw new Error('MFF firm missing');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFF Pro plan missing');
    return { firm, plan, serial: serializePlanId(plan.id) };
}

function multiSlotRows(): PortfolioRows {
    const alpha = account(EVAL_PLAN, {
        fundedOn: '2026-06-01',
        label: 'Alpha',
        purchasedOn: '2026-05-01',
        stage: AccountStage.Funded,
    });
    const bravo = account(EVAL_PLAN, {
        fundedOn: '2026-06-01',
        label: 'Bravo',
        purchasedOn: '2026-05-01',
        stage: AccountStage.Funded,
    });
    const paid = payout(alpha, 100_000, {
        netCents: 90_000,
        paidOn: '2026-06-15',
        requestedOn: '2026-06-10',
    });
    return rowsOf({
        accounts: [alpha, bravo].map(overviewAccount),
        events: [
            purchased(alpha),
            event(alpha, AccountEventKind.EvalPassed, '2026-06-01'),
            purchased(bravo),
            event(bravo, AccountEventKind.EvalPassed, '2026-06-01'),
        ],
        fees: [
            fee(alpha, FeeKind.EvalPurchase, 15_000, '2026-05-01'),
            fee(bravo, FeeKind.EvalPurchase, 15_000, '2026-05-01'),
        ],
        payouts: [paid],
    });
}

function overviewAccount(row: LedgerAccountRow): OverviewAccountRow {
    return { ...row, copyGroupId: null };
}

function pinnedFixture(): OverviewInputs {
    return inputs(pinnedRows());
}

function pinnedRows(): PortfolioRows {
    const alpha = account(EVAL_PLAN, {
        fundedOn: '2026-06-20',
        label: 'Alpha',
        purchasedOn: '2026-06-01',
        stage: AccountStage.Funded,
    });
    const bravo = account(EVAL_PLAN, {
        label: 'Bravo',
        purchasedOn: '2026-07-01',
        status: AccountStatus.Busted,
    });
    const paid: OverviewPayoutRow = payout(alpha, 100_000, {
        netCents: 90_000,
        paidOn: '2026-08-15',
        requestedOn: '2026-08-10',
    });
    return rowsOf({
        accounts: [alpha, bravo].map(overviewAccount),
        events: [
            purchased(alpha),
            event(alpha, AccountEventKind.EvalPassed, '2026-06-20'),
            purchased(bravo),
            event(bravo, AccountEventKind.Busted, '2026-07-10'),
        ],
        fees: [
            fee(alpha, FeeKind.EvalPurchase, 15_000, '2026-06-01'),
            fee(alpha, FeeKind.Activation, 8000, '2026-06-20'),
            fee(bravo, FeeKind.EvalPurchase, 15_000, '2026-07-01'),
            fee(bravo, FeeKind.Refund, 3000, '2026-07-15'),
        ],
        payouts: [paid],
    });
}

function queries(overrides: Partial<PortfolioQueries>): PortfolioQueries {
    return { ...answered(pinnedRows()), ...overrides };
}

function readyAlerts(alerts: OverviewAlerts): readonly OverviewAlert[] {
    if (alerts.kind !== OverviewSectionStatus.Ready) {
        throw new Error(`alerts not ready: ${alerts.kind}`);
    }
    return alerts.alerts;
}

function readyCards(ledger: OverviewLedger): OverviewLedgerCards {
    if (ledger.kind !== OverviewSectionStatus.Ready) {
        throw new Error(`ledger not ready: ${ledger.kind}`);
    }
    return ledger;
}

function rejectedError(
    message: string,
    overrides: Partial<PropRejection>,
): Error {
    return errorWith(message, { propRejection: rejection(overrides) });
}

function rejection(overrides: Partial<PropRejection>): PropRejection {
    return {
        lifecycleRejection: null,
        limit: null,
        quota: null,
        reason: PropStoredRecordRejection.InvalidStoredRecord,
        record: PropRecord.Account,
        recordId: null,
        ...overrides,
    };
}

function rowsOf(rows: Partial<PortfolioRows>): PortfolioRows {
    return {
        [PortfolioSource.Accounts]: rows.accounts ?? [],
        [PortfolioSource.CopyGroups]: rows.copyGroups ?? [],
        [PortfolioSource.Events]: rows.events ?? [],
        [PortfolioSource.Fees]: rows.fees ?? [],
        [PortfolioSource.Payouts]: rows.payouts ?? [],
        [PortfolioSource.Rulebook]: rows.rulebook ?? DEFAULT_RULEBOOK,
        [PortfolioSource.Snapshots]: rows.snapshots ?? [],
        [PortfolioSource.Transfers]: rows.transfers ?? [],
    };
}

function snapshotRow(
    owner: LedgerAccountRow,
    overrides: Partial<OverviewSnapshotRow> = {},
): OverviewSnapshotRow {
    return {
        accountId: owner.id,
        asOf: '2026-09-05',
        balanceCents: usdCents(0),
        createdAt: new Date('2026-09-05T00:00:00Z'),
        cumulativePayoutCents: null,
        dashboardFloorCents: usdCents(0),
        id: `snapshot-${owner.id}`,
        lastTradedOn: null,
        payoutsTaken: null,
        tradingDays: null,
        ...overrides,
    };
}

function unreadableRulebook(): PortfolioQueries[PortfolioSource.Rulebook] {
    return {
        data: undefined,
        error: rejectedError(RULEBOOK_MESSAGE, {
            record: PropRecord.Rulebook,
        }),
    };
}

describe('propRejectionOf', () => {
    it('reads the typed rejection a tRPC error carries in its data', () => {
        const carried = rejection({ recordId: 'account-1' });
        expect(
            propRejectionOf(
                errorWith('stored account is not valid', {
                    code: 'PRECONDITION_FAILED',
                    propRejection: carried,
                }),
            ),
        ).toEqual(carried);
    });

    it('reads a quota rejection with its limit', () => {
        const carried = rejection({
            limit: 100,
            quota: PropQuota.Scenarios,
            reason: PropLimitRejection.QuotaExceeded,
            record: null,
        });
        expect(
            propRejectionOf(errorWith('quota', { propRejection: carried })),
        ).toEqual(carried);
    });

    it.each([
        ['a plain error', new Error('network down')],
        ['a non-error value', { data: { propRejection: rejection({}) } }],
        ['an error whose data is not an object', errorWith('x', 'text')],
        ['an error whose data is null', errorWith('x', null)],
        ['an error without a rejection', errorWith('x', { code: 'X' })],
        [
            'a malformed rejection',
            errorWith('x', {
                propRejection: { ...rejection({}), reason: 'made-up' },
            }),
        ],
    ])('returns null for %s', (_, error) => {
        expect(propRejectionOf(error)).toBeNull();
    });
});

describe('portfolioLoad', () => {
    it('is ready in every section with every procedure answered', () => {
        const load = portfolioLoad(queries({}));
        expect(load.accounts.status).toBe(OverviewSectionStatus.Ready);
        expect(load.alerts.status).toBe(OverviewSectionStatus.Ready);
        expect(load.ledger.status).toBe(OverviewSectionStatus.Ready);
        expect(load.failures).toEqual([]);
        expect(load.stale).toEqual([]);
    });

    it('keeps a section pending while one of its procedures has no data and none failed', () => {
        const load = portfolioLoad(
            queries({
                [PortfolioSource.Events]: { data: undefined, error: null },
            }),
        );
        expect(load.ledger.status).toBe(OverviewSectionStatus.Pending);
        expect(load.alerts.status).toBe(OverviewSectionStatus.Ready);
        expect(load.failures).toEqual([]);
    });

    it('keeps the ledger section pending until the latest balances have loaded', () => {
        const load = portfolioLoad(
            queries({
                [PortfolioSource.Snapshots]: { data: undefined, error: null },
            }),
        );
        expect(load.ledger.status).toBe(OverviewSectionStatus.Pending);
        expect(load.alerts.status).toBe(OverviewSectionStatus.Pending);
        expect(load.failures).toEqual([]);
    });

    it('gives the rulebook retained cushion in cents once the rulebook has loaded, null before it loads', () => {
        const loaded = portfolioLoad(queries({}));
        expect(loaded.retainedCushionCents).toBe(usdCents(200_000));
        const pending = portfolioLoad(
            queries({
                [PortfolioSource.Rulebook]: { data: undefined, error: null },
            }),
        );
        expect(pending.retainedCushionCents).toBeNull();
    });

    it('fails only the sections that read a failed procedure, with a readable title and message', () => {
        const load = portfolioLoad(
            queries({
                [PortfolioSource.Events]: {
                    data: undefined,
                    error: rejectedError(
                        'More than 5000 account event rows match; narrow the date range or pick one account',
                        {
                            limit: 5000,
                            reason: PropLimitRejection.ListTooLarge,
                            record: PropRecord.Event,
                        },
                    ),
                },
                [PortfolioSource.Fees]: { data: undefined, error: null },
                [PortfolioSource.Rulebook]: unreadableRulebook(),
            }),
        );
        expect(load.failures).toEqual([
            {
                message:
                    'More than 5000 account event rows match; narrow the date range or pick one account.',
                source: PortfolioSource.Events,
                title: 'Your account events could not be loaded',
            },
            {
                message: `${RULEBOOK_MESSAGE}.`,
                source: PortfolioSource.Rulebook,
                title: 'Your rulebook could not be loaded',
            },
        ]);
        expect(load.accounts.status).toBe(OverviewSectionStatus.Ready);
        expect(load.ledger).toEqual({
            failed: [PortfolioSource.Events],
            status: OverviewSectionStatus.Failed,
        });
        expect(load.alerts).toEqual({
            failed: [PortfolioSource.Rulebook],
            status: OverviewSectionStatus.Failed,
        });
    });

    it('keeps cached data after a failed refetch and reports it as stale instead of failed', () => {
        const cached = pinnedRows().snapshots;
        const load = portfolioLoad(
            queries({
                [PortfolioSource.Snapshots]: {
                    data: cached,
                    error: new Error('Failed to fetch'),
                },
            }),
        );
        expect(load.failures).toEqual([]);
        expect(load.alerts.status).toBe(OverviewSectionStatus.Ready);
        expect(load.ledger.status).toBe(OverviewSectionStatus.Ready);
        expect(load.stale).toEqual([
            {
                message:
                    'Failed to fetch. The figures below use the last loaded latest balances.',
                source: PortfolioSource.Snapshots,
                title: 'Your latest balances could not be refreshed',
            },
        ]);
    });
});

describe('buildOverview sections', () => {
    it('keeps the key figures and ledger cards when the rulebook cannot be read, and fails only the alerts', () => {
        const model = buildOverview(
            inputs(pinnedRows(), {
                [PortfolioSource.Rulebook]: unreadableRulebook(),
            }),
        );
        expect(model.hasAccounts).toBe(true);
        expect(readyCards(model.ledger).kpis[0]?.value).toBe(cents(35_000));
        expect(model.alerts).toEqual({
            kind: OverviewSectionStatus.Failed,
            message:
                'Alerts could not be checked because your rulebook could not be loaded.',
        });
    });

    it('keeps the alerts when a ledger procedure fails, and says which one', () => {
        const model = buildOverview(
            inputs(pinnedRows(), {
                [PortfolioSource.Events]: {
                    data: undefined,
                    error: new Error('timeout'),
                },
                [PortfolioSource.Fees]: {
                    data: undefined,
                    error: new Error('timeout'),
                },
            }),
        );
        expect(model.alerts.kind).toBe(OverviewSectionStatus.Ready);
        expect(model.ledger).toEqual({
            kind: OverviewSectionStatus.Failed,
            message:
                'Spend, payouts, net and the ledger cards are not shown because your account events and fees could not be loaded.',
        });
    });

    it('is pending in a section whose procedures are still loading', () => {
        const model = buildOverview(
            inputs(pinnedRows(), {
                [PortfolioSource.CopyGroups]: { data: undefined, error: null },
                [PortfolioSource.Payouts]: { data: undefined, error: null },
            }),
        );
        expect(model.alerts).toEqual({ kind: OverviewSectionStatus.Pending });
        expect(model.ledger).toEqual({ kind: OverviewSectionStatus.Pending });
    });

    it('has no accounts until the accounts are loaded', () => {
        const unloaded = inputs(pinnedRows(), {
            [PortfolioSource.Accounts]: {
                data: undefined,
                error: new Error('down'),
            },
        });
        expect(buildOverview(unloaded).hasAccounts).toBe(false);
    });
});

describe('buildOverview KPI row', () => {
    it('leads with spend, payouts received and net, then realized net per slot, the pending expected net, ROI, payout multiple, total funding and never puts average payout ahead of net or the monthly figures (VD-28)', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.kpis.map((kpi) => kpi.kind)).toEqual([
            OverviewKpiKind.Spend,
            OverviewKpiKind.PayoutsReceived,
            OverviewKpiKind.Net,
            OverviewKpiKind.RealizedNetPerSlot,
            OverviewKpiKind.ExpectedNet,
            OverviewKpiKind.Roi,
            OverviewKpiKind.PayoutMultiple,
            OverviewKpiKind.TotalFunding,
            OverviewKpiKind.AveragePayout,
        ]);
    });

    it('pins the ledger figures of one fixture', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(
            cards.kpis.map(({ detail, label, tone, value }) => ({
                detail,
                label,
                tone,
                value,
            })),
        ).toEqual([
            {
                detail: `After ${cents(3000)} in refunds`,
                label: 'Spend',
                tone: KpiTone.Neutral,
                value: cents(35_000),
            },
            {
                detail: '1 paid payout',
                label: 'Payouts received',
                tone: KpiTone.Neutral,
                value: cents(90_000),
            },
            {
                detail: 'Payouts received minus spend',
                label: 'Net',
                tone: KpiTone.Positive,
                value: cents(55_000),
            },
            {
                detail: `Pooled over 4 months and 3.2 funded slot-months, SE ${cents(30_390)}`,
                label: 'Realized net per slot per month',
                tone: KpiTone.Positive,
                value: cents(17_010),
            },
            {
                detail: 'Modeled monthly net per slot under your documented rule: pending the engine cards',
                label: 'Expected net per slot per month',
                tone: KpiTone.Pending,
                value: 'Pending',
            },
            {
                detail: 'Annual ROI on fees: 486.4%',
                label: 'ROI on cost',
                tone: KpiTone.Positive,
                value: '157.1%',
            },
            {
                detail: 'Payouts received divided by spend',
                label: 'Payout multiple',
                tone: KpiTone.Positive,
                value: '2.57x',
            },
            {
                detail: `Information only: nominal account size, not money you hold. Evals in progress: ${cents(0)} across 0 accounts.`,
                label: 'Total nominal funding',
                tone: KpiTone.Neutral,
                value: cents(EVAL_PLAN.plan.id.accountSize * 100),
            },
            {
                detail: null,
                label: 'Average payout',
                tone: KpiTone.Neutral,
                value: `${cents(90_000)}, n = 1`,
            },
        ]);
    });

    it('shows n/a for ROI at zero spend and for a realized net with no funded slot-month', () => {
        const model = buildOverview(inputs({}));
        const cards = readyCards(model.ledger);
        const byKind = new Map(cards.kpis.map((kpi) => [kpi.kind, kpi]));
        expect(model.hasAccounts).toBe(false);
        expect(byKind.get(OverviewKpiKind.Roi)?.value).toBe('n/a');
        expect(byKind.get(OverviewKpiKind.Roi)?.detail).toBe(
            'No spend recorded yet',
        );
        expect(byKind.get(OverviewKpiKind.RealizedNetPerSlot)).toMatchObject({
            detail: 'No funded slot-month yet',
            tone: KpiTone.Neutral,
            value: 'n/a',
        });
        expect(byKind.get(OverviewKpiKind.Net)?.tone).toBe(KpiTone.Neutral);
    });

    it('shows a null standard error as n/a and flags payouts counted at gross', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-01',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-09-01'),
            ],
            payouts: [payout(owner, 50_000, { paidOn: '2026-09-10' })],
        });
        const byKind = new Map(cards.kpis.map((kpi) => [kpi.kind, kpi]));
        expect(byKind.get(OverviewKpiKind.RealizedNetPerSlot)?.detail).toBe(
            'Pooled over 1 month and 0.9 funded slot-months, SE n/a',
        );
        expect(byKind.get(OverviewKpiKind.PayoutsReceived)?.detail).toBe(
            '1 paid payout; 1 has no net amount, so its gross is counted',
        );
        expect(byKind.get(OverviewKpiKind.Roi)?.value).toBe('n/a');
    });
});

describe('buildOverview cards', () => {
    it('pins the cap usage, cost, outcomes and replacement cards of the fixture', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        const plan = `${EVAL_PLAN.firm.displayName} ${EVAL_PLAN.plan.label}`;
        const cap = EVAL_PLAN.firm.maxFundedAccounts(EVAL_PLAN.plan);
        expect(cards.capUsage).toEqual({
            disclosure:
                'Caps are counted per plan. Firm-wide pooled caps are not modeled yet, so a firm can stop you sooner than these free slots suggest.',
            rows: [
                {
                    cap: String(cap),
                    freeSlots: String(Math.max(0, cap - 1)),
                    key: EVAL_PLAN.serial,
                    note: null,
                    plan,
                    used: '1',
                },
            ],
            unresolvedNote: null,
        });
        expect(cards.cost.perPlan).toEqual([
            {
                acquisitionSpend: cents(35_000),
                costPerFunded: cents(35_000),
                fundedAccounts: '1',
                fundedSampleLevel: null,
                key: EVAL_PLAN.serial,
                modeled: 'Pending',
                pendingEvalAccounts: '0',
                pendingSpend: cents(0),
                plan,
            },
        ]);
        expect(cards.cost.byFirm).toEqual([
            {
                amount: cents(35_000),
                firm: EVAL_PLAN.firm.displayName,
                key: EVAL_FIRM_KEY,
            },
        ]);
        expect(cards.cost.byKind).toEqual([
            {
                amount: cents(8000),
                key: FeeKind.Activation,
                kind: 'Activation fee',
            },
            {
                amount: cents(30_000),
                key: FeeKind.EvalPurchase,
                kind: 'Evaluation purchase',
            },
            { amount: cents(-3000), key: FeeKind.Refund, kind: 'Refund' },
        ]);
        expect(cards.cost.disclosures).toEqual([
            'Fees paid on or after the start of an eval attempt that is still open are pending: they count toward cost per funded account once that attempt passes or fails.',
            'The modeled cost per funded account is pending the engine cards.',
        ]);
        expect(cards.outcomes).toEqual({
            disclosures: [
                'Funded survival counts every account that reached funded; 1 still open is counted as a survivor, so the rate is an upper bound until it closes.',
                'The modeled pass rate and survival are pending the engine cards.',
            ],
            rows: [
                {
                    fundedSurvival: '100.0% (95% CI 20.7% to 100.0%, n = 1)',
                    key: EVAL_PLAN.serial,
                    openFunded: '1',
                    passRate: '50.0% (95% CI 9.5% to 90.5%, n = 2)',
                    plan,
                    sessionsToFunded: '15.0 sessions (SE n/a, n = 1)',
                },
            ],
        });
        const thresholdRows: Partial<PortfolioRows> = {
            ...pinnedRows(),
            rulebook: {
                ...DEFAULT_RULEBOOK,
                samples: {
                    ...DEFAULT_RULEBOOK.samples,
                    minEvalAttempts: 10,
                    minFundedAccounts: 1,
                },
            },
        };
        const withThresholds = readyCards(
            buildOverview(inputs(thresholdRows)).ledger,
        );
        expect(withThresholds.outcomes.rows[0]?.passRate).toBe(
            '50.0% (95% CI 9.5% to 90.5%, n = 2), low sample',
        );
        expect(withThresholds.outcomes.rows[0]?.fundedSurvival).toBe(
            '100.0% (95% CI 20.7% to 100.0%, n = 1), adequate sample',
        );
        expect(
            withThresholds.cost.byFirmAttemptCost[0]?.attemptsSampleLevel,
        ).toBe(SampleLevel.Low);
        expect(withThresholds.cost.byAccountSize[0]?.attemptsSampleLevel).toBe(
            SampleLevel.Low,
        );
        expect(withThresholds.cost.perPlan[0]?.fundedSampleLevel).toBe(
            SampleLevel.Adequate,
        );
        expect(withThresholds.replacement.rows[0]?.attemptsSampleLevel).toBe(
            SampleLevel.Low,
        );
        expect(withThresholds.firmReturns.rows[0]?.attemptsSampleLevel).toBe(
            SampleLevel.Low,
        );
        expect(withThresholds.firmReturns.rows[0]?.fundedSampleLevel).toBe(
            SampleLevel.Adequate,
        );
        expect(cards.replacement.rows).toEqual([
            {
                attempts: '2',
                attemptsPerFunded: '2.00',
                attemptsSampleLevel: null,
                key: EVAL_PLAN.serial,
                lag: 'n/a',
                plan,
                rebuyLag: '0 sessions (assumed: no replacement measured yet)',
                unmeasured: '0',
            },
        ]);
    });

    it('pins the funnel, diversification, statement and timeline of the fixture', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.funnel.rows).toEqual([
            {
                fees: cents(35_000),
                firm: EVAL_PLAN.firm.displayName,
                firstPayout: '1',
                funded: '1',
                key: EVAL_FIRM_KEY,
                movedLive: '0',
                net: cents(55_000),
                netPayouts: cents(90_000),
                passed: '1',
                payoutRate: '100.0% (95% CI 20.7% to 100.0%, n = 1)',
                purchased: '2',
            },
        ]);
        expect(cards.funnel.unresolvedNote).toBeNull();
        expect(cards.funnel.biggestWeakness).toBe(
            'The biggest-weakness ranking is pending the engine cards: no modeled run is compared against these realized numbers yet.',
        );
        expect(
            cards.funnel.disclosures.some((text) =>
                text.includes(
                    "an approximation of the simulator's default funded horizon",
                ),
            ),
        ).toBe(true);
        expect(cards.diversification).toEqual({
            funding: [
                {
                    amount: cents(EVAL_PLAN.plan.id.accountSize * 100),
                    firm: EVAL_PLAN.firm.displayName,
                    key: EVAL_FIRM_KEY,
                    share: '100.0%',
                },
            ],
            payouts: [
                {
                    amount: cents(90_000),
                    firm: EVAL_PLAN.firm.displayName,
                    key: EVAL_FIRM_KEY,
                    share: '100.0%',
                },
            ],
        });
        expect(cards.statement.months).toEqual([
            {
                cumulativeNet: cents(-23_000),
                isPartial: false,
                key: '2026-06',
                meetsMultipleTarget: null,
                meetsPayoutTarget: null,
                month: '2026-06',
                multiple: '0.00x',
                net: cents(-23_000),
                payoutCount: '0',
                payoutGrowth: 'n/a',
                payouts: cents(0),
                spend: cents(23_000),
                trailingThreeMonthMultiple: '0.00x',
            },
            {
                cumulativeNet: cents(-35_000),
                isPartial: false,
                key: '2026-07',
                meetsMultipleTarget: null,
                meetsPayoutTarget: null,
                month: '2026-07',
                multiple: '0.00x',
                net: cents(-12_000),
                payoutCount: '0',
                payoutGrowth: 'n/a',
                payouts: cents(0),
                spend: cents(12_000),
                trailingThreeMonthMultiple: '0.00x',
            },
            {
                cumulativeNet: cents(55_000),
                isPartial: false,
                key: '2026-08',
                meetsMultipleTarget: null,
                meetsPayoutTarget: null,
                month: '2026-08',
                multiple: 'n/a',
                net: cents(90_000),
                payoutCount: '1',
                payoutGrowth: 'n/a',
                payouts: cents(90_000),
                spend: cents(0),
                trailingThreeMonthMultiple: '2.57x',
            },
            {
                cumulativeNet: cents(55_000),
                isPartial: true,
                key: '2026-09',
                meetsMultipleTarget: null,
                meetsPayoutTarget: null,
                month: '2026-09',
                multiple: 'n/a',
                net: cents(0),
                payoutCount: '0',
                payoutGrowth: '-100.0%',
                payouts: cents(0),
                spend: cents(0),
                trailingThreeMonthMultiple: '7.50x',
            },
        ]);
        expect(cards.statement.caveat).not.toContain('By purchase cohort');
        expect(cards.statement.caveat).toBe(
            'calendar months mix purchase cohorts',
        );
        expect(
            cards.timeline.entries.map(
                ({ account: label, amount, description, on }) => ({
                    amount,
                    description,
                    label,
                    on,
                }),
            ),
        ).toEqual([
            {
                amount: `+${cents(90_000)}`,
                description: 'Payout paid',
                label: 'Alpha',
                on: '2026-08-15',
            },
            {
                amount: `+${cents(3000)}`,
                description: 'Refund',
                label: 'Bravo',
                on: '2026-07-15',
            },
            {
                amount: null,
                description: 'Busted',
                label: 'Bravo',
                on: '2026-07-10',
            },
            {
                amount: cents(-15_000),
                description: 'Evaluation purchase',
                label: 'Bravo',
                on: '2026-07-01',
            },
            {
                amount: null,
                description: 'Purchased',
                label: 'Bravo',
                on: '2026-07-01',
            },
            {
                amount: cents(-8000),
                description: 'Activation fee',
                label: 'Alpha',
                on: '2026-06-20',
            },
            {
                amount: null,
                description: 'Eval passed',
                label: 'Alpha',
                on: '2026-06-20',
            },
            {
                amount: cents(-15_000),
                description: 'Evaluation purchase',
                label: 'Alpha',
                on: '2026-06-01',
            },
            {
                amount: null,
                description: 'Purchased',
                label: 'Alpha',
                on: '2026-06-01',
            },
        ]);
        expect(cards.timeline.hiddenEntries).toBe(0);
    });

    it('lists pending acquisition spend and pending eval accounts beside the realized cost', () => {
        const open = account(EVAL_PLAN, { purchasedOn: '2026-09-01' });
        const cards = cardsOf({
            accounts: [overviewAccount(open)],
            events: [purchased(open)],
            fees: [fee(open, FeeKind.EvalPurchase, 15_000, '2026-09-01')],
        });
        expect(cards.cost.perPlan[0]).toMatchObject({
            acquisitionSpend: cents(0),
            costPerFunded: 'n/a',
            fundedAccounts: '0',
            pendingEvalAccounts: '1',
            pendingSpend: cents(15_000),
        });
    });

    it('shows cash received as positive and cash spent as negative, and no cash for an unpaid payout', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-02',
            label: 'Owner',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-09-02'),
            ],
            fees: [
                fee(owner, FeeKind.EvalPurchase, 15_000, '2026-09-01'),
                fee(owner, FeeKind.Refund, 5000, '2026-09-03'),
            ],
            payouts: [
                payout(owner, 40_000, { paidOn: '2026-09-10' }),
                payout(owner, 60_000, {
                    paidOn: null,
                    requestedOn: '2026-09-12',
                    status: PayoutStatus.Requested,
                }),
                payout(owner, 70_000, {
                    paidOn: null,
                    requestedOn: '2026-09-14',
                    status: PayoutStatus.Denied,
                }),
            ],
        });
        const eventLabels = new Set(
            Object.values(AccountEventKind).map((kind) =>
                accountEventKindLabel(kind),
            ),
        );
        const cash = cards.timeline.entries
            .filter((row) => !eventLabels.has(row.description))
            .map(({ amount, description }) => ({ amount, description }));
        expect(cash).toEqual([
            {
                amount: null,
                description: `Payout denied (${cents(70_000)} gross, no cash received)`,
            },
            {
                amount: null,
                description: `Payout requested (${cents(60_000)} gross, no cash received)`,
            },
            {
                amount: `+${cents(40_000)}`,
                description: 'Payout paid (no net amount, gross counted)',
            },
            { amount: `+${cents(5000)}`, description: 'Refund' },
            {
                amount: cents(-15_000),
                description: 'Evaluation purchase',
            },
        ]);
    });

    it('shows the newest timeline entries first and counts the ones left out', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const fees = Array.from(
            { length: OVERVIEW_TIMELINE_LIMIT + 5 },
            (_, index) =>
                fee(
                    owner,
                    FeeKind.Subscription,
                    1000,
                    `2026-0${String(1 + Math.floor(index / 28))}-${String((index % 28) + 1).padStart(2, '0')}`,
                ),
        );
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [purchased(owner)],
            fees,
        });
        expect(cards.timeline.entries).toHaveLength(OVERVIEW_TIMELINE_LIMIT);
        expect(cards.timeline.hiddenEntries).toBe(6);
        expect(cards.timeline.entries[0]?.on).toBe('2026-02-27');
    });

    it('shows the payout multiple, accounts and dates per firm, with a noise verdict', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.firmReturns.rows).toEqual([
            {
                accounts: '2',
                accountsWithPayout: '1',
                attempts: '2',
                attemptsSampleLevel: null,
                firm: EVAL_PLAN.firm.displayName,
                firstPayoutOn: '2026-08-15',
                fundedAccounts: '1',
                fundedSampleLevel: null,
                key: EVAL_FIRM_KEY,
                lastPayoutOn: '2026-08-15',
                multiple: '2.57x',
                net: cents(55_000),
                payouts: cents(90_000),
                spend: cents(35_000),
                verdict: 'Unknown (not enough data)',
            },
        ]);
    });

    it('shows repeatability over complete months and per funded slot', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.repeatability.overall).toMatchObject({
            count: '3',
            shareAtOrAboveTarget: null,
            sharePositive: '33.3%',
        });
        expect(cards.repeatability.perSlot).not.toBeNull();
        expect(cards.repeatability.perSlotTargetNote).toBeNull();
    });

    it('shows a repeatability share at or above target once the rulebook sets one', () => {
        const load = inputs(pinnedRows(), {
            [PortfolioSource.Rulebook]: {
                data: {
                    ...DEFAULT_RULEBOOK,
                    review: {
                        ...DEFAULT_RULEBOOK.review,
                        monthlyPayoutTargetCents: 100_000,
                    },
                },
                error: null,
            },
        });
        const cards = readyCards(buildOverview(load).ledger);
        expect(cards.repeatability.overall?.shareAtOrAboveTarget).toBe('0.0%');
    });

    it('divides the portfolio target by the slots active that month, once more than one funded slot overlaps', () => {
        const load = inputs(multiSlotRows(), {
            [PortfolioSource.Rulebook]: {
                data: {
                    ...DEFAULT_RULEBOOK,
                    review: {
                        ...DEFAULT_RULEBOOK.review,
                        monthlyPayoutTargetCents: 100_000,
                    },
                },
                error: null,
            },
        });
        const cards = readyCards(buildOverview(load).ledger);
        expect(cards.repeatability.perSlot?.shareAtOrAboveTarget).toBe('0.0%');
        expect(cards.repeatability.perSlotTargetNote).toBe(
            'The per-slot target divides the portfolio-wide monthly target evenly across the funded slots active that month.',
        );
    });

    it('shows a payout month with no fees as meeting its multiple target once the rulebook sets one', () => {
        const load = inputs(pinnedRows(), {
            [PortfolioSource.Rulebook]: {
                data: {
                    ...DEFAULT_RULEBOOK,
                    review: {
                        ...DEFAULT_RULEBOOK.review,
                        targetMonthlyMultiple: 2,
                    },
                },
                error: null,
            },
        });
        const cards = readyCards(buildOverview(load).ledger);
        const august = cards.statement.months.find(
            (month) => month.key === '2026-08',
        );
        expect(august).toMatchObject({
            meetsMultipleTarget: true,
            multiple: 'n/a',
        });
    });

    it('shows cost per attempt by account size and firm, and discounts captured per firm', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.cost.byAccountSize).toEqual([
            {
                accountSize: String(EVAL_PLAN.plan.id.accountSize),
                attempts: '2',
                attemptsSampleLevel: null,
                costPerAttempt: cents(17_500),
                key: String(EVAL_PLAN.plan.id.accountSize),
                spend: cents(35_000),
            },
        ]);
        expect(cards.cost.byFirmAttemptCost).toEqual([
            {
                attempts: '2',
                attemptsSampleLevel: null,
                costPerAttempt: cents(17_500),
                firm: EVAL_PLAN.firm.displayName,
                key: EVAL_FIRM_KEY,
                retryFeeAttempts: '0',
            },
        ]);
        expect(cards.cost.discountsByFirm).toEqual([
            {
                discount: cents(89_000),
                feesChecked: '4',
                firm: EVAL_PLAN.firm.displayName,
                key: EVAL_FIRM_KEY,
            },
        ]);
    });

    it('measures a firm mean attempts per month over that firm own active window, not the whole portfolio range', () => {
        const alpha = account(EVAL_PLAN, {
            label: 'Alpha',
            purchasedOn: '2026-06-01',
        });
        const bravoOne = account(OTHER_FIRM_EVAL_PLAN, {
            label: 'Bravo one',
            purchasedOn: '2026-07-01',
        });
        const bravoTwo = account(OTHER_FIRM_EVAL_PLAN, {
            label: 'Bravo two',
            purchasedOn: '2026-09-01',
        });
        const cards = cardsOf({
            accounts: [alpha, bravoOne, bravoTwo].map(overviewAccount),
            events: [
                purchased(alpha),
                purchased(bravoOne),
                purchased(bravoTwo),
            ],
        });
        expect(
            cards.attemptThroughput.months.map((month) => month.month),
        ).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
        const alphaRow = cards.attemptThroughput.perFirm.find(
            (row) => row.key === EVAL_FIRM_KEY,
        );
        const bravoRow = cards.attemptThroughput.perFirm.find(
            (row) => row.key === OTHER_FIRM_KEY,
        );
        expect(alphaRow?.meanPerMonth).toBe('1.00');
        expect(bravoRow?.meanPerMonth).toBe('0.67');
    });
});

describe('buildOverview bankroll card (F-V3)', () => {
    it('computes available bankroll, deposits, withdrawals and money-weighted return from transfers and cash flow', () => {
        const alpha = account(EVAL_PLAN, {
            label: 'Alpha',
            purchasedOn: '2026-06-01',
        });
        const cards = cardsOf({
            accounts: [alpha].map(overviewAccount),
            events: [purchased(alpha)],
            fees: [fee(alpha, FeeKind.EvalPurchase, 15_000, '2026-06-01')],
            transfers: [
                transfer(
                    BankrollTransferKind.Deposit,
                    100_000,
                    '2026-05-01',
                ),
                transfer(
                    BankrollTransferKind.Withdrawal,
                    10_000,
                    '2026-08-01',
                ),
            ],
        });
        expect(cards.bankroll.depositsCents).toBe(cents(100_000));
        expect(cards.bankroll.withdrawalsCents).toBe(cents(10_000));
        expect(cards.bankroll.grownFromCents).toBe(cents(100_000));
        expect(cards.bankroll.availableCents).toBe(cents(75_000));
    });

    it('hides the scale-at-multiple line with NoEndedAccounts when no account has ended', () => {
        const alpha = account(EVAL_PLAN, {
            label: 'Alpha',
            purchasedOn: '2026-06-01',
        });
        const cards = cardsOf({
            accounts: [alpha].map(overviewAccount),
            events: [purchased(alpha)],
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: { ...DEFAULT_RULEBOOK.bankroll, dailyAccountCapacity: 3 },
            },
        });
        expect(cards.bankroll.scale).toEqual({
            kind: 'unavailable',
            reason: 'No account has ended yet, so there is no measured multiple to scale.',
        });
    });

    it('hides the scale-at-multiple line with CapacityNotSet when an account has ended but no capacity is set', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.bankroll.scale).toEqual({
            kind: 'unavailable',
            reason:
                'Set your daily account capacity in the rulebook to see a candidate monthly budget.',
        });
    });

    it('shows the scale at the measured multiple once an account has ended and capacity is set', () => {
        const rows = pinnedRows();
        const cards = cardsOf({
            ...rows,
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: { ...DEFAULT_RULEBOOK.bankroll, dailyAccountCapacity: 3 },
            },
        });
        const scale = cards.bankroll.scale;
        if (scale.kind !== 'available') {
            throw new Error('expected the scale-at-multiple line to be available');
        }
        expect(scale.n).toBe(1);
        expect(scale.sampleLevel).toBeNull();
    });
});

describe('buildOverview payout sizes, funded payouts and attempt economics cards (F-V8, F-V9)', () => {
    it('shows payout size stats, the mean with n, and breakdowns by account size, firm and stage', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.payoutSizes.count).toBe(1);
        expect(cards.payoutSizes.mean).toBe(`${cents(90_000)}, n = 1`);
        expect(cards.payoutSizes.median).toBe(cents(90_000));
        expect(cards.payoutSizes.p10).toBe(cents(90_000));
        expect(cards.payoutSizes.p90).toBe(cents(90_000));
        expect(cards.payoutSizes.disclosures).toContain(
            'The median, p10 and p90 are sample quantiles over 1 payout; unlike the mean above, they carry no confidence interval.',
        );
        expect(cards.payoutSizes.grossOnlyPayouts).toBe(0);
        expect(cards.payoutSizes.byAccountSize).toEqual([
            {
                accountSize: String(EVAL_PLAN.plan.id.accountSize),
                count: '1',
                key: String(EVAL_PLAN.plan.id.accountSize),
                mean: `${cents(90_000)}, n = 1`,
            },
        ]);
        expect(cards.payoutSizes.byFirm).toEqual([
            {
                count: '1',
                firm: EVAL_PLAN.firm.displayName,
                key: EVAL_FIRM_KEY,
                mean: `${cents(90_000)}, n = 1`,
            },
        ]);
        expect(cards.payoutSizes.byStage).toHaveLength(1);
        expect(cards.payoutSizes.byStage[0]).toMatchObject({
            count: '1',
            mean: `${cents(90_000)}, n = 1`,
        });
        expect(cards.payoutSizes.histogram.length).toBeGreaterThan(0);
        const totalHistogramCount = cards.payoutSizes.histogram.reduce(
            (sum, bin) => sum + bin.count,
            0,
        );
        expect(totalHistogramCount).toBe(1);
    });

    it('flags a payout counted at gross in a disclosure', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-01',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-09-01'),
            ],
            payouts: [payout(owner, 50_000, { paidOn: '2026-09-10' })],
        });
        expect(cards.payoutSizes.grossOnlyPayouts).toBe(1);
        expect(cards.payoutSizes.disclosures).toEqual([
            'The median, p10 and p90 are sample quantiles over 1 payout; unlike the mean above, they carry no confidence interval.',
            '1 payout has no net amount, so its gross is counted.',
            'Low-balance monitoring against the retained cushion is not wired to a stored account balance yet, so no payout is ever flagged here; a clean result is not verified.',
        ]);
    });

    it('discloses that low-balance monitoring approximates the balance at payout from the latest snapshot once a snapshot is stored and the rulebook has loaded', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-01',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-09-01'),
            ],
            payouts: [
                payout(owner, 50_000, {
                    netCents: 50_000,
                    paidOn: '2026-09-10',
                }),
            ],
            snapshots: [
                snapshotRow(owner, {
                    balanceCents: usdCents(500_000),
                    dashboardFloorCents: usdCents(0),
                }),
            ],
        });
        expect(cards.payoutSizes.lowBalanceCount).toBe(0);
        expect(
            cards.payoutSizes.disclosures.some((text) =>
                text.includes('latest recorded snapshot balance'),
            ),
        ).toBe(true);
    });

    it('falls back to the not-wired disclosure while the rulebook has not loaded', () => {
        const overviewInputs = inputs(pinnedRows(), {
            [PortfolioSource.Rulebook]: { data: undefined, error: null },
        });
        const cards = readyCards(buildOverview(overviewInputs).ledger);
        expect(
            cards.payoutSizes.disclosures.some((text) =>
                text.includes('is not wired to a stored account balance yet'),
            ),
        ).toBe(true);
    });

    it('flags a payout low-balance using the latest snapshot balance and the rulebook retained cushion', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-01',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-09-01'),
            ],
            payouts: [
                payout(owner, 50_000, {
                    netCents: 50_000,
                    paidOn: '2026-09-10',
                }),
            ],
            snapshots: [
                snapshotRow(owner, {
                    balanceCents: usdCents(150_000),
                    dashboardFloorCents: usdCents(50_000),
                }),
            ],
        });
        expect(cards.payoutSizes.lowBalanceCount).toBe(1);
        expect(cards.payoutSizes.disclosures).toContain(
            '1 payout left the account close to its retained cushion at the time it was paid.',
        );
    });

    it('uses the latest snapshot on or before the payout date, not a later snapshot recorded after it', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-01',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-09-01'),
            ],
            payouts: [
                payout(owner, 50_000, {
                    netCents: 50_000,
                    paidOn: '2026-09-10',
                }),
            ],
            snapshots: [
                snapshotRow(owner, {
                    asOf: '2026-09-05',
                    balanceCents: usdCents(500_000),
                    dashboardFloorCents: usdCents(0),
                    id: 'snapshot-before-payout',
                }),
                snapshotRow(owner, {
                    asOf: '2026-09-20',
                    balanceCents: usdCents(10_000),
                    dashboardFloorCents: usdCents(0),
                    id: 'snapshot-after-payout',
                }),
            ],
        });
        expect(cards.payoutSizes.lowBalanceCount).toBe(0);
    });

    it('never flags low balance when no snapshot is stored for the account', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-01',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-09-01'),
            ],
            payouts: [
                payout(owner, 50_000, {
                    netCents: 50_000,
                    paidOn: '2026-09-10',
                }),
            ],
        });
        expect(cards.payoutSizes.lowBalanceCount).toBe(0);
        expect(
            cards.payoutSizes.disclosures.some((text) =>
                text.includes('is not wired to a stored account balance yet'),
            ),
        ).toBe(true);
        expect(
            cards.payoutSizes.disclosures.some((text) =>
                text.includes('latest recorded snapshot balance'),
            ),
        ).toBe(false);
    });

    it('never flags low balance when the stored snapshot has no dashboard floor', () => {
        const owner = account(EVAL_PLAN, {
            fundedOn: '2026-09-01',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, '2026-09-01'),
            ],
            payouts: [
                payout(owner, 50_000, {
                    netCents: 50_000,
                    paidOn: '2026-09-10',
                }),
            ],
            snapshots: [
                snapshotRow(owner, {
                    balanceCents: usdCents(1000),
                    dashboardFloorCents: null,
                }),
            ],
        });
        expect(cards.payoutSizes.lowBalanceCount).toBe(0);
    });

    it('gives the funded payout-count distribution per plan over the horizon-matched cohort, with the modeled distribution disclosed as pending', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        const row = cards.fundedPayouts.rows.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(cards.fundedPayouts.horizonDays).toBe(365);
        expect(row?.openAccounts).toBe('0');
        expect(row?.counts[0]).toBe('0');
        expect(row?.counts[1]).toBe('1');
        expect(
            cards.fundedPayouts.disclosures.some((text) =>
                text.includes('pending the engine cards'),
            ),
        ).toBe(true);
    });

    it('gives realized attempt economics per plan: attempt cost, attempts, rates, payouts per paid funded and the breakeven margin', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        const row = cards.attemptEconomics.rows.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(cards.attemptEconomics.horizonDays).toBe(365);
        expect(row?.attemptCost).toBe(cents(17_500));
        expect(row?.attempts).toBe('2');
        expect(row?.passRate).toBe('50.0% (95% CI 9.5% to 90.5%, n = 2)');
        expect(row?.payoutRate).toBe('100.0% (95% CI 20.7% to 100.0%, n = 1)');
        expect(row?.payoutsPerPaidFunded).toBe('1.00');
        expect(row?.averagePayout).toBe(`${cents(90_000)}, n = 1`);
        expect(row?.realizedEvPerAttempt).toBe(cents(27_500));
        expect(row?.marginAboveBreakeven).not.toBe(NOT_APPLICABLE);
        expect(row?.breakevenPassRate).not.toBe(NOT_APPLICABLE);
        expect(row?.fundedValue).not.toBe(NOT_APPLICABLE);
        expect(
            cards.attemptEconomics.disclosures.some((text) =>
                text.includes('pass-rate interval alone'),
            ),
        ).toBe(true);
    });

    it('leaves attempt economics figures as n/a for a plan with no ended attempt', () => {
        const open = account(EVAL_PLAN, { purchasedOn: '2026-09-01' });
        const cards = cardsOf({
            accounts: [overviewAccount(open)],
            events: [purchased(open)],
        });
        const row = cards.attemptEconomics.rows.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(row?.attempts).toBe('0');
        expect(row?.attemptCost).toBe(NOT_APPLICABLE);
        expect(row?.marginAboveBreakeven).toBe(NOT_APPLICABLE);
        expect(row?.realizedEvPerAttempt).toBe(NOT_APPLICABLE);
    });
});

describe('buildOverview notices', () => {
    it('always discloses the bounded event window', () => {
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.notices).toEqual([
            {
                kind: OverviewNoticeKind.EventWindow,
                message:
                    'Account events are loaded for the last 3 years only; older events are not in the funnel, outcomes, slot months or timeline.',
            },
        ]);
    });

    it('warns about timeline mismatches, rejected events, unresolved plans, read issues, undated payouts, unmeasured slots and foreign rows', () => {
        const mismatch = account(EVAL_PLAN, {
            label: 'Mismatch',
            status: AccountStatus.Busted,
        });
        const rejected = account(EVAL_PLAN, {
            label: 'Rejected',
            readIssues: [{ kind: AccountReadIssueKind.CorruptPersonalRules }],
        });
        const unknown = account(EVAL_PLAN, {
            label: 'Unknown',
            planSerial: 'no-such-plan',
        });
        const unmeasured = account(EVAL_PLAN, {
            fundedOn: null,
            label: 'Unmeasured',
            stage: AccountStage.Funded,
        });
        const cards = cardsOf({
            accounts: [mismatch, rejected, unknown, unmeasured].map(
                overviewAccount,
            ),
            events: [
                purchased(mismatch),
                purchased(rejected),
                event(rejected, AccountEventKind.MovedLive, '2026-09-02'),
                event(
                    account(EVAL_PLAN, { userId: OTHER_USER_ID }),
                    AccountEventKind.Purchased,
                    '2026-09-01',
                ),
            ],
            payouts: [
                payout(unmeasured, 50_000, {
                    paidOn: null,
                    requestedOn: '2026-09-05',
                }),
                payout(mismatch, 20_000, { paidOn: '2026-09-10' }),
            ],
        });
        const byKind = new Map(
            cards.notices.map((notice) => [notice.kind, notice.message]),
        );
        expect(byKind.get(OverviewNoticeKind.TimelineMismatch)).toBe(
            '1 account has recorded events that do not replay to its stored stage and status (Mismatch); its funnel, outcomes and slot months follow the recorded events.',
        );
        expect(byKind.get(OverviewNoticeKind.RejectedEvents)).toBe(
            '1 recorded event was rejected by the account lifecycle and is left out of the funnel, outcomes and slot months.',
        );
        expect(byKind.get(OverviewNoticeKind.UnresolvedAccounts)).toBe(
            '1 account has a plan that is no longer modeled (Unknown); its fees and payouts count in the cash totals but not in realized net per slot or the per-plan cards.',
        );
        expect(byKind.get(OverviewNoticeKind.ReadIssues)).toBe(
            '1 account has saved caps and limits that cannot be read (Rejected), so it is read-only and gets no sizing advice until the stored data is repaired.',
        );
        expect(byKind.get(OverviewNoticeKind.UndatedPaidPayouts)).toBe(
            '1 paid payout has no paid date; it counts in the all-time totals but in no month.',
        );
        expect(byKind.get(OverviewNoticeKind.UnmeasuredSlots)).toContain(
            '1 funded account has no known funded date',
        );
        expect(byKind.get(OverviewNoticeKind.UnmatchedRows)).toBe(
            '1 row belongs to no listed account and is left out.',
        );
    });
});

describe('buildOverview with ledger-only accounts', () => {
    it('says in a notice which accounts are ledger only and which figures leave them out', () => {
        const notice = ledgerOnlyCards().notices.find(
            (candidate) =>
                candidate.kind === OverviewNoticeKind.LedgerOnlyAccounts,
        );
        expect(notice?.message).toBe(
            '1 account is ledger only (Big); the engine does not model its plan, so its fees and payouts count in the cash totals, the firm tables and the funnel, but not in realized net per slot or the per-plan cards (cost per plan, outcomes, replacement and plan caps).',
        );
    });

    it('says on the cost, outcomes, cap usage and funnel cards that ledger-only accounts are not in their plan rows', () => {
        const cards = ledgerOnlyCards();
        expect(cards.cost.disclosures).toContain(
            `${cents(30_000)} spent on 1 ledger-only account is in the firm table but in no plan row.`,
        );
        expect(cards.outcomes.disclosures).toContain(
            '1 ledger-only account is not counted here, since the engine does not model its plan.',
        );
        expect(cards.capUsage.unresolvedNote).toBe(
            "1 ledger-only account is not counted here; check it against the firm's own account cap yourself.",
        );
        expect(cards.funnel.unresolvedNote).toBe(
            '1 ledger-only account counts from its stored stage and paid payouts; whether it passed an evaluation is not known.',
        );
    });

    it('names a firm of your own in the firm tables instead of an unlisted firm', () => {
        const hola = { id: 'firm-hola', name: 'Hola Prime' };
        const seat = account(EVAL_PLAN, {
            accountSize: 100_000,
            externalFirmId: hola.id,
            firmId: null,
            label: 'Seat',
            planLabel: 'Hola 100K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const paid = payout(seat, 50_000, {
            netCents: 40_000,
            paidOn: TODAY,
            requestedOn: TODAY,
        });
        const purchase = fee(seat, FeeKind.EvalPurchase, 20_000, TODAY);
        const rows = inputs({
            accounts: [overviewAccount(seat)],
            fees: [purchase],
            payouts: [paid],
        });
        const cards = readyCards(
            buildOverview({ ...rows, externalFirms: [hola] }).ledger,
        );
        const firmNames = [
            ...cards.cost.byFirm,
            ...cards.funnel.rows,
            ...cards.diversification.funding,
            ...cards.diversification.payouts,
        ].map((row) => row.firm);
        expect(firmNames).toHaveLength(4);
        expect(new Set(firmNames)).toEqual(new Set([hola.name]));
    });

    it('counts the ledger-only accounts left out of realized net per slot beside that figure', () => {
        const perSlot = ledgerOnlyCards().kpis.find(
            (kpi) => kpi.kind === OverviewKpiKind.RealizedNetPerSlot,
        );
        expect(perSlot?.note).toBe('1 ledger-only account not counted');
        const modeledOnly = readyCards(
            buildOverview(pinnedFixture()).ledger,
        ).kpis.find((kpi) => kpi.kind === OverviewKpiKind.RealizedNetPerSlot);
        expect(modeledOnly?.note).toBeNull();
    });
});

describe('buildOverview alerts', () => {
    it('runs the full default evaluator, sorted and labeled, and lists invalid stored dates', () => {
        const unknown = overviewAccount(
            account(EVAL_PLAN, {
                label: 'Unknown plan',
                planSerial: 'no-such-plan',
            }),
        );
        const badDate = overviewAccount(
            account(EVAL_PLAN, {
                label: 'Bad date',
                purchasedOn: '2026-02-30',
            }),
        );
        const rows = rowsOf({ accounts: [unknown, badDate] });
        const model = buildOverview(inputs(rows));
        const expected = new AlertEvaluator(DEFAULT_ALERT_RULES).evaluate(
            createAlertContext({
                accounts: rows.accounts,
                accountStates: [],
                copyGroups: rows.copyGroups,
                payouts: rows.payouts,
                rulebook: rows.rulebook,
                snapshots: rows.snapshots,
                today: TODAY,
            }),
        );
        expect(expected.length).toBeGreaterThan(1);
        const alerts = readyAlerts(model.alerts);
        expect(alerts.map((alert) => alert.kindLabel)).toEqual(
            expected.map((alert) => alertKindLabel(alert.kind)),
        );
        expect(alerts.map((alert) => alert.message)).toEqual(
            expected.map((alert) => alert.message),
        );
        expect(
            alerts.some(
                (alert) =>
                    alert.kindLabel ===
                        alertKindLabel(AlertKind.InvalidStoredDate) &&
                    alert.subjectLabel === 'Bad date',
            ),
        ).toBe(true);
        expect(new Set(alerts.map((alert) => alert.key)).size).toBe(
            alerts.length,
        );
    });

    it('fails the ledger cards loudly on a stored date that is not a calendar date, and keeps the alerts', () => {
        const badDate = overviewAccount(
            account(EVAL_PLAN, {
                label: 'Bad date',
                purchasedOn: '2026-02-30',
            }),
        );
        const model = buildOverview(inputs({ accounts: [badDate] }));
        expect(model.ledger).toEqual({
            kind: OverviewSectionStatus.Failed,
            message:
                'The ledger cards could not be computed: Not a calendar date: "2026-02-30". Fix the stored date listed in the alerts.',
        });
        expect(readyAlerts(model.alerts).length).toBeGreaterThan(0);
    });

    it('counts the same alerts through portfolioAlerts', () => {
        const rows = pinnedRows();
        const model = buildOverview(inputs(rows));
        expect(
            portfolioAlerts({ ...rows, accountStates: [], today: TODAY })
                .length,
        ).toBe(readyAlerts(model.alerts).length);
    });

    it('labels every alert disclosure in words', () => {
        const owner = overviewAccount(
            account(EVAL_PLAN, { label: 'Stale', purchasedOn: '2026-01-05' }),
        );
        const model = buildOverview(inputs({ accounts: [owner] }));
        for (const alert of readyAlerts(model.alerts)) {
            for (const disclosure of alert.disclosures) {
                expect(disclosure).toMatch(/^[A-Z][^-]+\.$/);
            }
        }
    });

    it('keeps the alerts that do not need account history but discloses that the rest are still pending', () => {
        const rows = pinnedRows();
        const eventsStillLoading = inputs(rows, {
            [PortfolioSource.Events]: { data: undefined, error: null },
        });
        expect(eventsStillLoading.load.alerts.status).toBe(
            OverviewSectionStatus.Ready,
        );
        expect(eventsStillLoading.load.ledger.status).toBe(
            OverviewSectionStatus.Pending,
        );
        const model = buildOverview(eventsStillLoading);
        expect(model.alerts.kind).toBe(OverviewSectionStatus.Ready);
        expect(readyAlerts(model.alerts).length).toBeGreaterThan(0);
        expect(
            model.alerts.kind === OverviewSectionStatus.Ready
                ? model.alerts.accountStatesCaveat
                : null,
        ).toBe(
            'Alerts that depend on account history are not yet available because your ledger is still loading.',
        );
    });

    it('keeps the alerts that do not need account history but discloses that the rest could not be checked when events fail', () => {
        const rows = pinnedRows();
        const eventsFailed = inputs(rows, {
            [PortfolioSource.Events]: {
                data: undefined,
                error: rejectedError('boom', {
                    limit: 5000,
                    reason: PropLimitRejection.ListTooLarge,
                    record: PropRecord.Event,
                }),
            },
        });
        expect(eventsFailed.load.alerts.status).toBe(
            OverviewSectionStatus.Ready,
        );
        expect(eventsFailed.load.ledger.status).toBe(
            OverviewSectionStatus.Failed,
        );
        const model = buildOverview(eventsFailed);
        expect(model.alerts.kind).toBe(OverviewSectionStatus.Ready);
        expect(readyAlerts(model.alerts).length).toBeGreaterThan(0);
        expect(
            model.alerts.kind === OverviewSectionStatus.Ready
                ? model.alerts.accountStatesCaveat
                : null,
        ).toBe(
            'Alerts that depend on account history could not be checked because your account events could not be loaded.',
        );
    });
});

describe('alertsFor', () => {
    it('keeps every overview alert, in order, for a predicate that keeps every alert', () => {
        const rows = alertRichRows();
        const model = buildOverview(inputs(rows));
        const load = portfolioLoad(answered(rows));
        expect(alertsFor(load.alerts, TODAY, () => true)).toEqual(model.alerts);
    });

    it('maps only the alerts the predicate keeps, with the overview labels', () => {
        const rows = alertRichRows();
        const load = portfolioLoad(answered(rows));
        const all = readyAlerts(buildOverview(inputs(rows)).alerts);
        const accountOnly = readyAlerts(
            alertsFor(
                load.alerts,
                TODAY,
                (alert) => alert.subject.kind === AlertSubjectKind.Account,
            ),
        );
        const expected = portfolioAlerts({
            ...rows,
            accountStates: [],
            today: TODAY,
        }).flatMap((alert, index) =>
            alert.subject.kind === AlertSubjectKind.Account ? [all[index]] : [],
        );
        expect(accountOnly.length).toBeGreaterThan(0);
        expect(accountOnly.length).toBeLessThan(all.length);
        expect(accountOnly).toEqual(expected);
    });

    it('passes a failed or pending alert section through unchanged', () => {
        const failed = portfolioLoad(
            queries({ [PortfolioSource.Rulebook]: unreadableRulebook() }),
        ).alerts;
        const pending = portfolioLoad(
            queries({
                [PortfolioSource.Snapshots]: { data: undefined, error: null },
            }),
        ).alerts;
        expect(alertsFor(failed, TODAY, () => true)).toEqual({
            kind: OverviewSectionStatus.Failed,
            message:
                'Alerts could not be checked because your rulebook could not be loaded.',
        });
        expect(alertsFor(pending, TODAY, () => true)).toEqual({
            kind: OverviewSectionStatus.Pending,
        });
    });
});

describe('accountStatesFromLoad', () => {
    it('feeds real reconstructed account states into the overview alerts, firing a near-floor alert', () => {
        const entry = mffProEntry();
        const documentedRisk =
            DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR;
        const drawdownAmount = entry.plan.fundedDrawdown.amount;
        const peak = entry.plan.accountSize + 10_000;
        const threshold = peak - drawdownAmount;
        const nearFloorBalance = threshold + documentedRisk * 0.5;
        const ledgerAccount = account(entry, {
            fundedOn: '2026-08-01',
            purchasedOn: '2026-07-01',
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
        });
        const overviewAccountRow = {
            ...ledgerAccount,
            copyGroupId: null,
            dashboardConvention: DashboardBalanceConvention.Nominal,
            firstFundedTradeOn: '2026-08-01',
            liveStartBalanceCents: null,
        } as unknown as OverviewAccountRow;
        const snapshot = {
            accountId: ledgerAccount.id,
            asOf: TODAY,
            balanceAtLastPayoutCents: null,
            balanceCents: usdCents(Math.round(nearFloorBalance * 100)),
            createdAt: new Date('2026-09-25T00:00:00Z'),
            cumulativePayoutCents: null,
            cycleBestDayProfitCents: null,
            dashboardFloorCents: null,
            evalBestDayProfitCents: null,
            floorAtLastPayoutCents: null,
            highestEodBalanceCents: usdCents(Math.round(peak * 100)),
            highestIntradayBalanceCents: null,
            id: `snapshot-${ledgerAccount.id}`,
            lastPayoutOn: null,
            lastTradedOn: null,
            payoutsTaken: null,
            qualifyingDaysSinceLastPayout: null,
            tradingDays: 5,
            userId: USER_ID,
        } as unknown as OverviewSnapshotRow;
        const rows: Partial<PortfolioRows> = {
            accounts: [overviewAccountRow],
            snapshots: [snapshot],
        };
        const nearFloorLabel = alertKindLabel(AlertKind.NearFloor);

        const model = buildOverview(inputs(rows));
        const withStates = readyAlerts(model.alerts);
        expect(
            withStates.some((alert) => alert.kindLabel === nearFloorLabel),
        ).toBe(true);

        const load = portfolioLoad(answered(rowsOf(rows)));
        const withoutStates = readyAlerts(
            alertsFor(load.alerts, TODAY, () => true),
        );
        expect(
            withoutStates.some((alert) => alert.kindLabel === nearFloorLabel),
        ).toBe(false);
    });
});

describe('accountAlerts', () => {
    const STALE = alertKindLabel(AlertKind.StaleSnapshot);
    const WEEKLY = alertKindLabel(AlertKind.WeeklyReviewDue);
    const MIXED = alertKindLabel(AlertKind.MixedStageCopyGroup);
    const WEEKLY_ON_PORTFOLIO = [WEEKLY, 'Portfolio'];
    const MIXED_ON_MIRROR = [MIXED, 'Mirror'];

    it.each([
        {
            expected: new Map([
                ['Alpha', [[STALE, 'Alpha'], WEEKLY_ON_PORTFOLIO]],
                ['Bravo', []],
            ]),
            fixture: 'pinned',
            rows: pinnedRows,
        },
        {
            expected: new Map([
                [
                    'Alpha',
                    [[STALE, 'Alpha'], MIXED_ON_MIRROR, WEEKLY_ON_PORTFOLIO],
                ],
                [
                    'Bad date',
                    [
                        [
                            alertKindLabel(AlertKind.InvalidStoredDate),
                            'Bad date',
                        ],
                        WEEKLY_ON_PORTFOLIO,
                    ],
                ],
                ['Bravo', []],
                [
                    'Charlie',
                    [
                        [alertKindLabel(AlertKind.EvalDayCapNear), 'Charlie'],
                        [STALE, 'Charlie'],
                        MIXED_ON_MIRROR,
                        WEEKLY_ON_PORTFOLIO,
                    ],
                ],
                [
                    'Unknown plan',
                    [
                        [STALE, 'Unknown plan'],
                        [
                            alertKindLabel(AlertKind.UnresolvablePlan),
                            'Unknown plan',
                        ],
                        WEEKLY_ON_PORTFOLIO,
                    ],
                ],
            ]),
            fixture: 'alert-rich',
            rows: alertRichRows,
        },
    ])(
        'shows each account of the $fixture fixture exactly the overview alerts listed for it',
        ({ expected, rows: rowsFor }) => {
            const rows = rowsFor();
            const overview = readyAlerts(buildOverview(inputs(rows)).alerts);
            expect(new Set(rows.accounts.map((row) => row.label))).toEqual(
                new Set(expected.keys()),
            );
            for (const { id, label } of rows.accounts) {
                const listed = expected.get(label) ?? [];
                const shown = listed.map(([kindLabel, subjectLabel]) => {
                    const match = overview.find(
                        (alert) =>
                            alert.kindLabel === kindLabel &&
                            alert.subjectLabel === subjectLabel,
                    );
                    if (match === undefined) {
                        throw new Error(
                            `the overview has no ${kindLabel} alert on ${subjectLabel}`,
                        );
                    }
                    return match;
                });
                expect(detailAlertsOf(rows, id), label).toEqual({
                    accountStatesCaveat: null,
                    alerts: shown,
                    kind: OverviewSectionStatus.Ready,
                });
            }
        },
    );

    it('covers alerts on single accounts, on a copy group and on the whole portfolio in the fixture', () => {
        const rows = alertRichRows();
        const alerts = portfolioAlerts({
            ...rows,
            accountStates: [],
            today: TODAY,
        });
        const kinds = new Set(alerts.map((alert) => alert.subject.kind));
        expect(kinds).toContain(AlertSubjectKind.Account);
        expect(kinds).toContain(AlertSubjectKind.CopyGroup);
        expect(kinds).toContain(AlertSubjectKind.Portfolio);
        const idOf = new Map(rows.accounts.map((row) => [row.label, row.id]));
        const portfolioIds = alerts.flatMap((alert) =>
            alert.subject.kind === AlertSubjectKind.Portfolio
                ? [alert.subject.accountIds]
                : [],
        );
        expect(portfolioIds).toEqual([
            ['Alpha', 'Charlie', 'Unknown plan', 'Bad date'].map((label) =>
                idOf.get(label),
            ),
        ]);
    });

    it('reports the overview failure when a source the alerts need failed', () => {
        const answeredRows = answered(pinnedRows());
        expect(
            accountAlerts({
                accountId: 'any',
                queries: {
                    [PortfolioSource.Accounts]:
                        answeredRows[PortfolioSource.Accounts],
                    [PortfolioSource.CopyGroups]:
                        answeredRows[PortfolioSource.CopyGroups],
                    [PortfolioSource.Payouts]:
                        answeredRows[PortfolioSource.Payouts],
                    [PortfolioSource.Rulebook]: unreadableRulebook(),
                    [PortfolioSource.Snapshots]:
                        answeredRows[PortfolioSource.Snapshots],
                },
                today: TODAY,
            }),
        ).toEqual({
            kind: OverviewSectionStatus.Failed,
            message:
                'Alerts could not be checked because your rulebook could not be loaded.',
        });
    });
});

describe('ledgerOrDateFailure', () => {
    it('returns the computed result', () => {
        expect(ledgerOrDateFailure(() => 42)).toEqual({
            kind: OverviewSectionStatus.Ready,
            value: 42,
        });
    });

    it('turns a stored date error into a readable sentence', () => {
        expect(
            ledgerOrDateFailure(() => {
                throw new IsoDateError('Not a calendar date: "2026-02-30"');
            }),
        ).toEqual({
            kind: OverviewSectionStatus.Failed,
            message: 'Not a calendar date: "2026-02-30".',
        });
        expect(
            ledgerOrDateFailure(() => {
                throw new IsoDateError('Not an ISO date (YYYY-MM-DD): "x".');
            }),
        ).toEqual({
            kind: OverviewSectionStatus.Failed,
            message: 'Not an ISO date (YYYY-MM-DD): "x".',
        });
    });

    it('rethrows every other error', () => {
        const failure = new RangeError('not a date problem');
        expect(() =>
            ledgerOrDateFailure(() => {
                throw failure;
            }),
        ).toThrow(failure);
    });
});

describe('ledger labels', () => {
    it.each(Object.values(FeeKind))('labels fee kind %s', (kind) => {
        expect(feeKindLabel(kind)).toMatch(/^[A-Z]/);
    });

    it.each(Object.values(PayoutStatus))(
        'labels payout status %s',
        (status) => {
            expect(payoutStatusLabel(status)).toMatch(/^Payout /);
        },
    );

    it.each(Object.values(AccountEventKind))('labels event kind %s', (kind) => {
        expect(accountEventKindLabel(kind)).toMatch(/^[A-Z]/);
    });
});
