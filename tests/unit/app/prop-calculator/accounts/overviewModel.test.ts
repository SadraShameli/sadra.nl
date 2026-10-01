import { describe, expect, it, vi } from 'vitest';

import type * as PropAccounts from '~/lib/prop-accounts';

import {
    type AccountFromStateFigures,
    type DocumentedRunFigures,
    type OverviewOutcome,
    OverviewOutcomeKind,
    overviewRequestKey,
    OverviewRequestKind,
    type PayoutSizeOptimumFigures,
    type PortfolioProjectionFigures,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { accountAlerts } from '~/app/(app)/prop-calculator/accounts/_components/detail/accountAlerts';
import {
    AccountFromStateViewKind,
    MilestoneValueViewKind,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/accountFromStateModel';
import {
    accountEventKindLabel,
    accountStatesFromLoad,
    alertsFor,
    buildOverview,
    ExpectedNetStatus,
    feeKindLabel,
    KpiTone,
    ledgerOrDateFailure,
    NO_OVERVIEW_ENGINE,
    OVERVIEW_TIMELINE_LIMIT,
    overviewAccountRequestsOf,
    type OverviewAccountRow,
    type OverviewAlert,
    type OverviewAlerts,
    type OverviewDecisionRow,
    type OverviewEngine,
    overviewEngineRequestsOf,
    type OverviewExposure,
    type OverviewInputs,
    OverviewKpiKind,
    type OverviewLedger,
    type OverviewLedgerCards,
    type OverviewNextPayout,
    OverviewNoticeKind,
    type OverviewPayoutRow,
    type OverviewProjection,
    overviewProjectionRequestsOf,
    OverviewSectionStatus,
    type OverviewSnapshotRow,
    type OverviewViolationRow,
    payoutStatusLabel,
    portfolioAlerts,
    portfolioLoad,
    type PortfolioQueries,
    type PortfolioRows,
    PortfolioSource,
    violationsFor,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
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
    BustCause,
    costAnalytics,
    createAlertContext,
    cushionBoardOf,
    DashboardBalanceConvention,
    DEFAULT_ALERT_RULES,
    exposureOf,
    FeeKind,
    firmKeyId,
    FirmKeyKind,
    formatUsdCents,
    IsoDateError,
    type LedgerAccountRow,
    payoutReadinessBoardOf,
    PayoutReadinessRowKind,
    PayoutStatus,
    PortfolioLedger,
    rebuyLagDefault,
    replacementStats,
    RuleViolationKind,
    SampleLevel,
    usdCents,
    ViolationSource,
} from '~/lib/prop-accounts';
import {
    AccountCapPolicyKind,
    CENTS_PER_DOLLAR,
    CumulativeAmountTrigger,
    DiscretionaryTrigger,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    MffuVariant,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PayoutGate,
    type Plan,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    type SharedPoolPolicy,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    LifetimePayoutCapBasis,
    PayoutBlockReasonKind,
    RebuyLagBasis,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { DocumentedPolicyTimelineGap } from '~/lib/prop-calculator/advisor/policy';
import {
    EvalMilestoneGap,
    MilestoneKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { type PortfolioTimelineResult } from '~/lib/prop-calculator/portfolioTimeline';
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
    SAME_FIRM_SECOND_EVAL_PLAN,
    transfer,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

const readinessOverride = vi.hoisted(() => ({
    rows: null as null | readonly unknown[],
}));

vi.mock('~/lib/prop-accounts', async (importOriginal) => {
    const actual = await importOriginal<typeof PropAccounts>();
    return {
        ...actual,
        payoutReadinessBoardOf: (
            ...parameters: Parameters<typeof actual.payoutReadinessBoardOf>
        ) => {
            const real = actual.payoutReadinessBoardOf(...parameters);
            return readinessOverride.rows === null
                ? real
                : {
                      ...real,
                      rows: readinessOverride.rows as typeof real.rows,
                  };
        },
    };
});

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
        [PortfolioSource.Decisions]: { data: rows.decisions, error: null },
        [PortfolioSource.Events]: { data: rows.events, error: null },
        [PortfolioSource.Fees]: { data: rows.fees, error: null },
        [PortfolioSource.Payouts]: { data: rows.payouts, error: null },
        [PortfolioSource.Rulebook]: { data: rows.rulebook, error: null },
        [PortfolioSource.Snapshots]: { data: rows.snapshots, error: null },
        [PortfolioSource.Transfers]: { data: rows.transfers, error: null },
        [PortfolioSource.Violations]: { data: rows.violations, error: null },
    };
}

function capAlertOf(rows: PortfolioRows): OverviewAlert | undefined {
    return readyAlerts(buildOverview(inputs(rows)).alerts).find(
        (alert) =>
            alert.kindLabel === alertKindLabel(AlertKind.LifetimeDollarCapNear),
    );
}

function cardsOf(rows: Partial<PortfolioRows>): OverviewLedgerCards {
    return readyCards(buildOverview(inputs(rows)).ledger);
}

function cents(value: number): string {
    return formatUsdCents(usdCents(value));
}

function decisionRow(
    overrides: Partial<OverviewDecisionRow> = {},
): OverviewDecisionRow {
    return {
        acceptedRiskCents: usdCents(2500),
        accountId: pinnedRows().accounts[0]?.id ?? '',
        actualRiskCents: null,
        decidedOn: '2026-07-05',
        ...overrides,
    };
}

function detailAlertsOf(
    rows: PortfolioRows,
    accountId: string,
    overrides: Partial<PortfolioQueries> = {},
): OverviewAlerts {
    const answeredRows = { ...answered(rows), ...overrides };
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
    return {
        ...row,
        copyGroupId: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        firstFundedTradeOn: null,
        liveStartBalanceCents: null,
        personalRules: {},
    };
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
        [PortfolioSource.Decisions]: rows.decisions ?? [],
        [PortfolioSource.Events]: rows.events ?? [],
        [PortfolioSource.Fees]: rows.fees ?? [],
        [PortfolioSource.Payouts]: rows.payouts ?? [],
        [PortfolioSource.Rulebook]: rows.rulebook ?? DEFAULT_RULEBOOK,
        [PortfolioSource.Snapshots]: rows.snapshots ?? [],
        [PortfolioSource.Transfers]: rows.transfers ?? [],
        [PortfolioSource.Violations]: rows.violations ?? [],
    };
}

function snapshotRow(
    owner: LedgerAccountRow,
    overrides: Partial<OverviewSnapshotRow> = {},
): OverviewSnapshotRow {
    return {
        accountId: owner.id,
        asOf: '2026-09-05',
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(0),
        createdAt: new Date('2026-09-05T00:00:00Z'),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: usdCents(0),
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: null,
        highestIntradayBalanceCents: null,
        id: `snapshot-${owner.id}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: null,
        userId: owner.userId,
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

function violationRow(
    overrides: Partial<OverviewViolationRow> = {},
): OverviewViolationRow {
    return {
        accountId: pinnedRows().accounts[0]?.id ?? '',
        costCents: usdCents(1000),
        kind: RuleViolationKind.Other,
        occurredOn: '2026-07-05',
        source: ViolationSource.Manual,
        ...overrides,
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
                realizedMinusModeled: 'Pending',
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
                    modeledFundedSurvival: 'Pending',
                    modeledPassRate: 'Pending',
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
                structuralBusts: '0',
                unknownBusts: '1',
                withinPlanBusts: '0',
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
        expect(
            cards.funnel.disclosures.some((text) =>
                text.includes('diagnosed by the same rule'),
            ),
        ).toBe(true);
        expect(
            cards.funnel.disclosures.some((text) =>
                text.includes(
                    'a decision with no recorded actual risk counts as risk followed',
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
                transfer(BankrollTransferKind.Deposit, 100_000, '2026-05-01'),
                transfer(BankrollTransferKind.Withdrawal, 10_000, '2026-08-01'),
            ],
        });
        expect(cards.bankroll.deposits).toBe(cents(100_000));
        expect(cards.bankroll.withdrawals).toBe(cents(10_000));
        expect(cards.bankroll.grownFrom).toBe(cents(100_000));
        expect(cards.bankroll.available).toBe(cents(75_000));
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
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    dailyAccountCapacity: 3,
                },
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
            reason: 'Set your daily account capacity in the rulebook to see what running your full capacity once would project.',
        });
    });

    it('shows the scale at the measured multiple once an account has ended and capacity is set', () => {
        const rows = pinnedRows();
        const cards = cardsOf({
            ...rows,
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    dailyAccountCapacity: 3,
                },
            },
        });
        const scale = cards.bankroll.scale;
        if (scale.kind !== 'available') {
            throw new Error(
                'expected the scale-at-multiple line to be available',
            );
        }
        expect(scale.n).toBe(1);
        expect(scale.sampleLevel).toBeNull();
    });

    it('projects the scale figure off filling the daily capacity once, not a day-scaled monthly rate', () => {
        const alpha = account(EVAL_PLAN, {
            label: 'Alpha',
            purchasedOn: '2026-06-01',
            status: AccountStatus.Closed,
        });
        const cards = cardsOf({
            accounts: [alpha].map(overviewAccount),
            events: [
                purchased(alpha),
                event(alpha, AccountEventKind.ClosedInactivity, '2026-07-01'),
            ],
            fees: [fee(alpha, FeeKind.EvalPurchase, 10_000, '2026-06-01')],
            payouts: [
                payout(alpha, 20_000, {
                    netCents: 20_000,
                    paidOn: '2026-07-01',
                    requestedOn: '2026-06-25',
                }),
            ],
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    dailyAccountCapacity: 3,
                },
            },
        });
        const scale = cards.bankroll.scale;
        if (scale.kind !== 'available') {
            throw new Error(
                'expected the scale-at-multiple line to be available',
            );
        }
        expect(scale.multiple).toBe('2.00x');
        expect(scale.projectedMonthly).toBe(cents(60_000));
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

    it("threads the ledger's recorded events into the lifetime cap alert, so a moved-live account's pre-move payouts count as certain", () => {
        const mff = mffProEntry();
        const active = account(mff, {
            label: 'Active',
            purchasedOn: '2026-01-01',
            stage: AccountStage.Funded,
        });
        const movedLive = account(mff, {
            label: 'Moved live',
            purchasedOn: '2026-01-01',
            stage: AccountStage.Live,
        });
        const accounts = [active, movedLive].map(overviewAccount);
        const payouts = [
            payout(active, 4_000_000, {
                netCents: 4_000_000,
                paidOn: '2026-02-01',
            }),
            payout(movedLive, 6_000_000, {
                netCents: 6_000_000,
                paidOn: '2026-03-01',
            }),
            payout(movedLive, 3_000_000, {
                netCents: 3_000_000,
                paidOn: '2026-07-01',
            }),
        ];
        const withMoveDate = capAlertOf(
            rowsOf({
                accounts,
                events: [
                    purchased(active),
                    purchased(movedLive),
                    event(movedLive, AccountEventKind.MovedLive, '2026-06-01'),
                ],
                payouts,
            }),
        );
        expect(withMoveDate?.message).toContain(
            'no further payout fits under the cap',
        );
        const withoutMoveDate = capAlertOf(
            rowsOf({
                accounts,
                events: [purchased(active), purchased(movedLive)],
                payouts,
            }),
        );
        expect(withoutMoveDate?.message).toContain(
            'so the cap may already be reached',
        );
        expect(withoutMoveDate?.message).not.toContain(
            'no further payout fits under the cap',
        );
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

describe('violationsFor (F-V20)', () => {
    it('passes a failed or pending violations section through unchanged', () => {
        const failed = portfolioLoad(
            queries({
                [PortfolioSource.Violations]: {
                    data: undefined,
                    error: rejectedError('More than 5000 rows match', {
                        limit: 5000,
                        reason: PropLimitRejection.ListTooLarge,
                        record: PropRecord.Violation,
                    }),
                },
            }),
        ).violations;
        const pending = portfolioLoad(
            queries({
                [PortfolioSource.Violations]: {
                    data: undefined,
                    error: null,
                },
            }),
        ).violations;
        expect(violationsFor(failed, null)).toEqual({
            kind: OverviewSectionStatus.Failed,
            message:
                'Rule violations could not be shown because your rule violations could not be loaded.',
        });
        expect(violationsFor(pending, null)).toEqual({
            kind: OverviewSectionStatus.Pending,
        });
    });

    it('builds a violations card model from the loaded rows and net cash', () => {
        const oversizeCostCents = usdCents(10_000);
        const chasedLossCostCents = usdCents(5000);
        const violationRows = [
            violationRow({
                costCents: oversizeCostCents,
                kind: RuleViolationKind.Oversize,
            }),
            violationRow({
                costCents: chasedLossCostCents,
                kind: RuleViolationKind.ChasedLoss,
                source: ViolationSource.Detected,
            }),
        ];
        const violationsQuery = { data: violationRows, error: null };
        const ready = portfolioLoad(
            queries({ [PortfolioSource.Violations]: violationsQuery }),
        ).violations;
        const model = violationsFor(ready, usdCents(150_000));
        expect(model).toEqual({
            kind: OverviewSectionStatus.Ready,
            model: {
                byKind: expect.arrayContaining([
                    {
                        cost: cents(10_000),
                        count: 1,
                        key: RuleViolationKind.Oversize,
                        kind: RuleViolationKind.Oversize,
                    },
                    {
                        cost: cents(5000),
                        count: 1,
                        key: RuleViolationKind.ChasedLoss,
                        kind: RuleViolationKind.ChasedLoss,
                    },
                ]) as unknown,
                detectedCount: 1,
                disclosures: [],
                manualCount: 1,
                netCost: cents(15_000),
                netCostShareOfNetCash: '10.0%',
            },
        });
    });

    it('builds an empty model with no violations recorded', () => {
        const ready = portfolioLoad(queries({})).violations;
        const model = violationsFor(ready, usdCents(150_000));
        expect(model).toEqual({
            kind: OverviewSectionStatus.Ready,
            model: {
                byKind: [],
                detectedCount: 0,
                disclosures: [],
                manualCount: 0,
                netCost: cents(0),
                netCostShareOfNetCash: null,
            },
        });
    });
});

describe('buildOverview violations (F-V20)', () => {
    it('carries a Ready violations model computed against the ledger net cash', () => {
        const rows = pinnedRows();
        const violationCostCents = usdCents(2000);
        const busted = rows.accounts[1];
        const violationRows = [
            violationRow({
                accountId: busted?.id,
                costCents: violationCostCents,
                kind: RuleViolationKind.Oversize,
            }),
        ];
        const model = buildOverview(
            inputs({ ...rows, violations: violationRows }),
        );
        expect(model.violations.kind).toBe(OverviewSectionStatus.Ready);
        if (model.violations.kind !== OverviewSectionStatus.Ready) return;
        expect(model.violations.model.netCost).toBe(cents(2000));
        expect(model.violations.model.manualCount).toBe(1);
    });

    it('diagnoses a bust by BustDiagnosis: a violation in the attempt window is structural, a followed decision under Maximum drawdown is within-plan, neither is unknown', () => {
        const rows = pinnedRows();
        const busted = rows.accounts[1];
        if (busted === undefined) throw new Error('expected a busted account');
        const bustCauseEvents = rows.events.map((candidate) =>
            candidate.accountId === busted.id &&
            candidate.kind === AccountEventKind.Busted
                ? { ...candidate, detail: { bustCause: BustCause.MaxDrawdown } }
                : candidate,
        );
        const oversizeViolation = violationRow({
            accountId: busted.id,
            kind: RuleViolationKind.Oversize,
            occurredOn: '2026-07-05',
        });
        const followedDecision = decisionRow({
            accountId: busted.id,
            actualRiskCents: null,
            decidedOn: '2026-07-05',
        });
        const withViolation = readyCards(
            buildOverview(
                inputs({
                    ...rows,
                    events: bustCauseEvents,
                    violations: [oversizeViolation],
                }),
            ).ledger,
        );
        const withFollowedDecision = readyCards(
            buildOverview(
                inputs({
                    ...rows,
                    decisions: [followedDecision],
                    events: bustCauseEvents,
                }),
            ).ledger,
        );
        const withNeither = readyCards(
            buildOverview(inputs({ ...rows, events: bustCauseEvents })).ledger,
        );
        expect(withViolation.funnel.rows[0]).toEqual(
            expect.objectContaining({
                structuralBusts: '1',
                unknownBusts: '0',
                withinPlanBusts: '0',
            }),
        );
        expect(withFollowedDecision.funnel.rows[0]).toEqual(
            expect.objectContaining({
                structuralBusts: '0',
                unknownBusts: '0',
                withinPlanBusts: '1',
            }),
        );
        expect(withNeither.funnel.rows[0]).toEqual(
            expect.objectContaining({
                structuralBusts: '0',
                unknownBusts: '1',
                withinPlanBusts: '0',
            }),
        );
    });

    it('does not count a busted account as within-plan when violations are still loading', () => {
        const rows = pinnedRows();
        const withPendingViolations = readyCards(
            buildOverview(
                inputs(rows, {
                    [PortfolioSource.Violations]: {
                        data: undefined,
                        error: null,
                    },
                }),
            ).ledger,
        );
        expect(withPendingViolations.funnel.rows[0]).toEqual(
            expect.objectContaining({
                structuralBusts: NOT_APPLICABLE,
                withinPlanBusts: NOT_APPLICABLE,
            }),
        );
        expect(
            withPendingViolations.funnel.disclosures.some((text) =>
                text.includes('still loading'),
            ),
        ).toBe(true);
    });

    it('does not count a busted account as within-plan when violations failed to load', () => {
        const rows = pinnedRows();
        const violationsError = rejectedError('More than 5000 rows match', {
            limit: 5000,
            reason: PropLimitRejection.ListTooLarge,
            record: PropRecord.Violation,
        });
        const withFailedViolations = readyCards(
            buildOverview(
                inputs(rows, {
                    [PortfolioSource.Violations]: {
                        data: undefined,
                        error: violationsError,
                    },
                }),
            ).ledger,
        );
        expect(withFailedViolations.funnel.rows[0]).toEqual(
            expect.objectContaining({
                structuralBusts: NOT_APPLICABLE,
                withinPlanBusts: NOT_APPLICABLE,
            }),
        );
        expect(
            withFailedViolations.funnel.disclosures.some((text) =>
                text.includes('could not be computed'),
            ),
        ).toBe(true);
    });

    it('does not count a busted account as within-plan when sizing decisions are still loading', () => {
        const rows = pinnedRows();
        const withPendingDecisions = readyCards(
            buildOverview(
                inputs(rows, {
                    [PortfolioSource.Decisions]: {
                        data: undefined,
                        error: null,
                    },
                }),
            ).ledger,
        );
        expect(withPendingDecisions.funnel.rows[0]).toEqual(
            expect.objectContaining({
                structuralBusts: NOT_APPLICABLE,
                unknownBusts: NOT_APPLICABLE,
                withinPlanBusts: NOT_APPLICABLE,
            }),
        );
        expect(
            withPendingDecisions.funnel.disclosures.some((text) =>
                text.includes('still loading'),
            ),
        ).toBe(true);
    });

    it('does not count a busted account as within-plan when sizing decisions failed to load', () => {
        const rows = pinnedRows();
        const decisionsError = rejectedError('More than 20000 rows match', {
            limit: 20_000,
            reason: PropLimitRejection.ListTooLarge,
            record: PropRecord.Decision,
        });
        const withFailedDecisions = readyCards(
            buildOverview(
                inputs(rows, {
                    [PortfolioSource.Decisions]: {
                        data: undefined,
                        error: decisionsError,
                    },
                }),
            ).ledger,
        );
        expect(withFailedDecisions.funnel.rows[0]).toEqual(
            expect.objectContaining({
                structuralBusts: NOT_APPLICABLE,
                unknownBusts: NOT_APPLICABLE,
                withinPlanBusts: NOT_APPLICABLE,
            }),
        );
        expect(
            withFailedDecisions.funnel.disclosures.some((text) =>
                text.includes('could not be computed'),
            ),
        ).toBe(true);
    });
});

describe('buildOverview tilt vs variance (F-V20)', () => {
    it('shows net cash, violation cost and net without violations per firm and month, labelled not path-adjusted', () => {
        const rows = pinnedRows();
        const alpha = rows.accounts[0];
        if (alpha === undefined) throw new Error('expected an account');
        const augustViolation = violationRow({
            accountId: alpha.id,
            costCents: usdCents(5000),
            occurredOn: '2026-08-12',
        });
        const cards = readyCards(
            buildOverview(
                inputs({ ...rows, violations: [augustViolation] }),
            ).ledger,
        );
        const row = cards.tiltVariance.rows.find(
            (candidate) => candidate.month === '2026-08',
        );
        expect(row).toEqual(
            expect.objectContaining({
                firm: EVAL_PLAN.firm.displayName,
                netCash: cents(90_000),
                netWithoutViolations: cents(95_000),
                violationCost: cents(5000),
            }),
        );
        expect(cards.tiltVariance.disclosure).toContain('Not path-adjusted');
    });

    it('shows no rows and a loading disclosure while violations are still loading', () => {
        const rows = pinnedRows();
        const cards = readyCards(
            buildOverview(
                inputs(rows, {
                    [PortfolioSource.Violations]: {
                        data: undefined,
                        error: null,
                    },
                }),
            ).ledger,
        );
        expect(cards.tiltVariance.rows).toEqual([]);
        expect(cards.tiltVariance.disclosure).toContain('still loading');
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

    it("carries the account's personal max risk per trade into the near-floor alert basis", () => {
        const entry = mffProEntry();
        const personalMaxRiskPerTrade = 100;
        const drawdownAmount = entry.plan.fundedDrawdown.amount;
        const peak = entry.plan.accountSize + 10_000;
        const threshold = peak - drawdownAmount;
        const cushion = personalMaxRiskPerTrade * 1.5;
        const balance = threshold + cushion;
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
            personalRules: {
                maxRiskPerTradeCents: usdCents(personalMaxRiskPerTrade * 100),
            },
        } as unknown as OverviewAccountRow;
        const snapshot = {
            accountId: ledgerAccount.id,
            asOf: TODAY,
            balanceAtLastPayoutCents: null,
            balanceCents: usdCents(Math.round(balance * 100)),
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

        const model = buildOverview(inputs(rows));
        const alerts = readyAlerts(model.alerts);
        const nearFloor = alerts.find(
            (alert) => alert.kindLabel === alertKindLabel(AlertKind.NearFloor),
        );
        expect(nearFloor?.message).toContain('the personal max risk per trade');
    });
});

describe('buildOverview realized loss risk (PT-58a3 leftover)', () => {
    it('wires a real realizedLossRisk from the ledger so BankrollLossRiskAboveThreshold can fire', () => {
        const losers = Array.from({ length: 5 }, (_, index) =>
            account(EVAL_PLAN, {
                fundedOn: '2026-06-01',
                label: `Loser ${String(index)}`,
                purchasedOn: '2026-05-01',
                stage: AccountStage.Funded,
                status: AccountStatus.Active,
            }),
        );
        const winner = account(EVAL_PLAN, {
            fundedOn: '2026-06-01',
            label: 'Winner',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
        });
        const every = [...losers, winner];
        const rows = rowsOf({
            accounts: every.map(overviewAccount),
            events: every.flatMap((entry) => [
                purchased(entry),
                event(entry, AccountEventKind.EvalPassed, '2026-06-01'),
            ]),
            fees: every.map((entry) =>
                fee(entry, FeeKind.EvalPurchase, 20_000, '2026-05-01'),
            ),
            payouts: [
                payout(winner, 150_000, {
                    netCents: 150_000,
                    paidOn: '2026-06-15',
                    status: PayoutStatus.Paid,
                }),
            ],
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    lossRiskThreshold: 0.3,
                },
                samples: { ...DEFAULT_RULEBOOK.samples, minEvalAttempts: 1 },
            },
        });
        const model = buildOverview(inputs(rows));
        const alerts = readyAlerts(model.alerts);
        const label = alertKindLabel(AlertKind.BankrollLossRiskAboveThreshold);
        const alert = alerts.find((entry) => entry.kindLabel === label);
        expect(alert).toBeDefined();
        expect(alert?.message).toContain('above your 30.0% threshold');
    });

    it('carries no bankroll loss risk alert when the rulebook sets no threshold', () => {
        const losers = Array.from({ length: 5 }, (_, index) =>
            account(EVAL_PLAN, {
                fundedOn: '2026-06-01',
                label: `Loser ${String(index)}`,
                purchasedOn: '2026-05-01',
                stage: AccountStage.Funded,
                status: AccountStatus.Active,
            }),
        );
        const winner = account(EVAL_PLAN, {
            fundedOn: '2026-06-01',
            label: 'Winner',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
        });
        const every = [...losers, winner];
        const rows = rowsOf({
            accounts: every.map(overviewAccount),
            events: every.flatMap((entry) => [
                purchased(entry),
                event(entry, AccountEventKind.EvalPassed, '2026-06-01'),
            ]),
            fees: every.map((entry) =>
                fee(entry, FeeKind.EvalPurchase, 20_000, '2026-05-01'),
            ),
            payouts: [
                payout(winner, 150_000, {
                    netCents: 150_000,
                    paidOn: '2026-06-15',
                    status: PayoutStatus.Paid,
                }),
            ],
        });
        const model = buildOverview(inputs(rows));
        const alerts = readyAlerts(model.alerts);
        const label = alertKindLabel(AlertKind.BankrollLossRiskAboveThreshold);
        expect(alerts.some((entry) => entry.kindLabel === label)).toBe(false);
    });

    it('counts a reset account as more than one attempt when pricing the attempt cost', () => {
        const steady = account(EVAL_PLAN, {
            fundedOn: '2026-06-01',
            label: 'Steady',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
        });
        const retried = account(EVAL_PLAN, {
            fundedOn: '2026-06-01',
            label: 'Retried',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
            status: AccountStatus.Active,
        });
        const rows = rowsOf({
            accounts: [steady, retried].map(overviewAccount),
            events: [
                purchased(steady),
                event(steady, AccountEventKind.EvalPassed, '2026-06-01'),
                purchased(retried),
                event(retried, AccountEventKind.Busted, '2026-05-15'),
                event(retried, AccountEventKind.Reopened, '2026-05-16'),
                event(retried, AccountEventKind.EvalPassed, '2026-06-01'),
            ],
            fees: [
                fee(steady, FeeKind.EvalPurchase, 10_000, '2026-05-01'),
                fee(retried, FeeKind.EvalPurchase, 10_000, '2026-05-01'),
            ],
            payouts: [
                payout(steady, 50_000, {
                    netCents: 50_000,
                    paidOn: '2026-06-08',
                    status: PayoutStatus.Paid,
                }),
            ],
            rulebook: {
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    lossRiskThreshold: 0.01,
                },
                samples: { ...DEFAULT_RULEBOOK.samples, minEvalAttempts: 1 },
            },
        });
        const model = buildOverview(inputs(rows));
        const alerts = readyAlerts(model.alerts);
        const label = alertKindLabel(AlertKind.BankrollLossRiskAboveThreshold);
        const alert = alerts.find((entry) => entry.kindLabel === label);
        expect(alert).toBeDefined();
        expect(alert?.message).toContain('at the 4 attempts');
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

    it('threads a caller-supplied events query into the detail cap alert, once one is passed', () => {
        const mff = mffProEntry();
        const active = account(mff, {
            label: 'Active',
            purchasedOn: '2026-01-01',
            stage: AccountStage.Funded,
        });
        const movedLive = account(mff, {
            label: 'Moved live',
            purchasedOn: '2026-01-01',
            stage: AccountStage.Live,
        });
        const accounts = [active, movedLive].map(overviewAccount);
        const payouts = [
            payout(active, 4_000_000, {
                netCents: 4_000_000,
                paidOn: '2026-02-01',
            }),
            payout(movedLive, 6_000_000, {
                netCents: 6_000_000,
                paidOn: '2026-03-01',
            }),
            payout(movedLive, 3_000_000, {
                netCents: 3_000_000,
                paidOn: '2026-07-01',
            }),
        ];
        const events = [
            purchased(active),
            purchased(movedLive),
            event(movedLive, AccountEventKind.MovedLive, '2026-06-01'),
        ];
        const answeredRows = answered(rowsOf({ accounts, payouts }));
        const baseQueries = {
            [PortfolioSource.Accounts]: answeredRows[PortfolioSource.Accounts],
            [PortfolioSource.CopyGroups]:
                answeredRows[PortfolioSource.CopyGroups],
            [PortfolioSource.Payouts]: answeredRows[PortfolioSource.Payouts],
            [PortfolioSource.Rulebook]: answeredRows[PortfolioSource.Rulebook],
            [PortfolioSource.Snapshots]:
                answeredRows[PortfolioSource.Snapshots],
        };
        const capAlertMessage = (
            queries: Parameters<typeof accountAlerts>[0]['queries'],
        ) =>
            readyAlerts(
                accountAlerts({ accountId: active.id, queries, today: TODAY }),
            ).find(
                (alert) =>
                    alert.kindLabel ===
                    alertKindLabel(AlertKind.LifetimeDollarCapNear),
            )?.message;
        expect(
            capAlertMessage({
                ...baseQueries,
                [PortfolioSource.Events]: { data: events, error: null },
            }),
        ).toContain('no further payout fits under the cap');
        expect(capAlertMessage(baseQueries)).toContain(
            'so the cap may already be reached',
        );
    });

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
        expect(
            detailAlertsOf(pinnedRows(), 'any', {
                [PortfolioSource.Rulebook]: unreadableRulebook(),
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

interface PlanAnswers {
    readonly documented?: DocumentedRunFigures | string;
    readonly optimum?: PayoutSizeOptimumFigures | string;
}

function amountOf(text: string, unit: 'attempt' | 'month'): number {
    const match = new RegExp(String.raw`(-?\$[\d,]+\.\d{2}) per ${unit}`).exec(
        text,
    );
    if (match?.[1] === undefined) {
        throw new Error(`no per ${unit} amount in: ${text}`);
    }
    return Number(match[1].replaceAll(/[$,]/g, ''));
}

function documentedFigures(
    overrides: Partial<DocumentedRunFigures> = {},
): DocumentedRunFigures {
    return {
        anyPayoutGivenFundedProbability: { standardError: 0.01, value: 0.4 },
        attemptPassProbability: { standardError: 0.02, value: 0.3 },
        costPerAttempt: { standardError: 1, value: 120 },
        costPerFundedAccount: 777,
        expectedMonthlyNet: { standardError: 11, value: 1234 },
        expectedMonthlyRealizedNet: { standardError: 9, value: 1111 },
        expectedNetPerAttempt: { standardError: 5, value: 55 },
        expectedPayoutPerFundedAccount: { standardError: 20, value: 900 },
        fundedBustProbability: { standardError: 0.02, value: 0.2 },
        fundedHorizonDays: 252,
        fundedPayoutCountDistribution: [
            0.6, 0.2, 0.1, 0.05, 0.03, 0.02, 0, 0, 0, 0, 0,
        ],
        fundedSurvivalProbability: { standardError: 0.03, value: 0.55 },
        minRetainedCushion: 2750,
        payoutRequestSize: 1250,
        payoutsPerFundedAccount: { standardError: 0.1, value: 1.5 },
        trials: 1234,
        ...overrides,
    };
}

function engineCards(
    rows: Partial<PortfolioRows>,
    answers: Readonly<Record<string, PlanAnswers>>,
    failure: null | string = null,
): OverviewLedgerCards {
    return readyCards(
        buildOverview(engineInputs(rows, answers, failure)).ledger,
    );
}

function engineFor(
    rows: Partial<PortfolioRows>,
    answers: Readonly<Record<string, PlanAnswers>>,
    failure: null | string = null,
): OverviewEngine {
    const load = portfolioLoad(answered(rowsOf(rows)));
    const outcomes = new Map<string, OverviewOutcome>();
    for (const request of overviewEngineRequestsOf(load, USER_ID)) {
        const answer = answers[request.planSerial];
        const slot =
            request.kind === OverviewRequestKind.DocumentedRun
                ? answer?.documented
                : answer?.optimum;
        if (slot === undefined) continue;
        const key = overviewRequestKey(request);
        if (typeof slot === 'string') {
            outcomes.set(key, {
                key,
                kind: OverviewOutcomeKind.Failed,
                reason: slot,
            });
        } else if ('requestSize' in slot) {
            outcomes.set(key, {
                key,
                kind: OverviewOutcomeKind.Succeeded,
                result: {
                    figures: slot,
                    kind: OverviewRequestKind.PayoutSizeOptimum,
                },
            });
        } else {
            outcomes.set(key, {
                key,
                kind: OverviewOutcomeKind.Succeeded,
                result: {
                    figures: slot,
                    kind: OverviewRequestKind.DocumentedRun,
                },
            });
        }
    }
    return { failure, outcomes };
}

function engineInputs(
    rows: Partial<PortfolioRows>,
    answers: Readonly<Record<string, PlanAnswers>>,
    failure: null | string = null,
): OverviewInputs {
    return {
        ...inputs(rows),
        engine: engineFor(rows, answers, failure),
    };
}

function matchedFigures(passRate: number): DocumentedRunFigures {
    return documentedFigures({
        attemptPassProbability: { standardError: 0.01, value: passRate },
        expectedPayoutPerFundedAccount: { standardError: 20, value: 200 },
        payoutsPerFundedAccount: { standardError: 0.1, value: 0.4 },
    });
}

function mergedRows(...parts: readonly PortfolioRows[]): PortfolioRows {
    return rowsOf({
        accounts: parts.flatMap((part) => part.accounts),
        events: parts.flatMap((part) => part.events),
        fees: parts.flatMap((part) => part.fees),
        payouts: parts.flatMap((part) => part.payouts),
    });
}

function mffFundedAccount(
    label: string,
    cushionDollars: number,
    asOf: string = TODAY,
) {
    const entry = mffProEntry();
    const peak = entry.plan.accountSize + 10_000;
    const threshold = peak - entry.plan.fundedDrawdown.amount;
    const owner = account(entry, {
        fundedOn: '2026-08-01',
        label,
        purchasedOn: '2026-07-01',
        stage: AccountStage.Funded,
    });
    return {
        owner,
        row: { ...overviewAccount(owner), firstFundedTradeOn: '2026-08-01' },
        snapshot: snapshotRow(owner, {
            asOf,
            balanceCents: usdCents(
                Math.round((threshold + cushionDollars) * CENTS_PER_DOLLAR),
            ),
            createdAt: new Date('2026-09-25T00:00:00Z'),
            dashboardFloorCents: null,
            highestEodBalanceCents: usdCents(
                Math.round(peak * CENTS_PER_DOLLAR),
            ),
            tradingDays: 5,
        }),
        threshold,
    };
}

function netFigures(value: number): DocumentedRunFigures {
    return documentedFigures({
        expectedMonthlyNet: { standardError: 5, value },
    });
}

function netOptimum(value: number): PayoutSizeOptimumFigures {
    return optimumFigures({
        expectedMonthlyNet: { standardError: 5, value },
    });
}

function optimumFigures(
    overrides: Partial<PayoutSizeOptimumFigures> = {},
): PayoutSizeOptimumFigures {
    return {
        creditSensitive: false,
        evaluatedSizes: 7,
        expectedMonthlyNet: { standardError: 12, value: 1500 },
        expectedMonthlyRealizedNet: { standardError: 10, value: 1400 },
        fundedBustProbability: { standardError: 0.01, value: 0.2 },
        requestSize: 750,
        ...overrides,
    };
}

function planName(entry: PlanEntry): string {
    return `${entry.firm.displayName} ${entry.plan.label}`;
}

function realizedCohortRows(
    entry: PlanEntry,
    options: {
        readonly busted: number;
        readonly paidDollars: number;
        readonly passed: number;
    },
): PortfolioRows {
    const accounts: OverviewAccountRow[] = [];
    const events: ReturnType<typeof event>[] = [];
    const fees: ReturnType<typeof fee>[] = [];
    const payouts: OverviewPayoutRow[] = [];
    for (let index = 0; index < options.passed; index += 1) {
        const owner = account(entry, {
            fundedOn: '2026-06-01',
            label: `Passed ${String(index)}`,
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
        });
        accounts.push(overviewAccount(owner));
        events.push(
            purchased(owner),
            event(owner, AccountEventKind.EvalPassed, '2026-06-01'),
        );
        fees.push(fee(owner, FeeKind.EvalPurchase, 15_000, '2026-05-01'));
        payouts.push(
            payout(owner, options.paidDollars * 100, {
                netCents: options.paidDollars * 100,
                paidOn: '2026-07-15',
                requestedOn: '2026-07-10',
            }),
        );
    }
    for (let index = 0; index < options.busted; index += 1) {
        const owner = account(entry, {
            label: `Busted ${String(index)}`,
            purchasedOn: '2026-05-01',
            status: AccountStatus.Busted,
        });
        accounts.push(overviewAccount(owner));
        events.push(
            purchased(owner),
            event(owner, AccountEventKind.Busted, '2026-05-20'),
        );
        fees.push(fee(owner, FeeKind.EvalPurchase, 15_000, '2026-05-01'));
    }
    return rowsOf({ accounts, events, fees, payouts });
}

function threePlanRows(): PortfolioRows {
    const two = twoPlanRows();
    const third = account(mffProEntry(), {
        fundedOn: '2026-06-01',
        label: 'Third plan funded',
        purchasedOn: '2026-05-01',
        stage: AccountStage.Funded,
    });
    return rowsOf({
        accounts: [...two.accounts, overviewAccount(third)],
        events: [
            ...two.events,
            purchased(third),
            event(third, AccountEventKind.EvalPassed, '2026-06-01'),
        ],
        fees: [
            ...two.fees,
            fee(third, FeeKind.EvalPurchase, 15_000, '2026-05-01'),
        ],
        payouts: two.payouts,
    });
}

function twoPlanRows(): PortfolioRows {
    const eval1 = multiSlotRows();
    const other = account(OTHER_FIRM_EVAL_PLAN, {
        fundedOn: '2026-06-01',
        label: 'Other firm funded',
        purchasedOn: '2026-05-01',
        stage: AccountStage.Funded,
    });
    return rowsOf({
        accounts: [...eval1.accounts, overviewAccount(other)],
        events: [
            ...eval1.events,
            purchased(other),
            event(other, AccountEventKind.EvalPassed, '2026-06-01'),
        ],
        fees: [
            ...eval1.fees,
            fee(other, FeeKind.EvalPurchase, 15_000, '2026-05-01'),
        ],
        payouts: eval1.payouts,
    });
}

describe('overviewEngineRequestsOf', () => {
    it('plans one documented-run and one payout-size-optimum request for each held plan', () => {
        const load = portfolioLoad(answered(multiSlotRows()));
        const requests = overviewEngineRequestsOf(load, USER_ID);
        expect(requests.map((request) => request.kind)).toEqual([
            OverviewRequestKind.DocumentedRun,
            OverviewRequestKind.PayoutSizeOptimum,
        ]);
        for (const request of requests) {
            expect(request.planSerial).toBe(EVAL_PLAN.serial);
            expect(request.firmId).toBe(EVAL_PLAN.firm.id);
            expect(request.spec.rulebook).toEqual(DEFAULT_RULEBOOK);
        }
    });

    it('sends only modeled accounts: a ledger-only account, an unresolvable plan and a busted-only plan add no request and nothing throws', () => {
        const modeled = account(EVAL_PLAN, {
            fundedOn: '2026-09-10',
            label: 'Modeled',
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const ledgerOnly = account(EVAL_PLAN, {
            accountSize: 150_000,
            label: 'Ledger only',
            planLabel: 'Rapid 150K',
            planSerial: null,
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const unknown = account(EVAL_PLAN, {
            label: 'Unknown plan',
            planSerial: 'no-such-plan',
        });
        const bustedOnly = account(OTHER_FIRM_EVAL_PLAN, {
            label: 'Busted only',
            status: AccountStatus.Busted,
        });
        const heldRows = rowsOf({
            accounts: [modeled, ledgerOnly, unknown, bustedOnly].map(
                overviewAccount,
            ),
            events: [purchased(modeled)],
        });
        const load = portfolioLoad(answered(heldRows));
        const requests = overviewEngineRequestsOf(load, USER_ID);
        expect(requests).toHaveLength(2);
        expect(
            new Set(requests.map((request) => request.planSerial)),
        ).toEqual(new Set([EVAL_PLAN.serial]));
    });

    it('plans nothing while the ledger or the rulebook has not loaded', () => {
        const noEvents = portfolioLoad(
            queries({
                [PortfolioSource.Events]: { data: undefined, error: null },
            }),
        );
        expect(overviewEngineRequestsOf(noEvents, USER_ID)).toEqual([]);
        const noRulebook = portfolioLoad(
            queries({
                [PortfolioSource.Rulebook]: { data: undefined, error: null },
            }),
        );
        expect(overviewEngineRequestsOf(noRulebook, USER_ID)).toEqual([]);
    });

    it('carries the measured rebuy lag of the plan into the engine policy', () => {
        const old = account(EVAL_PLAN, {
            fundedOn: '2026-06-01',
            label: 'Old',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
            status: AccountStatus.Busted,
        });
        const replacement = account(EVAL_PLAN, {
            fundedOn: '2026-07-20',
            label: 'Replacement',
            purchasedOn: '2026-07-13',
            replacesAccountId: old.id,
            stage: AccountStage.Funded,
        });
        const rows = rowsOf({
            accounts: [old, replacement].map(overviewAccount),
            events: [
                purchased(old),
                event(old, AccountEventKind.EvalPassed, '2026-06-01'),
                event(old, AccountEventKind.Busted, '2026-07-02'),
                purchased(replacement),
                event(replacement, AccountEventKind.EvalPassed, '2026-07-20'),
            ],
        });
        const measured = rebuyLagDefault(
            replacementStats(PortfolioLedger.fromRows(USER_ID, rows)),
            EVAL_PLAN.serial,
        );
        expect(measured.basis).toBe(RebuyLagBasis.Measured);
        const [first] = overviewEngineRequestsOf(
            portfolioLoad(answered(rows)),
            USER_ID,
        );
        expect(first?.spec.enginePolicy.rebuyLagBasis).toBe(
            RebuyLagBasis.Measured,
        );
        expect(first?.spec.enginePolicy.rebuyLagDays).toBe(measured.days);
    });
});

describe('buildOverview expected net card (F-85, F-152)', () => {
    it('shows two numbers per plan, the documented policy and the payout-size optimum, each times the active funded slots, with every basis labelled from typed fields', () => {
        const cards = engineCards(multiSlotRows(), {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures(),
                optimum: optimumFigures(),
            },
        });
        const { expectedNet } = cards;
        expect(expectedNet.status).toBe(ExpectedNetStatus.Ready);
        expect(expectedNet.rows).toHaveLength(1);
        const [row] = expectedNet.rows;
        expect(row?.plan).toBe(planName(EVAL_PLAN));
        expect(row?.activeSlots).toBe('2');
        expect(row?.documented).toEqual({
            creditFree: '$1,111 (SE $9)',
            creditInclusive: '$1,234 (SE $11)',
            requestSize: '$1,250',
            totalCreditFree: '$2,222',
        });
        expect(row?.optimum).toEqual({
            creditFree: '$1,400 (SE $10)',
            creditInclusive: '$1,500 (SE $12)',
            requestSize: '$750',
            totalCreditFree: '$2,800',
        });
        expect(row?.labels.trials).toBe('1,234 trials');
        expect(row?.labels.startBasis).toBe('Fresh start');
        expect(row?.labels.retainedCushion).toContain('$2,750');
        expect(row?.labels.retainedCushion).toContain('engine-resolved');
        expect(row?.labels.payoutPolicy).toContain('Full request only');
        expect(row?.labels.payoutPolicy).toContain('$1,250');
        expect(row?.labels.creditBasis).toContain('credit-free');
        expect(row?.labels.creditBasis).toContain('credit-inclusive');
    });

    it('labels live triggers not checked as optimistic, from the policy the request carries', () => {
        const rows = multiSlotRows();
        const [request] = overviewEngineRequestsOf(
            portfolioLoad(answered(rows)),
            USER_ID,
        );
        expect(request?.spec.enginePolicy.lifetimePayoutCapBasis).toBe(
            LifetimePayoutCapBasis.LiveTriggersNotChecked,
        );
        const cards = engineCards(rows, {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures(),
                optimum: optimumFigures(),
            },
        });
        expect(cards.expectedNet.rows[0]?.labels.lifetimeCapBasis).toContain(
            'optimistic',
        );
    });

    it('ranks plans by credit-inclusive monthly net and marks both rows payout-policy sensitive when the optimum reorders them', () => {
        const cards = engineCards(twoPlanRows(), {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    expectedMonthlyNet: { standardError: 5, value: 1234 },
                }),
                optimum: optimumFigures({
                    expectedMonthlyNet: { standardError: 5, value: 1500 },
                }),
            },
            [OTHER_FIRM_EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    expectedMonthlyNet: { standardError: 5, value: 1000 },
                }),
                optimum: optimumFigures({
                    expectedMonthlyNet: { standardError: 5, value: 2000 },
                }),
            },
        });
        const first = cards.expectedNet.rows.find(
            (row) => row.key === EVAL_PLAN.serial,
        );
        const second = cards.expectedNet.rows.find(
            (row) => row.key === OTHER_FIRM_EVAL_PLAN.serial,
        );
        expect(first?.rankDocumented).toBe('1 of 2');
        expect(first?.rankOptimum).toBe('2 of 2');
        expect(second?.rankDocumented).toBe('2 of 2');
        expect(second?.rankOptimum).toBe('1 of 2');
        expect(first?.policySensitiveNote).toContain('Payout-policy sensitive');
        expect(second?.policySensitiveNote).toContain(
            'Payout-policy sensitive',
        );
    });

    it('leaves the rows unmarked when both payout policies rank the plans the same way', () => {
        const cards = engineCards(twoPlanRows(), {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    expectedMonthlyNet: { standardError: 5, value: 1234 },
                }),
                optimum: optimumFigures({
                    expectedMonthlyNet: { standardError: 5, value: 1500 },
                }),
            },
            [OTHER_FIRM_EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    expectedMonthlyNet: { standardError: 5, value: 1000 },
                }),
                optimum: optimumFigures({
                    expectedMonthlyNet: { standardError: 5, value: 1100 },
                }),
            },
        });
        for (const row of cards.expectedNet.rows) {
            expect(row.policySensitiveNote).toBeNull();
        }
    });

    it('is pending before the worker answers, and a plan with no answer shows pending text, not zero', () => {
        const cards = engineCards(multiSlotRows(), {});
        expect(cards.expectedNet.status).toBe(ExpectedNetStatus.Pending);
        const [row] = cards.expectedNet.rows;
        expect(row?.documented.creditFree).toBe('Pending');
        expect(row?.optimum.creditFree).toBe('Pending');
    });

    it('is failed with the worker failure text when the worker fails before answering', () => {
        const cards = engineCards(
            multiSlotRows(),
            {},
            'The background worker failed.',
        );
        expect(cards.expectedNet.status).toBe(ExpectedNetStatus.Failed);
        expect(cards.expectedNet.statusNote).toContain(
            'The background worker failed.',
        );
        expect(cards.expectedNet.rows[0]?.documented.creditFree).toBe(
            'Not available',
        );
    });

    it('lists a refused request by plan name and run with the engine text, and shows the figure as not available', () => {
        const cards = engineCards(multiSlotRows(), {
            [EVAL_PLAN.serial]: {
                documented: 'one ES contract risks more than your risk',
                optimum: optimumFigures(),
            },
        });
        expect(cards.expectedNet.status).toBe(ExpectedNetStatus.Ready);
        expect(cards.expectedNet.refused).toHaveLength(1);
        expect(cards.expectedNet.refused[0]).toMatchObject({
            plan: planName(EVAL_PLAN),
            reason: 'one ES contract risks more than your risk',
            run: 'Documented policy',
        });
        expect(cards.expectedNet.rows[0]?.documented.creditFree).toBe(
            'Not available',
        );
        expect(cards.expectedNet.rows[0]?.optimum.creditFree).toBe(
            '$1,400 (SE $10)',
        );
    });

    it('has no plan rows and says so when no plan is held', () => {
        const closed = account(EVAL_PLAN, {
            label: 'Closed',
            status: AccountStatus.Closed,
        });
        const cards = engineCards(
            rowsOf({ accounts: [overviewAccount(closed)] }),
            {},
        );
        expect(cards.expectedNet.status).toBe(ExpectedNetStatus.NoPlans);
        expect(cards.expectedNet.rows).toEqual([]);
    });

    it('fills the expected net KPI with the slot-weighted credit-free monthly net and names the credit-inclusive figure in its detail', () => {
        const model = buildOverview(
            engineInputs(twoPlanRows(), {
                [EVAL_PLAN.serial]: {
                    documented: documentedFigures(),
                    optimum: optimumFigures(),
                },
                [OTHER_FIRM_EVAL_PLAN.serial]: {
                    documented: documentedFigures({
                        expectedMonthlyNet: { standardError: 5, value: 950 },
                        expectedMonthlyRealizedNet: {
                            standardError: 5,
                            value: 900,
                        },
                    }),
                    optimum: optimumFigures(),
                },
            }),
        );
        const kpi = readyCards(model.ledger).kpis.find(
            (candidate) => candidate.kind === OverviewKpiKind.ExpectedNet,
        );
        expect(kpi?.value).toBe(formatCurrency((2 * 1111 + 900) / 3));
        expect(kpi?.tone).toBe(KpiTone.Positive);
        expect(kpi?.detail).toContain('credit-free');
        expect(kpi?.detail).toContain('credit-inclusive');
    });

    it('keeps the expected net KPI pending without an engine answer, and not applicable with a failure', () => {
        const pending = readyCards(buildOverview(pinnedFixture()).ledger).kpis;
        expect(
            pending.find((kpi) => kpi.kind === OverviewKpiKind.ExpectedNet),
        ).toMatchObject({ tone: KpiTone.Pending, value: 'Pending' });
        const failed = engineCards(
            multiSlotRows(),
            {},
            'The background worker failed.',
        ).kpis.find((kpi) => kpi.kind === OverviewKpiKind.ExpectedNet);
        expect(failed?.value).toBe(NOT_APPLICABLE);
        expect(failed?.detail).toContain('The background worker failed.');
    });

    it('shows no active funded slot as not applicable instead of dividing by zero', () => {
        const eval1 = rowsOf({
            accounts: [
                overviewAccount(account(EVAL_PLAN, { label: 'Only eval' })),
            ],
        });
        const kpi = engineCards(eval1, {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures(),
                optimum: optimumFigures(),
            },
        }).kpis.find(
            (candidate) => candidate.kind === OverviewKpiKind.ExpectedNet,
        );
        expect(kpi?.value).toBe(NOT_APPLICABLE);
        expect(kpi?.detail).toContain('No active funded slot');
    });
});

describe('buildOverview modeled halves of the cards (F-73, F-78, F-V8, F-V9, F-V11)', () => {
    it('fills the cost card modeled column from the worker cost per funded account and the realized difference', () => {
        const rows = pinnedRows();
        const cards = engineCards(rows, {
            [EVAL_PLAN.serial]: { documented: documentedFigures() },
        });
        const analytics = costAnalytics(
            PortfolioLedger.fromRows(USER_ID, rows),
            new Map(),
        );
        const realized = analytics.perPlan[0]?.costPerFundedAccount ?? null;
        if (realized === null) throw new Error('fixture has a funded account');
        const difference = realized - 77_700;
        const row = cards.cost.perPlan.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(row?.modeled).toBe(cents(77_700));
        expect(row?.realizedMinusModeled).toBe(
            difference > 0 ? `+${cents(difference)}` : cents(difference),
        );
        expect(
            cards.cost.disclosures.some((text) =>
                text.includes('pending the engine cards'),
            ),
        ).toBe(false);
        expect(
            cards.cost.disclosures.some((text) => text.includes('1,234 trials')),
        ).toBe(true);
    });

    it('keeps the cost card modeled column pending without an answer', () => {
        const cards = engineCards(pinnedRows(), {});
        const row = cards.cost.perPlan.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(row?.modeled).toBe('Pending');
        expect(
            cards.cost.disclosures.some((text) =>
                text.includes('pending the engine cards'),
            ),
        ).toBe(true);
    });

    it('pairs the realized pass rate and funded survival with the worker figures over its funded horizon', () => {
        const cards = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: { documented: documentedFigures() },
        });
        const row = cards.outcomes.rows.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(row?.modeledPassRate).toBe('30.0% (SE 2.0%)');
        expect(row?.modeledFundedSurvival).toBe(
            '55.0% (SE 3.0%) over 252 trading days',
        );
        expect(
            cards.outcomes.disclosures.some((text) =>
                text.includes('pending the engine cards'),
            ),
        ).toBe(false);
    });

    it('keeps the modeled outcome columns pending without an answer', () => {
        const row = engineCards(pinnedRows(), {}).outcomes.rows[0];
        expect(row?.modeledPassRate).toBe('Pending');
        expect(row?.modeledFundedSurvival).toBe('Pending');
    });

    it('puts the modeled EV per attempt, pass rate, payout rate, payouts per paid funded account and funded value beside the realized ones', () => {
        const cards = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: { documented: documentedFigures() },
        });
        const row = cards.attemptEconomics.rows.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(row?.modeledEvPerAttempt).toBe('$55 (SE $5)');
        expect(row?.modeledPassRate).toBe('30.0% (SE 2.0%)');
        expect(row?.modeledPayoutRate).toBe('40.0% (SE 1.0%)');
        expect(row?.modeledPayoutsPerPaidFunded).toBe('3.75');
        expect(row?.modeledFundedValue).toBe('$900 (SE $20)');
    });

    it('computes the realized cohort over the calendar days of the worker funded horizon, and the default horizon without one', () => {
        const withEngine = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({ fundedHorizonDays: 126 }),
            },
        });
        expect(withEngine.attemptEconomics.horizonDays).toBe(183);
        expect(withEngine.fundedPayouts.horizonDays).toBe(183);
        expect(
            withEngine.attemptEconomics.disclosures.some((text) =>
                text.includes('126 trading days'),
            ),
        ).toBe(true);
        const without = engineCards(pinnedRows(), {});
        expect(without.attemptEconomics.horizonDays).toBe(365);
        expect(without.fundedPayouts.horizonDays).toBe(365);
    });

    it('shows the modeled payouts-per-funded distribution as shares beside the realized counts', () => {
        const row = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: { documented: documentedFigures() },
        }).fundedPayouts.rows.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(row?.modeledCounts).toEqual([
            '60.0%',
            '20.0%',
            '10.0%',
            '5.0%',
            '3.0%',
            '2.0%',
            '0.0%',
            '0.0%',
            '0.0%',
            '0.0%',
            '0.0%',
        ]);
    });

    it('flags the engine funded value only when it differs from the realized one beyond noise', () => {
        const farApart = engineCards(
            realizedCohortRows(EVAL_PLAN, {
                busted: 0,
                paidDollars: 100,
                passed: 8,
            }),
            {
                [EVAL_PLAN.serial]: {
                    documented: documentedFigures({
                        expectedPayoutPerFundedAccount: {
                            standardError: 20,
                            value: 900,
                        },
                    }),
                },
            },
        ).fundedPayouts.rows[0];
        expect(farApart?.fundedValueFlag).toContain('beyond noise');
        const close = engineCards(
            realizedCohortRows(EVAL_PLAN, {
                busted: 0,
                paidDollars: 100,
                passed: 8,
            }),
            {
                [EVAL_PLAN.serial]: {
                    documented: documentedFigures({
                        expectedPayoutPerFundedAccount: {
                            standardError: 20,
                            value: 105,
                        },
                    }),
                },
            },
        ).fundedPayouts.rows[0];
        expect(close?.fundedValueFlag).toBeNull();
    });

    it('never flags the funded value when the realized sample has no standard error', () => {
        const row = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    expectedPayoutPerFundedAccount: {
                        standardError: 1,
                        value: 5,
                    },
                }),
            },
        }).fundedPayouts.rows[0];
        expect(row?.fundedValueFlag).toBeNull();
    });

    it('names the biggest weakness per plan in the funnel only when the stage differs from the engine beyond noise and costs money', () => {
        const rows = realizedCohortRows(EVAL_PLAN, {
            busted: 6,
            paidDollars: 500,
            passed: 2,
        });
        const weak = engineCards(rows, {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    attemptPassProbability: {
                        standardError: 0.01,
                        value: 0.9,
                    },
                }),
            },
        }).funnel;
        expect(weak.weaknesses).toHaveLength(1);
        expect(weak.weaknesses[0]?.plan).toBe(planName(EVAL_PLAN));
        expect(weak.weaknesses[0]?.text).toContain('Pass rate');
        expect(weak.weaknesses[0]?.text).toContain('per attempt');
        expect(weak.weaknesses[0]?.text).toContain('per month');
        expect(weak.weaknesses[0]?.text).not.toContain('Payout rate');
        expect(weak.biggestWeakness).toContain('Pass rate');
    });

    it('lists no weakness when the gap is within noise, and says the realized stages are not beyond noise', () => {
        const rows = realizedCohortRows(EVAL_PLAN, {
            busted: 6,
            paidDollars: 500,
            passed: 2,
        });
        const within = engineCards(rows, {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    attemptPassProbability: {
                        standardError: 0.01,
                        value: 0.3,
                    },
                }),
            },
        }).funnel;
        expect(within.weaknesses).toEqual([]);
        expect(within.biggestWeakness).toContain('beyond noise');
    });

    it('lists no weakness from a realized sample too small to have a standard error, such as one open account', () => {
        const funnel = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    attemptPassProbability: {
                        standardError: 0.001,
                        value: 0.99,
                    },
                }),
            },
        }).funnel;
        expect(funnel.weaknesses).toEqual([]);
    });

    it('keeps the biggest-weakness line pending without an engine answer', () => {
        const funnel = engineCards(pinnedRows(), {}).funnel;
        expect(funnel.weaknesses).toEqual([]);
        expect(funnel.biggestWeakness).toContain('pending the engine cards');
        const withoutEngine = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(withoutEngine.funnel.biggestWeakness).toContain(
            'pending the engine cards',
        );
    });

    it('uses an empty engine by default so existing callers keep their pending copy', () => {
        expect(NO_OVERVIEW_ENGINE.failure).toBeNull();
        expect(NO_OVERVIEW_ENGINE.outcomes.size).toBe(0);
        const cards = readyCards(buildOverview(pinnedFixture()).ledger);
        expect(cards.expectedNet.status).toBe(ExpectedNetStatus.Pending);
    });
});

describe('buildOverview cushion and payout readiness boards (F-80, F-81)', () => {
    it('ranks accounts nearest to their floor first with the floor, the dollar cushion and the cushion in risk units', () => {
        const near = mffFundedAccount('Near floor', 125);
        const comfortable = mffFundedAccount('Comfortable', 1000);
        const unsnapshotted = account(mffProEntry(), {
            fundedOn: '2026-08-01',
            label: 'No snapshot',
            purchasedOn: '2026-07-01',
            stage: AccountStage.Funded,
        });
        const rows = rowsOf({
            accounts: [
                comfortable.row,
                near.row,
                overviewAccount(unsnapshotted),
            ],
            snapshots: [comfortable.snapshot, near.snapshot],
        });
        const { boards } = buildOverview(inputs(rows));
        if (boards.kind !== OverviewSectionStatus.Ready) {
            throw new Error(`boards not ready: ${boards.kind}`);
        }
        expect(boards.cushion.rows.map((row) => row.account)).toEqual([
            'Near floor',
            'Comfortable',
        ]);
        const [first, second] = boards.cushion.rows;
        expect(first?.rank).toBe('1');
        expect(second?.rank).toBe('2');
        expect(first?.floor).toBe(cents(Math.round(near.threshold * 100)));
        expect(first?.cushion).toBe(cents(12_500));
        expect(first?.ratio).toBe('0.5 x $250 documented funded risk');
        expect(second?.ratio).toBe('4.0 x $250 documented funded risk');
        expect(boards.cushion.unavailable).toEqual([
            {
                account: 'No snapshot',
                key: unsnapshotted.id,
                reason: 'it has no snapshot yet',
            },
        ]);
    });

    it('shows each funded account as eligible with the rule-capped amount at the effective request and the net after the split, or blocked with the gate and what unlocks it', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const rows = rowsOf({
            accounts: [funded.row],
            snapshots: [funded.snapshot],
        });
        const load = portfolioLoad(answered(rows));
        const states = accountStatesFromLoad(USER_ID, TODAY, load);
        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, states);
        const expected = board.rows[0];
        if (expected === undefined) throw new Error('expected one funded row');
        const { boards } = buildOverview(inputs(rows));
        if (boards.kind !== OverviewSectionStatus.Ready) {
            throw new Error(`boards not ready: ${boards.kind}`);
        }
        const [row] = boards.readiness.rows;
        expect(row?.account).toBe('Funded');
        if (expected.kind === PayoutReadinessRowKind.Eligible) {
            expect(row?.status).toBe('Eligible');
            expect(row?.requested).toBe(
                formatUsdCents(expected.requestedAmountCents),
            );
            expect(row?.netAfterSplit).toBe(
                formatUsdCents(expected.traderReceivesCents),
            );
            expect(row?.unlock).toBe('Ready now');
        } else {
            expect(row?.status).toBe('Blocked');
            expect(row?.requested).toBe(NOT_APPLICABLE);
            expect(row?.unlock.length).toBeGreaterThan(0);
        }
    });

    it.each([
        [PayoutGate.NothingWithdrawable, 'more profit or time'],
        [PayoutGate.AccountConcluded, 'no further profit or time'],
    ])(
        'words an unmeasured wait for the %s gate from the block reason, not as an unexplained estimate',
        (gate, expected) => {
            const funded = mffFundedAccount('Funded', 1800);
            const rows = rowsOf({
                accounts: [funded.row],
                snapshots: [funded.snapshot],
            });
            readinessOverride.rows = [
                {
                    accountId: funded.owner.id,
                    asOf: TODAY,
                    kind: PayoutReadinessRowKind.Blocked,
                    pendingAmountCents: null,
                    reason: { gate, kind: PayoutBlockReasonKind.Gate },
                    wait: null,
                },
            ];
            try {
                const { boards } = buildOverview(inputs(rows));
                if (boards.kind !== OverviewSectionStatus.Ready) {
                    throw new Error(`boards not ready: ${boards.kind}`);
                }
                const [row] = boards.readiness.rows;
                expect(row?.status).toBe('Blocked');
                expect(row?.unlock).toContain(expected);
                expect(row?.unlock).not.toContain('wait: no closed-form estimate');
            } finally {
                readinessOverride.rows = null;
            }
        },
    );

    it('shows a pending payout request as the block, with its amount', () => {
        const funded = mffFundedAccount('Pending payout', 100, '2026-09-20');
        const rows = rowsOf({
            accounts: [funded.row],
            payouts: [
                payout(funded.owner, 700_000, {
                    paidOn: null,
                    requestedOn: '2026-09-24',
                    status: PayoutStatus.Requested,
                }),
            ],
            snapshots: [funded.snapshot],
        });
        const { boards } = buildOverview(inputs(rows));
        if (boards.kind !== OverviewSectionStatus.Ready) {
            throw new Error(`boards not ready: ${boards.kind}`);
        }
        const [row] = boards.readiness.rows;
        expect(row?.status).toBe('Blocked');
        expect(row?.unlock).toContain('payout request is already pending');
        expect(row?.note).toContain(cents(700_000));
    });

    it('counts accounts that are not funded and lists accounts without a usable state with the reason', () => {
        const unsnapshotted = account(mffProEntry(), {
            fundedOn: '2026-08-01',
            label: 'No snapshot',
            purchasedOn: '2026-07-01',
            stage: AccountStage.Funded,
        });
        const evalAccount = account(EVAL_PLAN, { label: 'Eval only' });
        const rows = rowsOf({
            accounts: [unsnapshotted, evalAccount].map(overviewAccount),
        });
        const { boards } = buildOverview(inputs(rows));
        if (boards.kind !== OverviewSectionStatus.Ready) {
            throw new Error(`boards not ready: ${boards.kind}`);
        }
        expect(boards.readiness.rows).toEqual([]);
        expect(boards.readiness.unavailable.map((row) => row.account)).toEqual(
            expect.arrayContaining(['No snapshot']),
        );
    });

    it('is pending while the ledger has not loaded and failed with the missing source when a source failed', () => {
        const pending = buildOverview(
            inputs(
                pinnedRows(),
                queries({
                    [PortfolioSource.Events]: { data: undefined, error: null },
                }),
            ),
        ).boards;
        expect(pending).toEqual({ kind: OverviewSectionStatus.Pending });
        const failedLoad = portfolioLoad(
            queries({
                [PortfolioSource.Events]: {
                    data: undefined,
                    error: new Error('events down'),
                },
            }),
        );
        const failed = buildOverview({
            ...inputs(pinnedRows()),
            load: failedLoad,
        }).boards;
        expect(failed).toMatchObject({ kind: OverviewSectionStatus.Failed });
    });

    it('uses the same near-floor ranking as the library board', () => {
        const near = mffFundedAccount('Near floor', 125);
        const rows = rowsOf({
            accounts: [near.row],
            snapshots: [near.snapshot],
        });
        const load = portfolioLoad(answered(rows));
        const board = cushionBoardOf(
            DEFAULT_RULEBOOK,
            accountStatesFromLoad(USER_ID, TODAY, load),
        );
        const { boards } = buildOverview(inputs(rows));
        if (boards.kind !== OverviewSectionStatus.Ready) {
            throw new Error(`boards not ready: ${boards.kind}`);
        }
        expect(boards.cushion.rows.map((row) => row.key)).toEqual(
            board.rows.map((row) => row.accountId),
        );
    });
});

describe('buildOverview expected net card with a partial payout-size answer (F-152)', () => {
    const thirdSerial = mffProEntry().serial;

    function answersWith(
        middle: PlanAnswers['optimum'],
    ): Readonly<Record<string, PlanAnswers>> {
        return {
            [EVAL_PLAN.serial]: {
                documented: netFigures(1200),
                optimum: netOptimum(1300),
            },
            [OTHER_FIRM_EVAL_PLAN.serial]: {
                documented: netFigures(1000),
                optimum: middle,
            },
            [thirdSerial]: {
                documented: netFigures(800),
                optimum: netOptimum(900),
            },
        };
    }

    it('ranks every plan in both columns and marks nothing when all three optima agree with the documented order', () => {
        const { rows } = engineCards(
            threePlanRows(),
            answersWith(netOptimum(1100)),
        ).expectedNet;
        expect(rows).toHaveLength(3);
        expect(
            rows
                .map((row) => row.rankDocumented)
                .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(['1 of 3', '2 of 3', '3 of 3']);
        expect(
            rows
                .map((row) => row.rankOptimum)
                .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(['1 of 3', '2 of 3', '3 of 3']);
        for (const row of rows) expect(row.policySensitiveNote).toBeNull();
    });

    it('does not claim the order changes while one payout-size optimum is still pending', () => {
        const { rows } = engineCards(
            threePlanRows(),
            answersWith(undefined),
        ).expectedNet;
        expect(rows).toHaveLength(3);
        for (const row of rows) {
            expect(row.policySensitiveNote).toBeNull();
            expect(row.rankOptimum).toBe(NOT_APPLICABLE);
        }
        expect(
            rows
                .map((row) => row.rankDocumented)
                .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    });

    it('does not claim the order changes while one payout-size optimum is refused', () => {
        const { rows } = engineCards(
            threePlanRows(),
            answersWith('one ES contract risks more than your risk'),
        ).expectedNet;
        expect(rows).toHaveLength(3);
        for (const row of rows) {
            expect(row.policySensitiveNote).toBeNull();
            expect(row.rankOptimum).toBe(NOT_APPLICABLE);
        }
    });

    it('still marks every row when all three optima reorder the plans', () => {
        const { rows } = engineCards(
            threePlanRows(),
            answersWith(netOptimum(5000)),
        ).expectedNet;
        const marked = rows.filter((row) => row.policySensitiveNote !== null);
        expect(marked.length).toBeGreaterThan(0);
        expect(
            rows.find((row) => row.key === OTHER_FIRM_EVAL_PLAN.serial)
                ?.rankOptimum,
        ).toBe('1 of 3');
    });
});

describe('buildOverview funnel weaknesses across plans (F-V11)', () => {
    it('multiplies a plan weakness by that plan own attempts per month, not the whole portfolio rate', () => {
        const rows = mergedRows(
            realizedCohortRows(EVAL_PLAN, {
                busted: 14,
                paidDollars: 500,
                passed: 2,
            }),
            realizedCohortRows(OTHER_FIRM_EVAL_PLAN, {
                busted: 6,
                paidDollars: 500,
                passed: 2,
            }),
        );
        const { weaknesses } = engineCards(rows, {
            [EVAL_PLAN.serial]: { documented: matchedFigures(0.9) },
            [OTHER_FIRM_EVAL_PLAN.serial]: { documented: matchedFigures(0.9) },
        }).funnel;
        expect(weaknesses).toHaveLength(2);
        const rateOf = new Map([
            [planName(EVAL_PLAN), 16 / 5],
            [planName(OTHER_FIRM_EVAL_PLAN), 8 / 5],
        ]);
        for (const weakness of weaknesses) {
            const expected = rateOf.get(weakness.plan);
            if (expected === undefined) throw new Error(weakness.plan);
            const ratio =
                amountOf(weakness.text, 'month') /
                amountOf(weakness.text, 'attempt');
            expect(ratio).toBeCloseTo(expected, 1);
        }
    });

    it.each([EVAL_PLAN, OTHER_FIRM_EVAL_PLAN])(
        'lists the plan with the larger monthly loss first and names it in the headline (%#)',
        (bigger) => {
            const smaller =
                bigger === EVAL_PLAN ? OTHER_FIRM_EVAL_PLAN : EVAL_PLAN;
            const rows = mergedRows(
                realizedCohortRows(EVAL_PLAN, {
                    busted: 14,
                    paidDollars: 500,
                    passed: 2,
                }),
                realizedCohortRows(OTHER_FIRM_EVAL_PLAN, {
                    busted: 14,
                    paidDollars: 500,
                    passed: 2,
                }),
            );
            const { biggestWeakness, weaknesses } = engineCards(rows, {
                [bigger.serial]: { documented: matchedFigures(0.9) },
                [smaller.serial]: { documented: matchedFigures(0.5) },
            }).funnel;
            expect(weaknesses).toHaveLength(2);
            expect(weaknesses[0]?.plan).toBe(planName(bigger));
            expect(biggestWeakness).toContain(planName(bigger));
        },
    );

    it('says so when a larger gap sits in a stage that cannot be tested for noise', () => {
        const rows = realizedCohortRows(EVAL_PLAN, {
            busted: 6,
            paidDollars: 500,
            passed: 2,
        });
        const { biggestWeakness } = engineCards(rows, {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    attemptPassProbability: {
                        standardError: 0.01,
                        value: 0.9,
                    },
                }),
            },
        }).funnel;
        expect(biggestWeakness).toContain('Pass rate');
        expect(biggestWeakness).toContain('cannot be tested for noise');
        expect(biggestWeakness).toContain('Payouts per paid funded account');
    });

    it('adds no untested-stage remark when the named weakness is the largest gap', () => {
        const rows = realizedCohortRows(EVAL_PLAN, {
            busted: 14,
            paidDollars: 500,
            passed: 2,
        });
        const { biggestWeakness } = engineCards(rows, {
            [EVAL_PLAN.serial]: { documented: matchedFigures(0.9) },
        }).funnel;
        expect(biggestWeakness).toContain('Pass rate');
        expect(biggestWeakness).not.toContain('cannot be tested for noise');
    });
});

describe('buildOverview funnel noise line names only the same plan untestable gap (F-V11)', () => {
    it('does not point at another plan untestable gap under a weakness named for a different plan', () => {
        const rows = mergedRows(
            realizedCohortRows(EVAL_PLAN, {
                busted: 14,
                paidDollars: 500,
                passed: 2,
            }),
            realizedCohortRows(OTHER_FIRM_EVAL_PLAN, {
                busted: 6,
                paidDollars: 500,
                passed: 2,
            }),
        );
        const { biggestWeakness } = engineCards(rows, {
            [EVAL_PLAN.serial]: { documented: matchedFigures(0.9) },
            [OTHER_FIRM_EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    attemptPassProbability: {
                        standardError: 0.01,
                        value: 0.25,
                    },
                }),
            },
        }).funnel;
        expect(biggestWeakness).toContain(planName(EVAL_PLAN));
        expect(biggestWeakness).not.toContain('cannot be tested for noise');
        expect(biggestWeakness).not.toContain(planName(OTHER_FIRM_EVAL_PLAN));
    });

    it('names an untestable largest gap of the plan the weakness is named for', () => {
        const rows = mergedRows(
            realizedCohortRows(EVAL_PLAN, {
                busted: 6,
                paidDollars: 500,
                passed: 2,
            }),
            realizedCohortRows(OTHER_FIRM_EVAL_PLAN, {
                busted: 14,
                paidDollars: 500,
                passed: 2,
            }),
        );
        const { biggestWeakness } = engineCards(rows, {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures({
                    attemptPassProbability: {
                        standardError: 0.01,
                        value: 0.9,
                    },
                }),
            },
            [OTHER_FIRM_EVAL_PLAN.serial]: { documented: matchedFigures(0.9) },
        }).funnel;
        expect(biggestWeakness).toContain('cannot be tested for noise');
        expect(biggestWeakness).toContain('Payouts per paid funded account');
    });
});

describe('buildOverview cost card with an engine that never passes (F-73)', () => {
    const NEVER_PASSES = documentedFigures({
        attemptPassProbability: { standardError: 0, value: 0 },
        costPerFundedAccount: Infinity,
    });

    it('states that there is no modeled cost instead of an unexplained not applicable', () => {
        const cards = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: { documented: NEVER_PASSES },
        });
        const row = cards.cost.perPlan.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(row?.modeled).toBe(
            'No modeled cost (the engine passes no attempt)',
        );
        expect(row?.realizedMinusModeled).toBe(row?.modeled);
    });

    it('shows no infinite or undefined number anywhere on the cost card', () => {
        const cards = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: { documented: NEVER_PASSES },
        });
        const text = JSON.stringify(cards.cost);
        expect(text).not.toMatch(/Infinity|NaN/);
    });

    it('keeps not applicable for a realized side that has no funded account while the modeled cost exists', () => {
        const rows = rowsOf({
            accounts: [
                overviewAccount(account(EVAL_PLAN, { label: 'Only eval' })),
            ],
        });
        const row = engineCards(rows, {
            [EVAL_PLAN.serial]: { documented: documentedFigures() },
        }).cost.perPlan.find((candidate) => candidate.key === EVAL_PLAN.serial);
        expect(row?.modeled).toBe(cents(77_700));
        expect(row?.realizedMinusModeled).toBe(NOT_APPLICABLE);
    });
});

describe('buildOverview realized survival basis next to the modeled horizon (F-78)', () => {
    it('says the realized survival is not horizon-matched and counts a young funded account as a survivor', () => {
        const cards = engineCards(pinnedRows(), {
            [EVAL_PLAN.serial]: { documented: documentedFigures() },
        });
        const disclosure = cards.outcomes.disclosures.find((text) =>
            text.includes('not horizon-matched'),
        );
        expect(disclosure).toContain('252 trading days');
        expect(disclosure).toContain('survivor');
        const row = cards.outcomes.rows.find(
            (candidate) => candidate.key === EVAL_PLAN.serial,
        );
        expect(row?.openFunded).toBe('1');
    });

    it('does not mention a modeled horizon before the engine answers', () => {
        const cards = engineCards(pinnedRows(), {});
        expect(
            cards.outcomes.disclosures.some((text) =>
                text.includes('not horizon-matched'),
            ),
        ).toBe(false);
    });
});

describe('buildOverview expected net KPI coverage (F-99)', () => {
    it('names the active funded slots left out when the engine refuses one plan, so the figure is never read as the whole portfolio', () => {
        const kpi = engineCards(twoPlanRows(), {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures(),
                optimum: optimumFigures(),
            },
            [OTHER_FIRM_EVAL_PLAN.serial]: {
                documented: 'one ES contract risks more than your risk',
                optimum: optimumFigures(),
            },
        }).kpis.find(
            (candidate) => candidate.kind === OverviewKpiKind.ExpectedNet,
        );
        expect(kpi?.value).toBe(formatCurrency(1111));
        expect(kpi?.detail).toContain('weighted over 2 active funded slots');
        expect(kpi?.detail).toContain(
            '1 active funded slot not counted because the engine refused its plan',
        );
    });

    it('adds no exclusion note when every held plan is answered', () => {
        const kpi = engineCards(twoPlanRows(), {
            [EVAL_PLAN.serial]: {
                documented: documentedFigures(),
                optimum: optimumFigures(),
            },
            [OTHER_FIRM_EVAL_PLAN.serial]: {
                documented: documentedFigures(),
                optimum: optimumFigures(),
            },
        }).kpis.find(
            (candidate) => candidate.kind === OverviewKpiKind.ExpectedNet,
        );
        expect(kpi?.detail).not.toContain('not counted');
    });
});

function exposureModelOf(rows: PortfolioRows) {
    return readyExposure(buildOverview(inputs(rows)).exposure);
}

function projectionFigures(
    overrides: Partial<PortfolioProjectionFigures> = {},
): PortfolioProjectionFigures {
    return {
        accountsRequested: 2,
        accountsSimulated: 2,
        dayBudget: 252,
        minRetainedCushion: 2750,
        payoutRequestSize: 1250,
        timeline: projectionTimeline(),
        timelineGaps: [],
        trials: 500,
        ...overrides,
    };
}

function projectionInputs(
    rows: Partial<PortfolioRows>,
    answer: PortfolioProjectionFigures | string | undefined,
    failure: null | string = null,
): OverviewInputs {
    const load = portfolioLoad(answered(rowsOf(rows)));
    const outcomes = new Map<string, OverviewOutcome>();
    for (const request of overviewProjectionRequestsOf(load, USER_ID)) {
        if (answer === undefined) continue;
        const key = overviewRequestKey(request);
        outcomes.set(
            key,
            typeof answer === 'string'
                ? { key, kind: OverviewOutcomeKind.Failed, reason: answer }
                : {
                      key,
                      kind: OverviewOutcomeKind.Succeeded,
                      result: {
                          figures: answer,
                          kind: OverviewRequestKind.PortfolioProjection,
                      },
                  },
        );
    }
    return { ...inputs(rows), engine: { failure, outcomes } };
}

function projectionModelOf(
    answer: PortfolioProjectionFigures | string | undefined,
    rows: PortfolioRows = multiSlotRows(),
    failure: null | string = null,
) {
    const built = buildOverview(projectionInputs(rows, answer, failure));
    return readyProjection(built.projection);
}

function projectionTimeline(
    overrides: Partial<PortfolioTimelineResult> = {},
): PortfolioTimelineResult {
    return {
        accountsSimulated: 2,
        breakEvenMonthValues: [2, 4, 6],
        days: [0, 126, 252],
        netP10: [0, -800, -500],
        netP50: [0, 150, 3200],
        netP90: [0, 900, 9100],
        payoutP10: [0, 0, 0],
        payoutP50: [0, 600, 5200],
        payoutP90: [0, 1500, 11_000],
        pEverCashflowPositive: 0.7,
        pFinalNetNegative: 0.2,
        spendP10: [0, 800, 1200],
        spendP50: [0, 450, 2000],
        spendP90: [0, 600, 1900],
        ...overrides,
    };
}

function readyExposure(exposure: OverviewExposure) {
    if (exposure.kind !== OverviewSectionStatus.Ready) {
        throw new Error(`exposure not ready: ${exposure.kind}`);
    }
    return exposure.model;
}

function readyProjection(projection: OverviewProjection) {
    if (projection.kind !== OverviewSectionStatus.Ready) {
        throw new Error(`projection not ready: ${projection.kind}`);
    }
    return projection.model;
}

describe('overviewProjectionRequestsOf (PT-33, F-87)', () => {
    it('plans one portfolio-projection request per held plan with the active accounts on that plan', () => {
        const load = portfolioLoad(answered(multiSlotRows()));
        const requests = overviewProjectionRequestsOf(load, USER_ID);
        expect(requests).toHaveLength(1);
        const [request] = requests;
        expect(request?.kind).toBe(OverviewRequestKind.PortfolioProjection);
        expect(request?.planSerial).toBe(EVAL_PLAN.serial);
        expect(request?.accounts).toBe(2);
        expect(request?.spec.rulebook).toEqual(DEFAULT_RULEBOOK);
    });

    it('counts only active accounts, and plans nothing for a plan whose accounts are all suspended or busted', () => {
        const active = account(EVAL_PLAN, { label: 'Active' });
        const busted = account(EVAL_PLAN, {
            label: 'Busted',
            status: AccountStatus.Busted,
        });
        const suspended = account(OTHER_FIRM_EVAL_PLAN, {
            label: 'Suspended',
            status: AccountStatus.Suspended,
        });
        const heldRows = rowsOf({
            accounts: [active, busted, suspended].map(overviewAccount),
            events: [purchased(active)],
        });
        const load = portfolioLoad(answered(heldRows));
        const requests = overviewProjectionRequestsOf(load, USER_ID);
        expect(requests.map((request) => request.planSerial)).toEqual([
            EVAL_PLAN.serial,
        ]);
        expect(requests[0]?.accounts).toBe(1);
    });

    it('plans nothing while the ledger or the rulebook has not loaded', () => {
        const noEvents = portfolioLoad(
            queries({
                [PortfolioSource.Events]: { data: undefined, error: null },
            }),
        );
        expect(overviewProjectionRequestsOf(noEvents, USER_ID)).toEqual([]);
        const noRulebook = portfolioLoad(
            queries({
                [PortfolioSource.Rulebook]: { data: undefined, error: null },
            }),
        );
        expect(overviewProjectionRequestsOf(noRulebook, USER_ID)).toEqual([]);
    });

    it('carries the same engine policy as the documented-run request of the plan', () => {
        const load = portfolioLoad(answered(multiSlotRows()));
        const [documented] = overviewEngineRequestsOf(load, USER_ID);
        const [projection] = overviewProjectionRequestsOf(load, USER_ID);
        expect(projection?.spec.enginePolicy).toEqual(
            documented?.spec.enginePolicy,
        );
    });
});

function exposureRows() {
    const near = mffFundedAccount('Near floor', 125);
    const comfortable = mffFundedAccount('Comfortable', 1000);
    const groupId = 'group-mirror';
    return {
        comfortable,
        near,
        rows: rowsOf({
            accounts: [
                { ...near.row, copyGroupId: groupId },
                { ...comfortable.row, copyGroupId: groupId },
            ],
            copyGroups: [{ id: groupId, name: 'Mirror' }],
            snapshots: [near.snapshot, comfortable.snapshot],
        }),
    };
}

describe('buildOverview exposure (PT-33, F-86)', () => {
    it('shows first-trade risk, maximum daily loss and the share of the cushion at risk per account, from the library exposure', () => {
        const { rows } = exposureRows();
        const load = portfolioLoad(answered(rows));
        const states = accountStatesFromLoad(USER_ID, TODAY, load);
        const expected = exposureOf(
            DEFAULT_RULEBOOK,
            states.map((entry) => ({ ...entry, copyGroupId: null })),
        );
        expect(expected.accounts).toHaveLength(2);
        const model = exposureModelOf(rows);
        expect(model.accounts.map((row) => row.key)).toEqual(
            expected.accounts.map((row) => row.accountId),
        );
        for (const row of model.accounts) {
            const library = expected.accounts.find(
                (entry) => entry.accountId === row.key,
            );
            if (library === undefined) throw new Error('missing library row');
            expect(row.firstTradeRisk).toBe(
                formatCurrency(library.firstTradeRisk),
            );
            expect(row.maxDailyLoss).toBe(formatCurrency(library.maxDailyLoss));
            expect(row.cushion).toBe(formatCurrency(library.cushion));
            expect(row.shareOfCushionAtRisk).toBe(
                formatPercent(library.shareOfCushionAtRisk ?? 0),
            );
            expect(row.basis).toBe('Documented dollars');
        }
        const nearRow = model.accounts.find(
            (row) => row.account === 'Near floor',
        );
        expect(nearRow?.cushion).toBe('$125');
        expect(nearRow?.firstTradeRisk).toBe('$125');
        expect(nearRow?.maxDailyLoss).toBe('$125');
        expect(nearRow?.shareOfCushionAtRisk).toBe('100.0%');
        const comfortableRow = model.accounts.find(
            (row) => row.account === 'Comfortable',
        );
        expect(comfortableRow?.firstTradeRisk).toBe('$250');
        expect(comfortableRow?.maxDailyLoss).toBe('$1,000');
        expect(comfortableRow?.shareOfCushionAtRisk).toBe('100.0%');
    });

    it('shows a copy group as one correlated bet with its worst-case daily loss and share of the combined cushion', () => {
        const { rows } = exposureRows();
        const model = exposureModelOf(rows);
        expect(model.groups).toHaveLength(1);
        const [group] = model.groups;
        expect(group?.group).toBe('Mirror');
        expect(group?.accounts).toBe('Near floor, Comfortable');
        expect(group?.maxDailyLoss).toBe('$1,125');
        expect(group?.totalCushion).toBe('$1,125');
        expect(group?.shareOfCushionAtRisk).toBe('100.0%');
        expect(group?.note).toContain('one correlated bet');
        expect(group?.note).toContain('2 accounts');
    });

    it('lists accounts it cannot compute with the reason instead of a zero, and leaves out accounts that are not active', () => {
        const funded = mffFundedAccount('Funded', 1000);
        const unsnapshotted = account(mffProEntry(), {
            fundedOn: '2026-08-01',
            label: 'No snapshot',
            purchasedOn: '2026-07-01',
            stage: AccountStage.Funded,
        });
        const unknown = account(EVAL_PLAN, {
            label: 'Unknown plan',
            planSerial: 'no-such-plan',
        });
        const busted = mffFundedAccount('Busted funded', 1000);
        const bustedRow: OverviewAccountRow = {
            ...busted.row,
            status: AccountStatus.Busted,
        };
        const rows = rowsOf({
            accounts: [
                funded.row,
                overviewAccount(unsnapshotted),
                overviewAccount(unknown),
                bustedRow,
            ],
            snapshots: [funded.snapshot, busted.snapshot],
        });
        const model = exposureModelOf(rows);
        expect(model.accounts.map((row) => row.account)).toEqual(['Funded']);
        expect(
            model.unavailable.map((row) => [row.account, row.reason]),
        ).toEqual([
            ['No snapshot', 'it has no snapshot yet'],
            [
                'Unknown plan',
                expect.stringContaining('no-such-plan') as unknown,
            ],
        ]);
    });

    it('is pending while the ledger has not loaded and failed with the missing source when a source failed', () => {
        const pending = buildOverview(
            inputs(
                pinnedRows(),
                queries({
                    [PortfolioSource.Events]: { data: undefined, error: null },
                }),
            ),
        ).exposure;
        expect(pending).toEqual({ kind: OverviewSectionStatus.Pending });
        const failedLoad = portfolioLoad(
            queries({
                [PortfolioSource.Events]: {
                    data: undefined,
                    error: new Error('events down'),
                },
            }),
        );
        const failed = buildOverview({
            ...inputs(pinnedRows()),
            load: failedLoad,
        }).exposure;
        expect(failed).toMatchObject({ kind: OverviewSectionStatus.Failed });
    });

    it('says how the maximum daily loss is counted, from the documented rungs', () => {
        const { rows } = exposureRows();
        const model = exposureModelOf(rows);
        expect(model.disclosures.join(' ')).toContain('sum of the documented');
        expect(model.disclosures.join(' ')).toContain('cushion');
    });
});

describe('buildOverview fresh-start projection (PT-33, F-87)', () => {
    it('shows one row per plan with the P10, P50 and P90 final net, the loss probability and the break-even month, every figure from the engine answer', () => {
        const model = projectionModelOf(projectionFigures());
        expect(model.status).toBe(ExpectedNetStatus.Ready);
        expect(model.rows).toHaveLength(1);
        const [row] = model.rows;
        expect(row?.key).toBe(EVAL_PLAN.serial);
        expect(row?.plan).toBe(planName(EVAL_PLAN));
        expect(row?.finalNet).toEqual({
            p10: '-$500',
            p50: '$3,200',
            p90: '$9,100',
        });
        expect(row?.finalSpendMedian).toBe('$2,000');
        expect(row?.finalPayoutMedian).toBe('$5,200');
        expect(row?.probabilityFinalNetNegative).toBe('20.0%');
        expect(row?.probabilityEverPositive).toBe('70.0%');
        expect(row?.breakEvenMonth).toBe(
            '4.0 months (median of the trials that get there)',
        );
        expect(row?.result).toEqual(projectionTimeline());
        expect(row?.accounts).toBe('2 accounts simulated');
    });

    it('labels every assumption: fresh start from a new purchase, trials, engine-resolved retained cushion, payout request and policy, lifetime cap basis, trades per day and the horizon', () => {
        const model = projectionModelOf(projectionFigures());
        const [row] = model.rows;
        expect(row?.labels.startBasis).toBe(
            'Fresh start from a new purchase of every account, not your current balances',
        );
        expect(row?.labels.trials).toBe('500 trials');
        expect(row?.labels.retainedCushion).toContain('$2,750');
        expect(row?.labels.retainedCushion).toContain('engine-resolved');
        expect(row?.labels.payoutPolicy).toContain('Full request only');
        expect(row?.labels.payoutPolicy).toContain('$1,250');
        expect(row?.labels.lifetimeCapBasis).toContain('optimistic');
        expect(row?.labels.tradesPerDay).toBe(
            `Trades per day: ${String(DEFAULT_RULEBOOK.strategy.tradesPerDayMax)} in the eval phase, ${String(DEFAULT_RULEBOOK.funded.tradesPerDayMax)} in the funded phase`,
        );
        expect(row?.labels.horizon).toBe('252 trading days');
    });

    it('states the trades per day of the rulebook as run, with no cap, even above the cash-flow tool cap', () => {
        const rows: PortfolioRows = {
            ...multiSlotRows(),
            rulebook: {
                ...DEFAULT_RULEBOOK,
                funded: { ...DEFAULT_RULEBOOK.funded, tradesPerDayMax: 15 },
                strategy: { ...DEFAULT_RULEBOOK.strategy, tradesPerDayMax: 12 },
            },
        };
        for (const answer of [projectionFigures(), undefined]) {
            const [row] = projectionModelOf(answer, rows).rows;
            expect(row?.labels.tradesPerDay).toBe(
                'Trades per day: 12 in the eval phase, 15 in the funded phase',
            );
            expect(row?.labels.tradesPerDay).not.toContain('capped');
        }
    });

    it('says the timeline books no end-of-horizon credit, unlike expected monthly net, so the two are never confused', () => {
        const model = projectionModelOf(projectionFigures());
        const text = model.disclosures.join(' ');
        expect(text).toContain('no end-of-horizon credit');
        expect(text).toContain('expected monthly net');
        expect(model.rows[0]?.labels.creditBasis).toContain(
            'no end-of-horizon credit',
        );
    });

    it('lists each field the timeline cannot honour with its text', () => {
        const model = projectionModelOf(
            projectionFigures({
                timelineGaps: [
                    DocumentedPolicyTimelineGap.IntradayPathStepsPerR,
                    DocumentedPolicyTimelineGap.RebuyLagDays,
                ],
            }),
        );
        const [row] = model.rows;
        expect(row?.notHonoured).toHaveLength(2);
        expect(row?.notHonoured[0]).toContain('path-walk');
        expect(row?.notHonoured[1]).toContain('rebuy lag');
        const clean = projectionModelOf(projectionFigures());
        expect(clean.rows[0]?.notHonoured).toEqual([]);
    });

    it('says how many accounts were simulated when the plan caps the funded accounts below the active count', () => {
        const model = projectionModelOf(
            projectionFigures({ accountsRequested: 7, accountsSimulated: 5 }),
        );
        expect(model.rows[0]?.accounts).toBe(
            '5 of 7 active accounts simulated (the plan allows at most 5 funded accounts)',
        );
    });

    it('is pending before the worker answers and a plan with no answer shows pending text, not zero', () => {
        const model = projectionModelOf(undefined);
        expect(model.status).toBe(ExpectedNetStatus.Pending);
        const [row] = model.rows;
        expect(row?.finalNet.p50).toBe('Pending');
        expect(row?.result).toBeNull();
    });

    it('is failed with the worker failure text when the worker fails before answering', () => {
        const model = projectionModelOf(
            undefined,
            multiSlotRows(),
            'The background worker failed.',
        );
        expect(model.status).toBe(ExpectedNetStatus.Failed);
        expect(model.statusNote).toContain('The background worker failed.');
    });

    it('lists a refused sizing as a typed refusal row with the engine text and no figures', () => {
        const model = projectionModelOf(
            'one ES contract risks more than your risk',
        );
        expect(model.refused).toEqual([
            {
                key: expect.any(String) as unknown,
                plan: planName(EVAL_PLAN),
                reason: 'one ES contract risks more than your risk',
            },
        ]);
        expect(model.rows[0]?.finalNet.p50).toBe(NOT_APPLICABLE);
        expect(model.rows[0]?.result).toBeNull();
    });

    it('has no plans to project when no plan is held, and waits for the rulebook', () => {
        const none = projectionModelOf(undefined, rowsOf({}));
        expect(none.status).toBe(ExpectedNetStatus.NoPlans);
        const waitingLoad = portfolioLoad({
            ...answered(multiSlotRows()),
            [PortfolioSource.Rulebook]: { data: undefined, error: null },
        });
        const waiting = buildOverview({
            ...inputs(multiSlotRows()),
            load: waitingLoad,
        });
        expect(readyProjection(waiting.projection).status).toBe(
            ExpectedNetStatus.Pending,
        );
    });

    it('is pending while the ledger has not loaded and failed with the missing source when a source failed', () => {
        const pending = buildOverview(
            inputs(
                pinnedRows(),
                queries({
                    [PortfolioSource.Events]: { data: undefined, error: null },
                }),
            ),
        ).projection;
        expect(pending).toEqual({ kind: OverviewSectionStatus.Pending });
        const failedLoad = portfolioLoad(
            queries({
                [PortfolioSource.Events]: {
                    data: undefined,
                    error: new Error('events down'),
                },
            }),
        );
        const failed = buildOverview({
            ...inputs(pinnedRows()),
            load: failedLoad,
        }).projection;
        expect(failed).toMatchObject({ kind: OverviewSectionStatus.Failed });
    });
});

const CONFIRMED_FIRM_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic firm quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const NEEDS_PASTE_FIRM_SOURCE = {
    verification: PolicyVerification.NeedsPaste,
} as const;

const CONFIRMED_SOURCE_TEXT =
    '"a synthetic firm quote" https://example.test/policy, checked 2026-09-01';

const CONFLICTED_FIRM_SOURCE = {
    conflicting: CONFIRMED_FIRM_SOURCE,
    fetchedOn: '2026-09-01',
    quote: 'a synthetic conflicting quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Conflict,
} as const;

class SyntheticFirmPolicy extends FirmAccountPolicy {
    constructor(
        private readonly options: {
            readonly pool?: SharedPoolPolicy;
            readonly triggers?: readonly LiveTransitionTrigger[];
        },
    ) {
        super();
    }

    override capPolicyFor(plan: Plan) {
        return this.options.pool ?? super.capPolicyFor(plan);
    }

    override liveTriggersFor(plan: Plan) {
        return this.options.triggers ?? super.liveTriggersFor(plan);
    }
}

function fundedAccounts(
    entry: PlanEntry,
    count: number,
    overrides: Partial<LedgerAccountRow> = {},
): LedgerAccountRow[] {
    return Array.from({ length: count }, () =>
        account(entry, {
            fundedOn: '2026-09-02',
            stage: AccountStage.Funded,
            ...overrides,
        }),
    );
}

function pooledPolicy(overrides: Partial<SharedPoolPolicy> = {}) {
    return new SyntheticFirmPolicy({
        pool: {
            excludedPlans: [],
            household: false,
            kind: AccountCapPolicyKind.SharedPool,
            members: [EVAL_PLAN.serial, SAME_FIRM_SECOND_EVAL_PLAN.serial],
            poolSize: 5,
            reduction: null,
            subCaps: [],
            ...overrides,
        },
    });
}

function withFirmPolicy<T>(policy: FirmAccountPolicy, run: () => T): T {
    const firm = EVAL_PLAN.firm as { accountPolicy: FirmAccountPolicy };
    const original = firm.accountPolicy;
    firm.accountPolicy = policy;
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('buildOverview pooled cap card', () => {
    it('lists a firm without a verified pool as cap scope unverified and keeps the per-plan disclosure', () => {
        const owned = fundedAccounts(EVAL_PLAN, 1);
        const cards = cardsOf({
            accounts: owned.map(overviewAccount),
            events: owned.map((row) => purchased(row)),
        });
        expect(cards.pooledCaps.unverifiedFirms).toEqual([
            EVAL_PLAN.firm.displayName,
        ]);
        const freeSlots = Math.max(
            0,
            EVAL_PLAN.firm.maxFundedAccounts(EVAL_PLAN.plan) - 1,
        );
        expect(cards.pooledCaps.rows).toEqual([
            expect.objectContaining({
                freeSlots: String(freeSlots),
                key: EVAL_PLAN.serial,
                poolFreeSlots: 'Unverified',
                scope: 'Cap scope unverified',
                used: '1',
            }),
        ]);
        expect(cards.pooledCaps.disclosure).toContain('cap scope unverified');
        expect(cards.capUsage.disclosure).toBe(
            'Caps are counted per plan. Firm-wide pooled caps are not modeled yet, so a firm can stop you sooner than these free slots suggest.',
        );
    });

    it('shows the pool headroom of a verified firm, with no cap scope unverified list, and follows the verified disclosure', () => {
        const owned = [
            ...fundedAccounts(EVAL_PLAN, 4),
            ...fundedAccounts(SAME_FIRM_SECOND_EVAL_PLAN, 1),
        ];
        const cards = withFirmPolicy(pooledPolicy(), () =>
            cardsOf({
                accounts: owned.map(overviewAccount),
                events: owned.map((row) => purchased(row)),
            }),
        );
        expect(cards.pooledCaps.unverifiedFirms).toEqual([]);
        const pooled = new Map(
            cards.pooledCaps.rows.map((row) => [row.key, row]),
        );
        expect(pooled.get(EVAL_PLAN.serial)).toMatchObject({
            freeSlots: '0',
            poolFreeSlots: '0',
            scope: 'Shared pool',
            used: '4',
        });
        expect(pooled.get(SAME_FIRM_SECOND_EVAL_PLAN.serial)).toMatchObject({
            freeSlots: '0',
            poolFreeSlots: '0',
            scope: 'Shared pool',
            used: '1',
        });
        expect(cards.pooledCaps.disclosure).not.toContain(
            'cap scope unverified',
        );
        expect(cards.capUsage.disclosure).toBe(
            'Caps are counted per plan. Firm-wide pools of firms with a verified source are shown in the pooled caps card, which can show fewer free slots than these.',
        );
    });

    it('states which accounts a cap counts, whatever the pool verification', () => {
        const owned = fundedAccounts(EVAL_PLAN, 1);
        const unverified = cardsOf({
            accounts: owned.map(overviewAccount),
            events: owned.map((row) => purchased(row)),
        });
        const verified = withFirmPolicy(pooledPolicy(), () =>
            cardsOf({
                accounts: owned.map(overviewAccount),
                events: owned.map((row) => purchased(row)),
            }),
        );
        for (const cards of [unverified, verified]) {
            expect(cards.pooledCaps.countingNote).toBe(
                'Active and suspended funded accounts count toward a cap; accounts that moved live, ended or archived accounts and accounts held by others in a household do not.',
            );
        }
    });

    it('names a firm whose verified pool is shared across a household, as a disclosure only', () => {
        const owned = fundedAccounts(EVAL_PLAN, 1);
        const cards = withFirmPolicy(pooledPolicy({ household: true }), () =>
            cardsOf({
                accounts: owned.map(overviewAccount),
                events: owned.map((row) => purchased(row)),
            }),
        );
        expect(cards.pooledCaps.householdNote).toBe(
            `${EVAL_PLAN.firm.displayName} counts a household's accounts together; accounts held by others in your household are not in these figures.`,
        );
    });

    it('has no household note when no pool is shared across a household', () => {
        const owned = fundedAccounts(EVAL_PLAN, 1);
        const cards = cardsOf({
            accounts: owned.map(overviewAccount),
            events: owned.map((row) => purchased(row)),
        });
        expect(cards.pooledCaps.householdNote).toBeNull();
    });
});

describe('buildOverview live proximity card', () => {
    it('shows the payouts left before a verified per-account trigger and lists only funded accounts that are still open', () => {
        const [owner, busted] = fundedAccounts(EVAL_PLAN, 2).map(
            (row, index) =>
                index === 1 ? { ...row, status: AccountStatus.Busted } : row,
        );
        if (owner === undefined || busted === undefined)
            throw new Error('rows');
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [
                    new PayoutCountPerAccountTrigger(3, CONFIRMED_FIRM_SOURCE),
                ],
            }),
            () =>
                cardsOf({
                    accounts: [owner, busted].map(overviewAccount),
                    events: [purchased(owner), purchased(busted)],
                    payouts: [
                        payout(owner, 50_000, { paidOn: '2026-09-05' }),
                        payout(owner, 50_000, { paidOn: '2026-09-10' }),
                    ],
                }),
        );
        expect(cards.liveProximity.accounts).toEqual([
            {
                account: owner.label,
                key: owner.id,
                paidPayouts: '2',
                plan: `${EVAL_PLAN.firm.displayName} ${EVAL_PLAN.plan.label}`,
                remaining: '1',
                sourceText: CONFIRMED_SOURCE_TEXT,
                trigger: '3',
            },
        ]);
        expect(cards.liveProximity.firms).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBeNull();
    });

    it('never shows a number for an unverified firm: the firm row says unverified and no account row is listed', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const cards = cardsOf({
            accounts: [overviewAccount(owner)],
            events: [purchased(owner)],
            payouts: [payout(owner, 50_000, { paidOn: '2026-09-05' })],
        });
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.firms).toEqual([
            {
                firm: EVAL_PLAN.firm.displayName,
                isVerified: false,
                key: EVAL_FIRM_KEY,
                paidSinceLastLive: '1',
                remaining: 'Unverified',
                since: 'all time',
                sourceText: 'No confirmed source',
                trigger: 'Unverified',
            },
        ]);
        expect(cards.liveProximity.unlistedNote).toBe(
            '1 funded account is at a firm whose live triggers are unverified, so its distance to going live is not shown.',
        );
    });

    it('lists no row and notes the account when its only count trigger is an unconfirmed per-account one', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [
                    new PayoutCountPerAccountTrigger(3, NEEDS_PASTE_FIRM_SOURCE),
                ],
            }),
            () =>
                cardsOf({
                    accounts: [overviewAccount(owner)],
                    events: [purchased(owner)],
                }),
        );
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.firms).toEqual([]);
        expect(cards.liveProximity.singleDayFacts).toEqual([]);
        expect(cards.liveProximity.openFundedAccounts).toBe(1);
        expect(cards.liveProximity.unlistedNote).toBe(
            '1 funded account is at a firm whose live triggers are unverified, so its distance to going live is not shown.',
        );
    });

    it('notes an open funded ledger-only account whose distance to live is not measured', () => {
        const ledgerOnly = account(EVAL_PLAN, {
            accountSize: 150_000,
            label: 'Ledger only',
            planLabel: 'Rapid 150K',
            planSerial: null,
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const cards = cardsOf({ accounts: [overviewAccount(ledgerOnly)] });
        expect(cards.liveProximity.openFundedAccounts).toBe(0);
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.firms).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBe(
            '1 funded ledger-only account has no modeled plan, so its distance to going live is not measured.',
        );
    });

    it('notes an open funded account whose plan is no longer modeled, and ignores an ended or evaluation ledger-only one', () => {
        const unknown = account(EVAL_PLAN, {
            fundedOn: '2026-09-10',
            label: 'Unknown plan',
            planSerial: 'no-such-plan',
            stage: AccountStage.Funded,
        });
        const endedLedgerOnly = account(EVAL_PLAN, {
            accountSize: 150_000,
            label: 'Ended',
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Funded,
            status: AccountStatus.Busted,
            tracking: AccountTracking.LedgerOnly,
        });
        const evalLedgerOnly = account(EVAL_PLAN, {
            accountSize: 150_000,
            label: 'Evaluation',
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Eval,
            tracking: AccountTracking.LedgerOnly,
        });
        const cards = cardsOf({
            accounts: [unknown, endedLedgerOnly, evalLedgerOnly].map(
                overviewAccount,
            ),
        });
        expect(cards.liveProximity.unlistedNote).toBe(
            '1 funded account has a plan that is no longer modeled, so its distance to going live is not measured.',
        );
    });

    it('joins the unverified-firm note and the unmodeled-account note', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const ledgerOnly = account(OTHER_FIRM_EVAL_PLAN, {
            accountSize: 150_000,
            label: 'Ledger only',
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const cards = cardsOf({
            accounts: [owner, ledgerOnly].map(overviewAccount),
            events: [purchased(owner)],
        });
        expect(cards.liveProximity.unlistedNote).toBe(
            '1 funded account is at a firm whose live triggers are unverified, so its distance to going live is not shown. 1 funded ledger-only account has no modeled plan, so its distance to going live is not measured.',
        );
    });

    it('treats a conflicted trigger as unverified', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [
                    new PayoutCountPerAccountTrigger(3, CONFLICTED_FIRM_SOURCE),
                    new PayoutCountTotalTrigger(10, CONFLICTED_FIRM_SOURCE),
                ],
            }),
            () =>
                cardsOf({
                    accounts: [overviewAccount(owner)],
                    events: [purchased(owner)],
                }),
        );
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.firms[0]).toMatchObject({
            isVerified: false,
            remaining: 'Unverified',
            trigger: 'Unverified',
        });
    });

    it('counts a verified firm total since the latest move live', () => {
        const [owner, other] = fundedAccounts(EVAL_PLAN, 2);
        if (owner === undefined || other === undefined) throw new Error('rows');
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [
                    new PayoutCountTotalTrigger(10, CONFIRMED_FIRM_SOURCE),
                ],
            }),
            () =>
                cardsOf({
                    accounts: [owner, other].map(overviewAccount),
                    events: [
                        purchased(owner),
                        purchased(other),
                        event(owner, AccountEventKind.MovedLive, '2026-09-08'),
                    ],
                    payouts: [
                        payout(other, 50_000, { paidOn: '2026-09-05' }),
                        payout(other, 50_000, { paidOn: '2026-09-12' }),
                        payout(other, 50_000, { paidOn: '2026-09-15' }),
                    ],
                }),
        );
        expect(cards.liveProximity.firms).toEqual([
            {
                firm: EVAL_PLAN.firm.displayName,
                isVerified: true,
                key: EVAL_FIRM_KEY,
                paidSinceLastLive: '2',
                remaining: '8',
                since: '2026-09-08',
                sourceText: CONFIRMED_SOURCE_TEXT,
                trigger: '10',
            },
        ]);
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBeNull();
    });

    it('shows a verified single-day trigger as a fact with its quote and source', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const trigger = new SingleDayProfitTrigger(
            dollars(10_000),
            true,
            false,
            CONFIRMED_FIRM_SOURCE,
        );
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({ triggers: [trigger] }),
            () =>
                cardsOf({
                    accounts: [overviewAccount(owner)],
                    events: [purchased(owner)],
                }),
        );
        expect(cards.liveProximity.firms).toEqual([]);
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBeNull();
        expect(cards.liveProximity.singleDayFacts).toEqual([
            {
                fetchedOn: '2026-09-01',
                firm: EVAL_PLAN.firm.displayName,
                key: `${EVAL_PLAN.serial}-single-day`,
                plan: `${EVAL_PLAN.firm.displayName} ${EVAL_PLAN.plan.label}`,
                quote: 'a synthetic firm quote',
                source: 'https://example.test/policy',
                text: `${cents(1_000_000)} of profit in one day moves the account live automatically`,
            },
        ]);
    });

    it('says nothing is unverified for a firm whose only verified trigger is a firm total: no account row, no note', () => {
        const owners = fundedAccounts(EVAL_PLAN, 2);
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [
                    new PayoutCountTotalTrigger(10, CONFIRMED_FIRM_SOURCE),
                ],
            }),
            () =>
                cardsOf({
                    accounts: owners.map(overviewAccount),
                    events: owners.map((row) => purchased(row)),
                }),
        );
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBeNull();
        expect(cards.liveProximity.firms).toHaveLength(1);
        expect(cards.liveProximity.firms[0]).toMatchObject({
            isVerified: true,
            remaining: '10',
            trigger: '10',
        });
    });

    it('shows no unverified firm row for a firm whose only verified trigger is per account', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [
                    new PayoutCountPerAccountTrigger(3, CONFIRMED_FIRM_SOURCE),
                ],
            }),
            () =>
                cardsOf({
                    accounts: [overviewAccount(owner)],
                    events: [purchased(owner)],
                }),
        );
        expect(cards.liveProximity.firms).toEqual([]);
        expect(cards.liveProximity.accounts).toHaveLength(1);
        expect(cards.liveProximity.unlistedNote).toBeNull();
    });

    it('does not call a firm unverified when its only verified trigger is a single-day profit', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const singleDayTrigger = new SingleDayProfitTrigger(
            dollars(10_000),
            true,
            false,
            CONFIRMED_FIRM_SOURCE,
        );
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [singleDayTrigger],
            }),
            () =>
                cardsOf({
                    accounts: [overviewAccount(owner)],
                    events: [purchased(owner)],
                }),
        );
        expect(cards.liveProximity.firms).toEqual([]);
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBeNull();
        expect(cards.liveProximity.singleDayFacts).toHaveLength(1);
    });

    it('does not call a firm unverified for a verified discretionary trigger', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [new DiscretionaryTrigger(CONFIRMED_FIRM_SOURCE)],
            }),
            () =>
                cardsOf({
                    accounts: [overviewAccount(owner)],
                    events: [purchased(owner)],
                }),
        );
        expect(cards.liveProximity.firms).toEqual([]);
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBeNull();
        expect(cards.liveProximity.openFundedAccounts).toBe(1);
    });

    it('says a verified cumulative payout trigger is not measured here instead of dropping it silently', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const cumulativeTrigger = new CumulativeAmountTrigger(
            dollars(100_000),
            CONFIRMED_FIRM_SOURCE,
        );
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({ triggers: [cumulativeTrigger] }),
            () =>
                cardsOf({
                    accounts: [overviewAccount(owner)],
                    events: [purchased(owner)],
                }),
        );
        expect(cards.liveProximity.firms).toEqual([]);
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBeNull();
        expect(cards.liveProximity.unmeasuredNote).toBe(
            `${EVAL_PLAN.firm.displayName} ${EVAL_PLAN.plan.label} has a verified cumulative payout trigger of ${cents(10_000_000)} that this card does not measure.`,
        );
    });

    it('still lists a trigger that is present but unconfirmed as unverified', () => {
        const [owner] = fundedAccounts(EVAL_PLAN, 1);
        if (owner === undefined) throw new Error('rows');
        const cards = withFirmPolicy(
            new SyntheticFirmPolicy({
                triggers: [
                    new PayoutCountPerAccountTrigger(
                        3,
                        NEEDS_PASTE_FIRM_SOURCE,
                    ),
                ],
            }),
            () =>
                cardsOf({
                    accounts: [overviewAccount(owner)],
                    events: [purchased(owner)],
                }),
        );
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBe(
            '1 funded account is at a firm whose live triggers are unverified, so its distance to going live is not shown.',
        );
    });

    it('states what each number counts: paid payouts only, a firm total that restarts at the latest move live, and no household', () => {
        const cards = cardsOf({ accounts: [] });
        expect(cards.liveProximity.disclosure).toContain(
            'Only paid payouts are counted',
        );
        expect(cards.liveProximity.disclosure).toContain(
            'after your latest move live',
        );
        expect(cards.liveProximity.disclosure).toContain('household');
        expect(cards.liveProximity.openFundedAccounts).toBe(0);
    });

    it('has no rows and no note when there is no funded account', () => {
        const cards = cardsOf({
            accounts: [overviewAccount(account(EVAL_PLAN))],
        });
        expect(cards.liveProximity.accounts).toEqual([]);
        expect(cards.liveProximity.unlistedNote).toBeNull();
    });
});


function accountFromStateFigures(
    overrides: Partial<AccountFromStateFigures> = {},
): AccountFromStateFigures {
    return {
        milestone: {
            debited: 1000,
            kind: MilestoneKind.Funded,
            received: 800,
            unmetGates: [],
            value: {
                kind: ValueChainStepOutcomeKind.Value,
                value: valueFigure(2500, 90),
            },
        },
        nextPayout: {
            accountLostBeforeFirstPayoutProbability: 0.04,
            accountLostBeforeFirstPayoutStandardError: 0.0044,
            expectedCalendarDaysToFirstPayout: { standardError: 0.5, value: 14 },
            expectedResetFeeBeforeFirstPayout: { standardError: 3, value: 12 },
            expectedSessionDaysToFirstPayout: { standardError: 0.4, value: 10 },
            firstPayoutCausedBreachProbability: 0.02,
            firstPayoutCausedBreachStandardError: 0.003,
            payingTrials: 1800,
            trials: 2000,
        },
        stage: SizingStage.Funded,
        startBasis: StartBasis.FromState,
        trials: 2000,
        valueNow: valueFigure(1800, 70),
        ...overrides,
    };
}

function activeEvalFixture(label = 'Eval account') {
    const owner = account(EVAL_PLAN, { label, purchasedOn: '2026-09-01' });
    const start = EVAL_PLAN.plan.accountSize;
    return {
        owner,
        row: overviewAccount(owner),
        snapshot: snapshotRow(owner, {
            asOf: TODAY,
            balanceCents: usdCents(Math.round((start + 600) * CENTS_PER_DOLLAR)),
            createdAt: new Date('2026-09-25T00:00:00Z'),
            dashboardFloorCents: null,
            highestEodBalanceCents: usdCents(
                Math.round((start + 600) * CENTS_PER_DOLLAR),
            ),
            highestIntradayBalanceCents: usdCents(
                Math.round((start + 600) * CENTS_PER_DOLLAR),
            ),
            tradingDays: 3,
        }),
    };
}

function fromStateInputs(
    rows: Partial<PortfolioRows>,
    answer: AccountFromStateFigures | string | undefined,
    failure: null | string = null,
): OverviewInputs {
    const load = portfolioLoad(answered(rowsOf(rows)));
    const outcomes = new Map<string, OverviewOutcome>();
    for (const request of overviewAccountRequestsOf(load, USER_ID, TODAY)) {
        if (answer === undefined) continue;
        const key = overviewRequestKey(request);
        outcomes.set(
            key,
            typeof answer === 'string'
                ? { key, kind: OverviewOutcomeKind.Failed, reason: answer }
                : {
                      key,
                      kind: OverviewOutcomeKind.Succeeded,
                      result: {
                          figures: answer,
                          kind: OverviewRequestKind.AccountFromState,
                      },
                  },
        );
    }
    return { ...inputs(rows), engine: { failure, outcomes } };
}

function readyFromStateView(
    rows: Partial<PortfolioRows>,
    answer: AccountFromStateFigures | string | undefined,
    failure: null | string = null,
) {
    const model = readyNextPayout(
        buildOverview(fromStateInputs(rows, answer, failure)).nextPayout,
    );
    const [row] = model.rows;
    if (row === undefined) throw new Error('expected a next payout row');
    return { model, row };
}

function readyNextPayout(nextPayout: OverviewNextPayout) {
    if (nextPayout.kind !== OverviewSectionStatus.Ready) {
        throw new Error(`next payout not ready: ${nextPayout.kind}`);
    }
    return nextPayout.model;
}

function valueFigure(amount: number, standardError: number) {
    return {
        creditFree: { standardError, value: amount },
        creditInclusive: { standardError, value: amount + 150 },
        kind: ValueResultKind.Value as const,
        seed: 42,
        trials: 2000,
    };
}

describe('overviewAccountRequestsOf (PT-37, F-87)', () => {
    it('plans one from-state request per active funded or eval account carrying its snapshot input and only the spec', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const evalAccount = activeEvalFixture();
        const rows = {
            accounts: [funded.row, evalAccount.row],
            snapshots: [funded.snapshot, evalAccount.snapshot],
        };
        const load = portfolioLoad(answered(rowsOf(rows)));
        const requests = overviewAccountRequestsOf(load, USER_ID, TODAY);
        expect(requests).toHaveLength(2);
        for (const request of requests) {
            expect(request.kind).toBe(OverviewRequestKind.AccountFromState);
            expect(request.spec.start).toBeUndefined();
            expect(request.spec.rulebook).toEqual(DEFAULT_RULEBOOK);
            expect(request.account?.asOf).toBe(TODAY);
            expect(structuredClone(request)).toEqual(request);
        }
        const stages = requests.map((request) => request.account?.stage);
        expect(stages).toContain(SizingStage.Funded);
        expect(stages).toContain(SizingStage.Eval);
        const fundedRequest = requests.find(
            (request) => request.account?.stage === SizingStage.Funded,
        );
        expect(fundedRequest?.account?.balance).toBeCloseTo(
            funded.threshold + 1800,
            6,
        );
        expect(fundedRequest?.planSerial).toBe(mffProEntry().serial);
    });

    it('carries the measured rebuy lag of the plan into the from-state policy, the same lag the documented run of that plan carries', () => {
        const entry = mffProEntry();
        const old = account(entry, {
            fundedOn: '2026-06-01',
            label: 'Old',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
            status: AccountStatus.Busted,
        });
        const funded = mffFundedAccount('Replacement', 1800);
        const replacement = {
            ...funded.owner,
            replacesAccountId: old.id,
        };
        const rows = rowsOf({
            accounts: [
                overviewAccount(old),
                {
                    ...funded.row,
                    replacesAccountId: old.id,
                },
            ],
            events: [
                purchased(old),
                event(old, AccountEventKind.EvalPassed, '2026-06-01'),
                event(old, AccountEventKind.Busted, '2026-07-02'),
                purchased(replacement),
                event(replacement, AccountEventKind.EvalPassed, '2026-08-01'),
            ],
            snapshots: [funded.snapshot],
        });
        const measured = rebuyLagDefault(
            replacementStats(PortfolioLedger.fromRows(USER_ID, rows)),
            entry.serial,
        );
        expect(measured.basis).toBe(RebuyLagBasis.Measured);
        const load = portfolioLoad(answered(rows));
        const [request] = overviewAccountRequestsOf(load, USER_ID, TODAY);
        expect(request?.spec.enginePolicy.rebuyLagBasis).toBe(
            RebuyLagBasis.Measured,
        );
        expect(request?.spec.enginePolicy.rebuyLagDays).toBe(measured.days);
        const documented = overviewEngineRequestsOf(load, USER_ID).find(
            (candidate) => candidate.kind === OverviewRequestKind.DocumentedRun,
        );
        expect(request?.spec.enginePolicy).toEqual(
            documented?.spec.enginePolicy,
        );
    });

    it('carries the same engine policy as the documented-run request of the same plan', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const load = portfolioLoad(
            answered(
                rowsOf({
                    accounts: [funded.row],
                    snapshots: [funded.snapshot],
                }),
            ),
        );
        const [request] = overviewAccountRequestsOf(load, USER_ID, TODAY);
        const documented = overviewEngineRequestsOf(load, USER_ID).find(
            (candidate) => candidate.kind === OverviewRequestKind.DocumentedRun,
        );
        expect(request?.spec).toEqual(documented?.spec);
    });

    it('plans nothing for an ended, archived, snapshotless or unreconstructable account', () => {
        const busted = mffFundedAccount('Busted', 1800);
        const archived = mffFundedAccount('Archived', 1800);
        const noSnapshot = mffFundedAccount('No snapshot', 1800);
        const noPeak = mffFundedAccount('No peak', 1800);
        const rows = {
            accounts: [
                { ...busted.row, status: AccountStatus.Busted },
                { ...archived.row, archivedAt: new Date('2026-09-01') },
                noSnapshot.row,
                noPeak.row,
            ],
            snapshots: [
                busted.snapshot,
                archived.snapshot,
                {
                    ...noPeak.snapshot,
                    highestEodBalanceCents: null,
                    highestIntradayBalanceCents: null,
                },
            ],
        };
        const load = portfolioLoad(answered(rowsOf(rows)));
        expect(overviewAccountRequestsOf(load, USER_ID, TODAY)).toEqual([]);
    });

    it('plans nothing for a ledger-only account or an account that is already live', () => {
        const live = mffFundedAccount('Live', 1800);
        const rows = {
            accounts: [{ ...live.row, stage: AccountStage.Live }],
            snapshots: [live.snapshot],
        };
        const load = portfolioLoad(answered(rowsOf(rows)));
        expect(overviewAccountRequestsOf(load, USER_ID, TODAY)).toEqual([]);
    });

    it('plans nothing while the accounts, the ledger or the rulebook has not loaded', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const base = {
            accounts: [funded.row],
            snapshots: [funded.snapshot],
        };
        const noEvents = portfolioLoad({
            ...answered(rowsOf(base)),
            [PortfolioSource.Events]: { data: undefined, error: null },
        });
        expect(overviewAccountRequestsOf(noEvents, USER_ID, TODAY)).toEqual([]);
        const noRulebook = portfolioLoad({
            ...answered(rowsOf(base)),
            [PortfolioSource.Rulebook]: { data: undefined, error: null },
        });
        expect(overviewAccountRequestsOf(noRulebook, USER_ID, TODAY)).toEqual(
            [],
        );
    });

    it('keys each request per account state: two accounts in different states are two requests, identical states are one', () => {
        const low = mffFundedAccount('Low', 1800);
        const high = mffFundedAccount('High', 1500);
        const twin = mffFundedAccount('Twin', 1800);
        const load = portfolioLoad(
            answered(
                rowsOf({
                    accounts: [low.row, high.row, twin.row],
                    snapshots: [low.snapshot, high.snapshot, twin.snapshot],
                }),
            ),
        );
        const requests = overviewAccountRequestsOf(load, USER_ID, TODAY);
        expect(requests).toHaveLength(2);
        expect(
            new Set(requests.map((request) => overviewRequestKey(request)))
                .size,
        ).toBe(2);
    });
});

describe('buildOverview next payout card (PT-37, F-87, F-88)', () => {
    it('is pending until the accounts and the ledger have loaded', () => {
        const load = portfolioLoad({
            ...answered(rowsOf({})),
            [PortfolioSource.Accounts]: { data: undefined, error: null },
        });
        const model = buildOverview({ ...inputs({}), load });
        expect(model.nextPayout).toEqual({
            kind: OverviewSectionStatus.Pending,
        });
    });

    it('lists each active modeled account with a pending view until the engine answers', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const { row } = readyFromStateView(
            { accounts: [funded.row], snapshots: [funded.snapshot] },
            undefined,
        );
        expect(row.label).toBe('Funded');
        expect(row.plan).toContain('Pro');
        expect(row.view).toEqual({ kind: AccountFromStateViewKind.Pending });
    });

    it('reads the from-state value as credit-free with the credit-inclusive figure separate, both with their standard errors, labelled from state with its trials', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const { row } = readyFromStateView(
            { accounts: [funded.row], snapshots: [funded.snapshot] },
            accountFromStateFigures(),
        );
        if (row.view.kind !== AccountFromStateViewKind.Ready) {
            throw new Error('expected a ready view');
        }
        const { model } = row.view;
        expect(model.value.creditFree).toBe('$1,800 (SE $70)');
        expect(model.value.creditInclusive).toBe('$1,950 (SE $70)');
        expect(model.trials).toBe('2,000 trials');
        expect(model.startBasis).toContain('From the account state');
        expect(model.startBasis).toContain(TODAY);
        expect(model.startBasis.toLowerCase()).toContain('not a fresh start');
        expect(model.creditBasis).toContain('credit-free');
        expect(model.creditBasis).toContain('credit-inclusive');
    });

    it('shows the next payout projection with days, the chance of losing the account first and the breach at the first payout, each with its standard error', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const { row } = readyFromStateView(
            { accounts: [funded.row], snapshots: [funded.snapshot] },
            accountFromStateFigures(),
        );
        if (row.view.kind !== AccountFromStateViewKind.Ready) {
            throw new Error('expected a ready view');
        }
        const { nextPayout } = row.view.model;
        expect(nextPayout?.calendarDays).toBe('14.0 calendar days (SE 0.5)');
        expect(nextPayout?.sessionDays).toBe('10.0 sessions (SE 0.4)');
        expect(nextPayout?.accountLostBeforePayout).toBe(
            `${formatPercent(0.04)} (SE ${formatPercent(0.0044)})`,
        );
        expect(nextPayout?.breachAtFirstPayout).toBe(
            `${formatPercent(0.02)} (SE ${formatPercent(0.003)})`,
        );
        expect(nextPayout?.resetFee).toBe('$12 (SE $3)');
        expect(nextPayout?.payingTrials).toBe(
            '1,800 of 2,000 trials reached a payout',
        );
    });

    it('says no trial reached a payout instead of showing zero days when none did', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const { row } = readyFromStateView(
            { accounts: [funded.row], snapshots: [funded.snapshot] },
            accountFromStateFigures({
                nextPayout: {
                    accountLostBeforeFirstPayoutProbability: 0.3,
                    accountLostBeforeFirstPayoutStandardError: 0.01,
                    expectedCalendarDaysToFirstPayout: {
                        standardError: null,
                        value: 0,
                    },
                    expectedResetFeeBeforeFirstPayout: {
                        standardError: null,
                        value: 0,
                    },
                    expectedSessionDaysToFirstPayout: {
                        standardError: null,
                        value: 0,
                    },
                    firstPayoutCausedBreachProbability: null,
                    firstPayoutCausedBreachStandardError: null,
                    payingTrials: 0,
                    trials: 2000,
                },
            }),
        );
        if (row.view.kind !== AccountFromStateViewKind.Ready) {
            throw new Error('expected a ready view');
        }
        const { nextPayout } = row.view.model;
        expect(nextPayout?.calendarDays).toContain('No simulated trial');
        expect(nextPayout?.sessionDays).toContain('No simulated trial');
        expect(nextPayout?.breachAtFirstPayout).toContain('No simulated trial');
        expect(nextPayout?.calendarDays).not.toContain('0.0');
        expect(nextPayout?.payingTrials).toBe(
            '0 of 2,000 trials reached a payout',
        );
    });

    it('says the account is eligible now when the engine finds it already eligible', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const zero = { standardError: 0, value: 0 };
        const { row } = readyFromStateView(
            { accounts: [funded.row], snapshots: [funded.snapshot] },
            accountFromStateFigures({
                nextPayout: {
                    accountLostBeforeFirstPayoutProbability: 0,
                    accountLostBeforeFirstPayoutStandardError: 0,
                    expectedCalendarDaysToFirstPayout: zero,
                    expectedResetFeeBeforeFirstPayout: zero,
                    expectedSessionDaysToFirstPayout: zero,
                    firstPayoutCausedBreachProbability: 0,
                    firstPayoutCausedBreachStandardError: 0,
                    payingTrials: 2000,
                    trials: 2000,
                },
            }),
        );
        if (row.view.kind !== AccountFromStateViewKind.Ready) {
            throw new Error('expected a ready view');
        }
        expect(row.view.model.nextPayout?.calendarDays).toBe(
            'Already eligible now',
        );
    });

    it('shows the milestone value with the cash received counted in it, the credit-free gain with its standard error, and the payout debited for a funded account', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const { row } = readyFromStateView(
            { accounts: [funded.row], snapshots: [funded.snapshot] },
            accountFromStateFigures(),
        );
        if (row.view.kind !== AccountFromStateViewKind.Ready) {
            throw new Error('expected a ready view');
        }
        const { milestone } = row.view.model;
        expect(milestone.kind).toBe(MilestoneKind.Funded);
        expect(milestone.value).toEqual({
            creditFree: '$2,500 (SE $90)',
            creditInclusive: '$2,650 (SE $90)',
            gain: `+$700 (SE $${Math.round(Math.hypot(70, 90))})`,
            kind: MilestoneValueViewKind.Value,
        });
        expect(milestone.debited).toBe('$1,000');
        expect(milestone.received).toBe('$800');
        expect(milestone.label.toLowerCase()).toContain('payout');
        expect(milestone.label.toLowerCase()).toContain('cash');
    });

    it('says the account cannot be valued after the next payout request, with the reason and no gain, while still showing the value now and the next payout', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const { row } = readyFromStateView(
            { accounts: [funded.row], snapshots: [funded.snapshot] },
            accountFromStateFigures({
                milestone: {
                    debited: 500,
                    kind: MilestoneKind.Funded,
                    received: 400,
                    unmetGates: [],
                    value: {
                        kind: ValueChainStepOutcomeKind.Unavailable,
                        reason: 'the funded account is already busted',
                    },
                },
            }),
        );
        if (row.view.kind !== AccountFromStateViewKind.Ready) {
            throw new Error('expected a ready view');
        }
        const { milestone, nextPayout, value } = row.view.model;
        expect(milestone.value).toEqual({
            kind: MilestoneValueViewKind.Unavailable,
            text: 'The account cannot be valued after the next payout request: the funded account is already busted',
        });
        expect(milestone.debited).toBe('$500');
        expect(value.creditFree).toBe('$1,800 (SE $70)');
        expect(nextPayout).not.toBeNull();
    });

    it('names the unmet eval gates at the milestone and has no next payout for an eval account', () => {
        const evalAccount = activeEvalFixture();
        const { row } = readyFromStateView(
            { accounts: [evalAccount.row], snapshots: [evalAccount.snapshot] },
            accountFromStateFigures({
                milestone: {
                    debited: null,
                    kind: MilestoneKind.Eval,
                    received: null,
                    unmetGates: [EvalMilestoneGap.ConsistencyNotMet],
                    value: {
                        kind: ValueChainStepOutcomeKind.Value,
                        value: {
                            creditFree: { standardError: 0, value: 700 },
                            creditInclusive: { standardError: 0, value: 700 },
                            kind: ValueResultKind.Value,
                            seed: 42,
                            trials: 2000,
                        },
                    },
                },
                nextPayout: null,
                stage: SizingStage.Eval,
            }),
        );
        if (row.view.kind !== AccountFromStateViewKind.Ready) {
            throw new Error('expected a ready view');
        }
        const { milestone } = row.view.model;
        expect(row.view.model.nextPayout).toBeNull();
        expect(milestone.debited).toBeNull();
        expect(milestone.received).toBeNull();
        expect(milestone.gates).toHaveLength(1);
        expect(milestone.gates[0]?.toLowerCase()).toContain('consistency');
        if (milestone.value.kind !== MilestoneValueViewKind.Value) {
            throw new Error('expected a milestone value');
        }
        expect(milestone.value.gain.startsWith('-')).toBe(true);
    });

    it('turns a refused sizing into a typed refused row with the engine text, and an engine failure into a failed one', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const rows = { accounts: [funded.row], snapshots: [funded.snapshot] };
        const refused = readyFromStateView(rows, 'the stop is too wide');
        expect(refused.row.view).toEqual({
            kind: AccountFromStateViewKind.Refused,
            reason: 'the stop is too wide',
        });
        const failed = readyFromStateView(rows, undefined, 'workers are down');
        expect(failed.row.view).toEqual({
            kind: AccountFromStateViewKind.Failed,
            reason: 'workers are down',
        });
    });

    it('never merges the from-state figures into the fresh-start projection: the projection model is the same with or without them, and says where the from-state figures are', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const rows = { accounts: [funded.row], snapshots: [funded.snapshot] };
        const without = buildOverview(inputs(rows)).projection;
        const withFromState = buildOverview(
            fromStateInputs(rows, accountFromStateFigures()),
        ).projection;
        expect(withFromState).toEqual(without);
        const model = readyProjection(withFromState);
        expect(
            model.disclosures.some((text) =>
                text.toLowerCase().includes('never merged'),
            ),
        ).toBe(true);
    });

    it('keys the from-state request apart from every fresh-start request of the plan', () => {
        const funded = mffFundedAccount('Funded', 1800);
        const load = portfolioLoad(
            answered(
                rowsOf({
                    accounts: [funded.row],
                    snapshots: [funded.snapshot],
                }),
            ),
        );
        const fresh = [
            ...overviewEngineRequestsOf(load, USER_ID),
            ...overviewProjectionRequestsOf(load, USER_ID),
        ].map((request) => overviewRequestKey(request));
        const [request] = overviewAccountRequestsOf(load, USER_ID, TODAY);
        expect(request).toBeDefined();
        if (request === undefined) return;
        expect(fresh).not.toContain(overviewRequestKey(request));
    });
});
