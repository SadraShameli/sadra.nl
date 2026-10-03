import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import {
    type AccountFromStateFigures,
    type DocumentedRunFigures,
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsKey,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { type AccountListAccount } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { OverviewView } from '~/app/(app)/prop-calculator/accounts/_components/overview/OverviewView';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    BankrollTransferKind,
    DashboardBalanceConvention,
    FeeKind,
    type LedgerAccountRow,
    type LedgerEventRow,
    type LedgerFeeRow,
    type LedgerPayoutRow,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, serializePlanId } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    MilestoneKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import {
    PropLimitRejection,
    PropRecord,
    type PropRejection,
    PropStoredRecordRejection,
} from '~/lib/schemas/propAccountOutputs';
import { routes } from '~/lib/site/routes';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

type OverviewAccount = AccountListAccount & LedgerAccountRow;

const TODAY = '2026-09-26';
const USER_ID = 'user-a';

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const queryCalls: string[] = [];
    const mutate = vi.fn();
    const invalidate = vi.fn(() => Promise.resolve());
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        invalidate,
        mutate,
        mutation: () => ({
            useMutation: () => ({ isPending: false, mutate }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => {
                queryCalls.push(name);
                return queries.get(name) ?? pending;
            },
        }),
        queryCalls,
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                archive: harness.mutation(),
                get: harness.query('account.get'),
                list: harness.query('account.list'),
                remove: harness.mutation(),
                unarchive: harness.mutation(),
            },
            bankroll: { list: harness.query('bankroll.list') },
            copyGroup: { list: harness.query('copyGroup.list') },
            decision: { list: harness.query('decision.list') },
            edge: { summary: harness.query('edge.summary') },
            event: { list: harness.query('event.list') },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: { list: harness.query('fee.list') },
            firmEngagement: { list: harness.query('firmEngagement.list') },
            firmStatement: { list: harness.query('firmStatement.list') },
            payout: { list: harness.query('payout.list') },
            round: { list: harness.query('round.list') },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                latestForAll: harness.query('snapshot.latestForAll'),
                latestTwoForAll: harness.query('snapshot.latestTwoForAll'),
            },
            violation: { list: harness.query('violation.list') },
        },
        useUtils: () => ({
            propAccounts: {
                account: {
                    get: { cancel: harness.invalidate },
                    invalidate: harness.invalidate,
                },
                invalidate: harness.invalidate,
            },
        }),
    },
}));

const { firm, plan } = firstEvalPlan();

const CARD_HEADINGS = [
    'Setup checklist',
    'Key figures',
    'Bankroll',
    'Firms',
    'Alerts',
    'Cushion board',
    'Payout readiness',
    'Exposure',
    'Profit concentration',
    'Rule violations',
    'Data notes',
    'Expected net',
    'Where EV comes from',
    'Fresh-start projection',
    "Next payout and value from today's state",
    'Plan cap usage',
    'Pooled caps',
    'Live proximity',
    'Stage funnel',
    'Tilt vs variance',
    'Diversification',
    'Costs',
    'Firm returns',
    'Realized outcomes',
    'Payout sizes',
    'Payouts per funded account',
    'Your attempt economics',
    'Replacement',
    'Monthly statement',
    'Attempt throughput',
    'Repeatability',
    'Payout timing',
    'Timeline',
];

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(accounts: readonly OverviewAccount[]) {
    const events: LedgerEventRow[] = accounts.map((row) => ({
        accountId: row.id,
        createdAt: new Date(`${row.purchasedOn}T12:00:00Z`),
        id: `event-${row.id}`,
        kind: AccountEventKind.Purchased,
        occurredOn: row.purchasedOn,
        userId: USER_ID,
    }));
    const fees: LedgerFeeRow[] = accounts.map((row) => ({
        accountId: row.id,
        amountCents: usdCents(15_000),
        id: `fee-${row.id}`,
        kind: FeeKind.EvalPurchase,
        paidOn: row.purchasedOn,
        userId: USER_ID,
    }));
    harness.queries.set('account.list', answer(accounts));
    harness.queries.set('bankroll.list', answer([]));
    harness.queries.set('copyGroup.list', answer([]));
    harness.queries.set('decision.list', answer([]));
    harness.queries.set('edge.summary', answer({ summary: { sampleSize: 0 } }));
    harness.queries.set('event.list', answer(events));
    harness.queries.set('fee.list', answer(fees));
    harness.queries.set('firmEngagement.list', answer([]));
    harness.queries.set('firmStatement.list', answer([]));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('round.list', answer([]));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('snapshot.latestForAll', answer([]));
    harness.queries.set('snapshot.latestTwoForAll', answer([]));
    harness.queries.set('violation.list', answer([]));
}

function answerWithSnapshot(alpha: OverviewAccount) {
    answerEverything([alpha]);
    const balanceCents = usdCents(
        Math.round((plan.id.accountSize + 1000) * 100),
    );
    const snapshots = answer([
        {
            accountId: alpha.id,
            asOf: TODAY,
            balanceAtLastPayoutCents: null,
            balanceCents,
            createdAt: new Date(`${TODAY}T00:00:00Z`),
            cumulativePayoutCents: null,
            cycleBestDayProfitCents: null,
            dashboardFloorCents: null,
            evalBestDayProfitCents: null,
            floorAtLastPayoutCents: null,
            highestEodBalanceCents: balanceCents,
            highestIntradayBalanceCents: balanceCents,
            id: `snapshot-${alpha.id}`,
            lastPayoutOn: null,
            lastTradedOn: null,
            payoutsTaken: null,
            qualifyingDaysSinceLastPayout: null,
            tradingDays: 5,
            userId: USER_ID,
        },
    ]);
    harness.queries.set('snapshot.latestForAll', snapshots);
    harness.queries.set('snapshot.latestTwoForAll', snapshots);
}

function documentedFigures(): DocumentedRunFigures {
    return {
        anyPayoutGivenFundedProbability: {
            standardError: 0.01,
            value: 0.4,
        },
        attemptPassProbability: { standardError: 0.02, value: 0.3 },
        costPerAttempt: { standardError: 1, value: 120 },
        costPerFundedAccount: 777,
        expectedMonthlyNet: { standardError: 11, value: 1234 },
        expectedMonthlyRealizedNet: { standardError: 9, value: 1111 },
        expectedNetPerAttempt: { standardError: 5, value: 55 },
        expectedPayoutPerFundedAccount: {
            standardError: 20,
            value: 900,
        },
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
    };
}

function eligibleNowFigures(): AccountFromStateFigures {
    const value = {
        creditFree: { standardError: 70, value: 1800 },
        creditInclusive: { standardError: 70, value: 1950 },
        kind: ValueResultKind.Value as const,
        seed: 42,
        trials: 2000,
    };
    return {
        milestone: {
            debited: 1000,
            kind: MilestoneKind.Funded,
            received: 400,
            unmetGates: [],
            value: { kind: ValueChainStepOutcomeKind.Value, value },
        },
        nextPayout: {
            accountLostBeforeFirstPayoutProbability: 0,
            accountLostBeforeFirstPayoutStandardError: 0,
            alreadyEligible: true,
            expectedCalendarDaysToFirstPayout: { standardError: 0, value: 0 },
            expectedResetFeeBeforeFirstPayout: { standardError: 0, value: 0 },
            expectedSessionDaysToFirstPayout: { standardError: 0, value: 0 },
            firstPayoutCausedBreachProbability: 0,
            firstPayoutCausedBreachStandardError: 0,
            payingTrials: 2000,
            trials: 2000,
        },
        stage: SizingStage.Funded,
        startBasis: StartBasis.FromState,
        trials: 2000,
        valueNow: value,
    };
}

function evalSnapshotRow(
    accountId: string,
    asOf: string,
    balanceCents: ReturnType<typeof usdCents>,
    tradingDays: number,
) {
    return {
        accountId,
        asOf,
        balanceAtLastPayoutCents: null,
        balanceCents,
        createdAt: new Date(`${asOf}T00:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(
            Math.round((plan.id.accountSize + 600) * 100),
        ),
        highestIntradayBalanceCents: usdCents(
            Math.round((plan.id.accountSize + 600) * 100),
        ),
        id: `snapshot-${asOf}-${accountId}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays,
        userId: USER_ID,
    };
}

function failure(message: string, propRejection?: PropRejection): FakeQuery {
    return {
        data: undefined,
        error:
            propRejection === undefined
                ? new Error(message)
                : Object.assign(new Error(message), {
                      data: { propRejection },
                  }),
        isError: true,
        isPending: false,
    };
}

function firstEvalPlan() {
    for (const candidate of ALL_FIRMS) {
        const found = candidate.plans.find((entry) => !entry.isInstantFunded);
        if (found !== undefined) return { firm: candidate, plan: found };
    }
    throw new Error('no eval plan');
}

function heldFundedAccount(): OverviewAccount {
    return overviewAccount('alpha', {
        fundedOn: '2026-09-05',
        purchasedOn: '2026-06-01',
        stage: AccountStage.Funded,
    });
}

function overviewAccount(
    id: string,
    overrides: Partial<OverviewAccount> = {},
): OverviewAccount {
    return {
        accountSize: plan.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: firm.id,
        firstFundedTradeOn: null,
        fundedOn: null,
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        planLabel: null,
        planSerial: serializePlanId(plan.id),
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
        ...overrides,
    };
}

function purchasedEventOf(row: OverviewAccount): LedgerEventRow {
    return {
        accountId: row.id,
        createdAt: new Date(`${row.purchasedOn}T12:00:00Z`),
        id: `event-${row.id}`,
        kind: AccountEventKind.Purchased,
        occurredOn: row.purchasedOn,
        userId: USER_ID,
    };
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

function renderWithCache(root: Root, cache: ComputationCache) {
    act(() => {
        root.render(
            <ComputationCacheContext.Provider value={cache}>
                <OverviewView userId={USER_ID} />
            </ComputationCacheContext.Provider>,
        );
    });
}

async function settle() {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });
    });
}

function sortedText(values: readonly string[]): string {
    return values
        .toSorted((left, right) => left.localeCompare(right))
        .join('+');
}

describe('OverviewView', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<OverviewView userId={USER_ID} />);
        });
    }

    function labelledSections(): HTMLElement[] {
        return [
            ...container.querySelectorAll<HTMLElement>(
                'section[aria-labelledby]',
            ),
        ];
    }

    function headingOf(section: HTMLElement): HTMLElement | null {
        const id = section.getAttribute('aria-labelledby') ?? '';
        return container.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    }

    function sectionNamed(title: string): HTMLElement | undefined {
        return labelledSections().find(
            (section) => headingOf(section)?.textContent === title,
        );
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.mutate.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('renders one h1 and an h2 per card, each section labelled by its heading, with the accounts table as the accounts section', () => {
        answerEverything([
            overviewAccount('alpha'),
            overviewAccount('unknown', { planSerial: 'no-such-plan' }),
        ]);
        render();
        expect(container.querySelectorAll('h1')).toHaveLength(1);
        expect(container.querySelector('h1')?.textContent).toBe(
            'Prop accounts',
        );
        const sections = labelledSections();
        const headings = sections.map((section) => headingOf(section));
        expect(headings.every((heading) => heading?.tagName === 'H2')).toBe(
            true,
        );
        expect(container.querySelectorAll('h2')).toHaveLength(sections.length);
        expect(headings.map((heading) => heading?.textContent)).toEqual([
            ...CARD_HEADINGS,
            'Accounts',
        ]);
        expect(sections.at(-1)?.getAttribute('aria-labelledby')).toBe(
            'prop-accounts-list-heading',
        );
        expect(container.textContent).toContain(
            'Account events are loaded for the last 3 years only',
        );
        expect(container.textContent).toContain('Unresolvable plan');
    });

    it('mounts the payout timing card after the repeatability card, as a named focusable region with its rows', () => {
        const alpha = overviewAccount('alpha', {
            fundedOn: '2026-08-01',
            purchasedOn: '2026-06-01',
            stage: AccountStage.Funded,
        });
        answerEverything([alpha]);
        harness.queries.set(
            'payout.list',
            answer([
                {
                    accountId: alpha.id,
                    approvedOn: null,
                    grossCents: usdCents(30_000),
                    id: 'payout-alpha',
                    netCents: usdCents(30_000),
                    paidOn: '2026-08-21',
                    requestedOn: '2026-08-20',
                    status: PayoutStatus.Paid,
                    userId: USER_ID,
                } satisfies LedgerPayoutRow,
            ]),
        );
        render();
        const titles = labelledSections().map(
            (section) => headingOf(section)?.textContent,
        );
        expect(titles.indexOf('Payout timing')).toBe(
            titles.indexOf('Repeatability') + 1,
        );
        const region = sectionNamed(
            'Payout timing',
        )?.querySelector<HTMLElement>(
            '[role="region"][aria-label="Payout timing per plan"]',
        );
        expect(region?.getAttribute('tabindex')).toBe('0');
        expect(region?.textContent).toContain('20.0 days');
    });

    it('reads the firm statements and the rounds for the alerts', () => {
        answerEverything([overviewAccount('alpha')]);
        render();
        expect(harness.queryCalls).toContain('firmStatement.list');
        expect(harness.queryCalls).toContain('round.list');
    });

    it('keeps the alerts section loading while the firm statements load, not empty', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.delete('firmStatement.list');
        render();
        const alerts = sectionNamed('Alerts');
        expect(
            alerts?.querySelector(
                '[aria-busy="true"][aria-label="Loading the alerts"]',
            ),
        ).not.toBeNull();
        expect(alerts?.textContent).not.toContain('No alerts');
    });

    it('says which source failed when the rounds cannot load, in the alerts section', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.set('round.list', failure('Failed to fetch'));
        render();
        expect(container.textContent).toContain(
            'Your rounds could not be loaded',
        );
        expect(sectionNamed('Alerts')?.textContent).toContain(
            'Alerts could not be checked because your rounds could not be loaded.',
        );
    });

    it('shows the payout multiple KPI beside ROI and the firm returns and repeatability cards', () => {
        const alpha = overviewAccount('alpha', {
            fundedOn: '2026-09-05',
            purchasedOn: '2026-06-01',
            stage: AccountStage.Funded,
        });
        answerEverything([alpha]);
        const paidPayout: LedgerPayoutRow = {
            accountId: alpha.id,
            approvedOn: null,
            grossCents: usdCents(30_000),
            id: 'payout-alpha',
            netCents: usdCents(30_000),
            paidOn: '2026-09-10',
            requestedOn: '2026-09-05',
            status: PayoutStatus.Paid,
            userId: USER_ID,
        };
        harness.queries.set('payout.list', answer([paidPayout]));
        render();
        expect(container.textContent).toContain('Payout multiple');
        expect(container.textContent).toContain('2.00x');
        const firmSection = labelledSections().find(
            (section) => headingOf(section)?.textContent === 'Firm returns',
        );
        expect(firmSection?.textContent).toContain(firm.displayName);
        const repeatabilitySection = labelledSections().find(
            (section) => headingOf(section)?.textContent === 'Repeatability',
        );
        expect(repeatabilitySection?.textContent).not.toBe('');
    });

    it('shows injected capital once, the reinvested payouts and the grown-from sentence on the bankroll card (F-V3)', () => {
        const alpha = overviewAccount('alpha', {
            fundedOn: '2026-09-05',
            purchasedOn: '2026-06-01',
            stage: AccountStage.Funded,
        });
        answerEverything([alpha]);
        harness.queries.set(
            'bankroll.list',
            answer([
                {
                    amountCents: usdCents(10_000),
                    id: 'deposit-1',
                    kind: BankrollTransferKind.Deposit,
                    occurredOn: '2026-05-01',
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set(
            'payout.list',
            answer([
                {
                    accountId: alpha.id,
                    approvedOn: null,
                    grossCents: usdCents(20_000),
                    id: 'payout-alpha',
                    netCents: usdCents(20_000),
                    paidOn: '2026-09-10',
                    requestedOn: '2026-09-05',
                    status: PayoutStatus.Paid,
                    userId: USER_ID,
                } satisfies LedgerPayoutRow,
            ]),
        );
        render();
        const bankroll = sectionNamed('Bankroll');
        const labels = [...(bankroll?.querySelectorAll('dt') ?? [])].map(
            (node) => node.textContent,
        );
        expect(labels).toEqual([
            'Available bankroll',
            'Injected capital',
            'Reinvested payouts',
            'Withdrawals',
            'Realized P(an attempt pays)',
            'Realized P(net below zero) at 1 attempt',
            'Realized P(no payout)',
            'Realized minimum budget',
        ]);
        expect(
            labels.filter((label) => label === 'Injected capital'),
        ).toHaveLength(1);
        expect(bankroll?.textContent).toContain('Grown from $100 injected.');
        const reinvested = [...(bankroll?.querySelectorAll('dt') ?? [])].find(
            (node) => node.textContent === 'Reinvested payouts',
        );
        expect(reinvested?.nextElementSibling?.textContent).toBe('$50');
    });

    it('labels the per-slot repeatability group as measured accounts only and prints the shares with their interval (F-V4, F-V10)', () => {
        const alpha = overviewAccount('alpha', {
            fundedOn: '2026-08-05',
            purchasedOn: '2026-06-01',
            stage: AccountStage.Funded,
        });
        answerEverything([alpha]);
        harness.queries.set(
            'payout.list',
            answer([
                {
                    accountId: alpha.id,
                    approvedOn: null,
                    grossCents: usdCents(30_000),
                    id: 'payout-alpha',
                    netCents: usdCents(30_000),
                    paidOn: '2026-08-10',
                    requestedOn: '2026-08-05',
                    status: PayoutStatus.Paid,
                    userId: USER_ID,
                } satisfies LedgerPayoutRow,
            ]),
        );
        render();
        const repeatability = sectionNamed('Repeatability');
        expect(repeatability?.textContent).toContain(
            'Per funded slot per month (measured accounts only)',
        );
        expect(repeatability?.textContent).toMatch(/95% CI .* to .*, n = \d/);
        expect(repeatability?.textContent).not.toContain('NaN');
    });

    it('toggles the statement between cash by month and by purchase cohort (F-V4, F-V12)', () => {
        const alpha = overviewAccount('alpha', {
            fundedOn: '2026-09-05',
            purchasedOn: '2026-06-01',
            stage: AccountStage.Funded,
        });
        answerEverything([alpha]);
        const paidPayout: LedgerPayoutRow = {
            accountId: alpha.id,
            approvedOn: null,
            grossCents: usdCents(30_000),
            id: 'payout-alpha',
            netCents: usdCents(30_000),
            paidOn: '2026-09-10',
            requestedOn: '2026-09-05',
            status: PayoutStatus.Paid,
            userId: USER_ID,
        };
        harness.queries.set('payout.list', answer([paidPayout]));
        render();
        const statement = sectionNamed('Monthly statement');
        expect(statement?.textContent).toContain('2026-06');
        const cohortButton = [
            ...(statement?.querySelectorAll('button') ?? []),
        ].find((button) => button.textContent === 'By purchase cohort');
        if (cohortButton === undefined) {
            throw new Error('no purchase cohort toggle button');
        }
        act(() => {
            cohortButton.click();
        });
        expect(statement?.textContent).toContain('In progress');
        expect(statement?.textContent).toContain('2026-06');
    });

    it('shows an attempts-per-month card (F-V7)', () => {
        const alpha = overviewAccount('alpha', { purchasedOn: '2026-06-01' });
        answerEverything([alpha]);
        render();
        const section = sectionNamed('Attempt throughput');
        expect(section?.textContent).toContain('2026-06');
        expect(section?.textContent).toContain(firm.displayName);
    });

    it('shows real content on the payout sizes, funded payouts and attempt economics cards once a payout is paid (F-V8, F-V9)', () => {
        const alpha = overviewAccount('alpha', {
            fundedOn: '2026-09-05',
            purchasedOn: '2026-06-01',
            stage: AccountStage.Funded,
        });
        answerEverything([alpha]);
        const paidPayout: LedgerPayoutRow = {
            accountId: alpha.id,
            approvedOn: null,
            grossCents: usdCents(30_000),
            id: 'payout-alpha',
            netCents: usdCents(30_000),
            paidOn: '2026-09-10',
            requestedOn: '2026-09-05',
            status: PayoutStatus.Paid,
            userId: USER_ID,
        };
        harness.queries.set('payout.list', answer([paidPayout]));
        render();
        const payoutSizes = sectionNamed('Payout sizes');
        expect(payoutSizes?.textContent).not.toContain('No paid payout yet.');
        expect(payoutSizes?.textContent).toContain('Mean');
        const fundedPayouts = sectionNamed('Payouts per funded account');
        expect(fundedPayouts?.textContent).not.toContain(
            'No funded account yet.',
        );
        expect(fundedPayouts?.textContent).toContain(firm.displayName);
        const attemptEconomics = sectionNamed('Your attempt economics');
        expect(attemptEconomics?.textContent).not.toContain(
            'No account with a modeled plan yet.',
        );
        expect(attemptEconomics?.textContent).toContain(firm.displayName);
        expect(attemptEconomics?.textContent).toContain(
            'Realized EV per attempt: ignores time.',
        );
    });

    it('fires the bankroll loss risk alert from real ledger data (PT-58a3 leftover)', () => {
        const losers = Array.from({ length: 5 }, (_unused, index) =>
            overviewAccount(`loser-${String(index)}`, {
                fundedOn: '2026-06-01',
                purchasedOn: '2026-05-01',
                stage: AccountStage.Funded,
            }),
        );
        const winner = overviewAccount('winner', {
            fundedOn: '2026-06-01',
            purchasedOn: '2026-05-01',
            stage: AccountStage.Funded,
        });
        const every = [...losers, winner];
        answerEverything(every);
        harness.queries.set(
            'fee.list',
            answer(
                every.map((row): LedgerFeeRow => ({
                    accountId: row.id,
                    amountCents: usdCents(20_000),
                    id: `fee-${row.id}`,
                    kind: FeeKind.EvalPurchase,
                    paidOn: '2026-05-01',
                    userId: USER_ID,
                })),
            ),
        );
        harness.queries.set(
            'event.list',
            answer(
                every.flatMap((row): LedgerEventRow[] => [
                    {
                        accountId: row.id,
                        createdAt: new Date('2026-05-01T12:00:00Z'),
                        id: `purchased-${row.id}`,
                        kind: AccountEventKind.Purchased,
                        occurredOn: '2026-05-01',
                        userId: USER_ID,
                    },
                    {
                        accountId: row.id,
                        createdAt: new Date('2026-06-01T12:00:00Z'),
                        id: `eval-passed-${row.id}`,
                        kind: AccountEventKind.EvalPassed,
                        occurredOn: '2026-06-01',
                        userId: USER_ID,
                    },
                ]),
            ),
        );
        const paidPayout: LedgerPayoutRow = {
            accountId: winner.id,
            approvedOn: null,
            grossCents: usdCents(150_000),
            id: 'payout-winner',
            netCents: usdCents(150_000),
            paidOn: '2026-06-15',
            requestedOn: '2026-06-10',
            status: PayoutStatus.Paid,
            userId: USER_ID,
        };
        harness.queries.set('payout.list', answer([paidPayout]));
        harness.queries.set(
            'rulebook.get',
            answer({
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    lossRiskThreshold: 0.3,
                },
                samples: { ...DEFAULT_RULEBOOK.samples, minEvalAttempts: 1 },
            }),
        );
        render();
        expect(container.textContent).toContain(
            'Bankroll loss risk above threshold',
        );
        expect(container.textContent).toContain('above your 30.0% threshold');
    });

    it('shows one readable error and no table error or skeleton when the accounts cannot be loaded', () => {
        answerEverything([]);
        harness.queries.set('account.list', failure('Failed to fetch'));
        render();
        expect(container.querySelectorAll('h1')).toHaveLength(1);
        expect(container.textContent).toContain(
            'Your accounts could not be loaded',
        );
        expect(container.textContent).toContain('Failed to fetch.');
        expect(container.textContent).not.toContain(
            'The accounts could not be loaded',
        );
        expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
        expect(
            labelledSections().map(
                (section) => headingOf(section)?.textContent,
            ),
        ).toEqual([]);
    });

    it('keeps the key figures and ledger cards when the stored rulebook is invalid, fails only the alerts and links to the rulebook page to repair it', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.set(
            'rulebook.get',
            failure(
                'Your stored rulebook is not valid: x. Save a valid rulebook or reset it to the defaults',
                rejection({ record: PropRecord.Rulebook }),
            ),
        );
        render();
        expect(container.textContent).toContain(
            'Your rulebook could not be loaded',
        );
        expect(container.textContent).toContain(
            'Alerts could not be checked because your rulebook could not be loaded.',
        );
        const repairLinks = [
            ...container.querySelectorAll(
                `a[href="${CSS.escape(routes.propCalculator.accounts.rulebook)}"]`,
            ),
        ];
        expect(repairLinks).toHaveLength(1);
        expect(repairLinks[0]?.textContent).toBe('Repair the rulebook');
        expect(
            labelledSections().map(
                (section) => headingOf(section)?.textContent,
            ),
        ).toEqual([...CARD_HEADINGS, 'Accounts']);
    });

    it('links no rulebook repair page when the rulebook fails for another reason', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.set('rulebook.get', failure('Failed to fetch'));
        render();
        expect(container.textContent).toContain(
            'Your rulebook could not be loaded',
        );
        expect(
            container.querySelector(
                `a[href="${CSS.escape(routes.propCalculator.accounts.rulebook)}"]`,
            ),
        ).toBeNull();
    });

    it('links no rulebook repair page when another stored record is invalid', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.set(
            'copyGroup.list',
            failure(
                'Your stored copy group is not valid: x.',
                rejection({ record: PropRecord.CopyGroup }),
            ),
        );
        render();
        expect(
            container.querySelector(
                `a[href="${CSS.escape(routes.propCalculator.accounts.rulebook)}"]`,
            ),
        ).toBeNull();
    });

    it('keeps the alerts and names the missing source when the account events cannot be listed', () => {
        answerEverything([
            overviewAccount('unknown', { planSerial: 'no-such-plan' }),
        ]);
        harness.queries.set(
            'event.list',
            failure(
                'More than 5000 account event rows match; narrow the date range or pick one account',
                rejection({
                    limit: 5000,
                    reason: PropLimitRejection.ListTooLarge,
                    record: PropRecord.Event,
                }),
            ),
        );
        render();
        expect(container.textContent).toContain(
            'Your account events could not be loaded',
        );
        expect(container.textContent).toContain(
            'Spend, payouts, net and the ledger cards are not shown because your account events could not be loaded.',
        );
        expect(container.textContent).toContain('Unresolvable plan');
        expect(container.textContent).toContain(
            'Alerts that depend on account history could not be checked because your account events could not be loaded.',
        );
        expect(
            labelledSections().map(
                (section) => headingOf(section)?.textContent,
            ),
        ).toEqual(['Alerts', 'Rule violations', 'Accounts']);
    });

    it('keeps every card after a failed refetch and says which data is stale', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.set('snapshot.latestTwoForAll', {
            data: [],
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
        });
        render();
        expect(container.textContent).toContain(
            'Your latest balances could not be refreshed',
        );
        expect(container.textContent).toContain(
            'Failed to fetch. The figures below use the last loaded latest balances.',
        );
        expect(
            labelledSections()
                .map((section) => headingOf(section)?.textContent)
                .slice(0, CARD_HEADINGS.length),
        ).toEqual(CARD_HEADINGS);
    });

    it('warns instead of silently naming firms of your own unlisted when the firm list fails to load', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.set('externalFirm.list', failure('Failed to fetch'));
        render();
        const alerts = [...container.querySelectorAll('[role="alert"]')].filter(
            (alert) =>
                alert.textContent.includes('Your firms could not be loaded'),
        );
        expect(alerts).toHaveLength(2);
    });

    it('shows no card and the accounts table empty state when there are no accounts', () => {
        answerEverything([]);
        render();
        expect(container.querySelectorAll('h1')).toHaveLength(1);
        expect(
            labelledSections().map(
                (section) => headingOf(section)?.textContent,
            ),
        ).toEqual([]);
        expect(container.textContent).toContain('No accounts yet');
    });

    it('keeps the alerts and explains the failure when a stored date breaks the ledger cards', () => {
        answerEverything([]);
        const broken = overviewAccount('broken', { purchasedOn: '2026-02-30' });
        harness.queries.set('account.list', answer([broken]));
        render();
        expect(container.textContent).toContain(
            'The ledger cards could not be computed: Not a calendar date: "2026-02-30".',
        );
        expect(container.textContent).toContain('Invalid stored date');
        const titles = labelledSections().map(
            (section) => headingOf(section)?.textContent,
        );
        expect(titles).toContain('Alerts');
        expect(titles).not.toContain('Costs');
    });

    it('shows a loading placeholder and no cards while the data is pending', () => {
        render();
        expect(container.querySelectorAll('h1')).toHaveLength(1);
        expect(
            container
                .querySelector('[aria-busy="true"]')
                ?.getAttribute('aria-label'),
        ).toBe('Loading your overview');
        expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
        expect(
            labelledSections().filter(
                (section) => headingOf(section)?.textContent === 'Key figures',
            ),
        ).toHaveLength(0);
    });
    it('shows the cushion and payout readiness boards with the reason an account has no state yet (F-80, F-81)', () => {
        answerEverything([
            overviewAccount('alpha', {
                fundedOn: '2026-09-05',
                purchasedOn: '2026-06-01',
                stage: AccountStage.Funded,
            }),
            overviewAccount('beta'),
        ]);
        render();
        const cushion = sectionNamed('Cushion board');
        expect(cushion?.textContent).toContain(
            'No account has a usable balance snapshot yet.',
        );
        expect(cushion?.textContent).toContain('alpha: it has no snapshot yet');
        const readiness = sectionNamed('Payout readiness');
        expect(readiness?.textContent).toContain(
            'No funded account has a usable balance snapshot yet.',
        );
        expect(readiness?.textContent).toContain(
            'beta: it has no snapshot yet',
        );
    });

    it('shows the setup checklist first, says what is missing and links each fix (PT-69, F-V28)', () => {
        answerEverything([overviewAccount('alpha'), overviewAccount('beta')]);
        render();
        const headings = labelledSections().map(
            (section) => headingOf(section)?.textContent,
        );
        expect(headings[0]).toBe('Setup checklist');
        const setup = sectionNamed('Setup checklist');
        expect(setup?.textContent).toContain('2 of 5 steps done.');
        const linkTo = (label: string): null | string =>
            [...(setup?.querySelectorAll('a') ?? [])]
                .find((anchor) => anchor.textContent === label)
                ?.getAttribute('href') ?? null;
        expect(linkTo('Budget set')).toBe(
            routes.propCalculator.accounts.ledger,
        );
        expect(linkTo('Firm rules verified')).toBe(routes.propCalculator.rules);
        expect(linkTo('Stages captured')).toBe(
            routes.propCalculator.accounts.review,
        );
        expect(linkTo('alpha')).toBe(
            routes.propCalculator.accounts.detail('alpha'),
        );
        expect(setup?.textContent).toContain('Missing');
    });

    it('shows the firms tile with the roster counts, the scale gate and a link to the firms page (PT-69, F-V26, F-V27)', () => {
        answerEverything([overviewAccount('alpha')]);
        render();
        const tile = sectionNamed('Firms');
        expect(tile?.textContent).toContain(
            '1 firms used, 1 active, 0 sent live.',
        );
        expect(tile?.textContent).toContain('Sample thresholds not set');
        expect(
            [...(tile?.querySelectorAll('a') ?? [])]
                .find((anchor) => anchor.textContent.includes('firm roster'))
                ?.getAttribute('href'),
        ).toBe(routes.propCalculator.accounts.firms);
    });

    it.each(['firmEngagement.list', 'edge.summary'])(
        'shows a placeholder, never counts or a scale gate badge from empty data, while %s still loads',
        (pendingQuery) => {
            answerEverything([overviewAccount('alpha')]);
            harness.queries.delete(pendingQuery);
            render();
            const tile = sectionNamed('Firms');
            expect(tile?.textContent).not.toContain('firms used');
            expect(tile?.textContent).not.toContain('Scale gate');
            expect(tile?.querySelector('.animate-pulse')).not.toBeNull();
        },
    );

    it('says why the firms tile counts every firm as active when the statuses cannot load', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.set('firmEngagement.list', failure('statuses down'));
        render();
        expect(sectionNamed('Firms')?.textContent).toContain(
            'Your firm statuses could not be loaded',
        );
    });

    it('shows the profit concentration and where EV comes from cards with their labels (PT-69, F-V26, F-V28)', () => {
        answerEverything([heldFundedAccount()]);
        render();
        expect(sectionNamed('Profit concentration')?.textContent).toContain(
            'The concentration alert is off',
        );
        expect(sectionNamed('Profit concentration')?.textContent).toContain(
            'Withdrawable above the retained cushion',
        );
        const ev = sectionNamed('Where EV comes from');
        expect(ev?.textContent).toContain(
            'Conversion EV per attempt (modeled)',
        );
        expect(ev?.textContent).toContain('not the ranking objective');
        expect(ev?.textContent).toContain(firm.displayName);
    });

    it('puts the worst day and followed recommendations KPIs after net (PT-69, F-V29, F-V20)', () => {
        answerEverything([heldFundedAccount()]);
        render();
        const kpis = sectionNamed('Key figures')?.textContent ?? '';
        expect(kpis).toContain('Worst day loss');
        expect(kpis).toContain('Followed recommendations');
        expect(kpis.indexOf('Worst day loss')).toBeGreaterThan(
            kpis.indexOf('Payouts received minus spend'),
        );
        expect(kpis.indexOf('Followed recommendations')).toBeGreaterThan(
            kpis.indexOf('Worst day loss'),
        );
    });

    it("reads each account's latest two snapshots, so the worst day KPI measures a live-shaped load (PT-69b, F-V29)", () => {
        const alpha = overviewAccount('alpha');
        answerEverything([alpha]);
        const start = plan.id.accountSize;
        const previous = evalSnapshotRow(
            alpha.id,
            '2026-09-25',
            usdCents(Math.round((start + 600) * 100)),
            3,
        );
        const latest = evalSnapshotRow(
            alpha.id,
            TODAY,
            usdCents(Math.round(start * 100)),
            4,
        );
        harness.queries.set('snapshot.latestForAll', answer([latest]));
        harness.queries.set(
            'snapshot.latestTwoForAll',
            answer([latest, previous]),
        );
        render();
        const kpis = sectionNamed('Key figures')?.textContent ?? '';
        expect(kpis).toContain('Worst day loss');
        expect(kpis).toContain(`On ${TODAY}`);
    });

    it('does not request the one-snapshot-per-account list for the overview data', () => {
        const alpha = overviewAccount('alpha');
        answerEverything([alpha]);
        const latest = evalSnapshotRow(
            alpha.id,
            TODAY,
            usdCents(Math.round(plan.id.accountSize * 100)),
            4,
        );
        const previous = evalSnapshotRow(
            alpha.id,
            '2026-09-25',
            usdCents(Math.round((plan.id.accountSize + 600) * 100)),
            3,
        );
        harness.queries.set('snapshot.latestForAll', answer([latest]));
        harness.queries.delete('snapshot.latestTwoForAll');
        render();
        expect(sectionNamed('Key figures')).toBeUndefined();
        harness.queries.set(
            'snapshot.latestTwoForAll',
            answer([latest, previous]),
        );
        act(() => {
            root.render(<OverviewView userId={USER_ID} />);
        });
        expect(sectionNamed('Key figures')).toBeDefined();
    });

    it('requests only the two-snapshot list for the whole page, so the accounts table never asks for the one-per-account list (PT-69d, F-V29)', () => {
        const alpha = overviewAccount('alpha');
        answerEverything([alpha]);
        harness.queryCalls.length = 0;
        render();
        expect(harness.queryCalls).toContain('snapshot.latestTwoForAll');
        expect(harness.queryCalls).not.toContain('snapshot.latestForAll');
    });

    it('shows the latest snapshot balance in the accounts table from the two-snapshot list', () => {
        const alpha = overviewAccount('alpha');
        answerEverything([alpha]);
        const latest = evalSnapshotRow(
            alpha.id,
            TODAY,
            usdCents(Math.round((plan.id.accountSize + 700) * 100)),
            4,
        );
        const previous = evalSnapshotRow(
            alpha.id,
            '2026-09-25',
            usdCents(Math.round((plan.id.accountSize + 100) * 100)),
            3,
        );
        harness.queries.delete('snapshot.latestForAll');
        harness.queries.set(
            'snapshot.latestTwoForAll',
            answer([previous, latest]),
        );
        render();
        const table = sectionNamed('Accounts');
        expect(table?.textContent).toContain(`as of ${TODAY}`);
        expect(table?.textContent).not.toContain('as of 2026-09-25');
    });

    it('lists the capacity alert in the alerts center once the accounts exceed the daily capacity (PT-69, F-V27)', () => {
        answerEverything([overviewAccount('alpha'), overviewAccount('beta')]);
        harness.queries.set(
            'rulebook.get',
            answer({
                ...DEFAULT_RULEBOOK,
                bankroll: {
                    ...DEFAULT_RULEBOOK.bankroll,
                    dailyAccountCapacity: 1,
                },
            }),
        );
        render();
        expect(sectionNamed('Alerts')?.textContent).toContain(
            'Daily account capacity exceeded',
        );
    });

    describe('engine cards from the overview worker', () => {
        interface Posted {
            readonly requests: readonly OverviewRequest[];
        }

        const posted: Posted[] = [];

        let isAnsweringAccountFromState = false;

        function outcomeFor(request: OverviewRequest): OverviewOutcome {
            const key = overviewRequestKey(request);
            if (
                isAnsweringAccountFromState &&
                request.kind === OverviewRequestKind.AccountFromState
            ) {
                return {
                    key,
                    kind: OverviewOutcomeKind.Succeeded,
                    result: {
                        figures: eligibleNowFigures(),
                        kind: OverviewRequestKind.AccountFromState,
                    },
                };
            }
            return request.kind === OverviewRequestKind.DocumentedRun
                ? {
                      key,
                      kind: OverviewOutcomeKind.Succeeded,
                      result: {
                          figures: documentedFigures(),
                          kind: OverviewRequestKind.DocumentedRun,
                      },
                  }
                : {
                      key,
                      kind: OverviewOutcomeKind.Failed,
                      reason: 'one ES contract risks more than your risk',
                  };
        }

        const heldDone: (() => void)[] = [];
        let created = 0;
        let isStreamingProgress = false;

        class FakeWorker {
            private listener: ((event: { data: unknown }) => void) | null =
                null;

            constructor() {
                created += 1;
            }

            addEventListener(
                type: string,
                listener: (event: { data: unknown }) => void,
            ) {
                if (type === 'message') this.listener = listener;
            }

            postMessage(message: { request: Posted; runId: number }) {
                posted.push(message.request);
                const outcomes = message.request.requests.map((request) =>
                    outcomeFor(request),
                );
                const done = () => {
                    this.listener?.({
                        data: {
                            kind: 'done',
                            result: { outcomes },
                            runId: message.runId,
                        },
                    });
                };
                if (!isStreamingProgress) {
                    queueMicrotask(done);
                    return;
                }
                queueMicrotask(() => {
                    this.listener?.({
                        data: {
                            kind: 'progress',
                            progress: { outcomes: outcomes.slice(0, 1) },
                            runId: message.runId,
                        },
                    });
                });
                heldDone.push(done);
            }

            terminate() {
                this.listener = null;
            }
        }

        beforeEach(() => {
            posted.length = 0;
            heldDone.length = 0;
            created = 0;
            isStreamingProgress = false;
            isAnsweringAccountFromState = false;
        });

        it('starts one worker per request group even when the worker streams a progress message per outcome', async () => {
            isStreamingProgress = true;
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([heldFundedAccount()]);
            render();
            await settle();
            expect(sectionNamed('Expected net')?.textContent).toContain(
                '$1,111 (SE $9)',
            );
            expect(created).toBe(3);
            expect(posted).toHaveLength(3);
            for (const done of heldDone) done();
            await settle();
            expect(created).toBe(3);
            expect(posted).toHaveLength(3);
            expect(sectionNamed('Expected net')?.textContent).toContain(
                'one ES contract risks more than your risk',
            );
        });

        it('still gets its answer under React strict mode, which unmounts and remounts once', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([heldFundedAccount()]);
            act(() => {
                root.render(
                    <StrictMode>
                        <OverviewView userId={USER_ID} />
                    </StrictMode>,
                );
            });
            await settle();
            expect(sectionNamed('Expected net')?.textContent).toContain(
                '$1,111 (SE $9)',
            );
        });

        it('keeps each request group in the shared computation cache under the overview id, keyed by that group', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([heldFundedAccount()]);
            const cache = new ComputationCache();
            renderWithCache(root, cache);
            await settle();
            expect(posted).toHaveLength(3);
            for (const sent of posted) {
                const stored = cache.get(
                    ComputationId.Overview,
                    overviewRequestsKey(sent.requests),
                );
                expect(stored?.outcomes.map((outcome) => outcome.key)).toEqual(
                    sent.requests.map((request) => overviewRequestKey(request)),
                );
            }
        });

        it('reruns only the projection when an account of a held plan is added, and keeps the policy answers on screen meanwhile', async () => {
            isStreamingProgress = false;
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([heldFundedAccount()]);
            const cache = new ComputationCache();
            renderWithCache(root, cache);
            await settle();
            expect(posted).toHaveLength(3);
            answerEverything([
                heldFundedAccount(),
                overviewAccount('beta', {
                    fundedOn: '2026-09-06',
                    purchasedOn: '2026-06-02',
                    stage: AccountStage.Funded,
                }),
            ]);
            renderWithCache(root, cache);
            expect(sectionNamed('Expected net')?.textContent).toContain(
                '$1,111 (SE $9)',
            );
            await settle();
            expect(posted).toHaveLength(4);
            expect(posted[3]?.requests.map((request) => request.kind)).toEqual([
                OverviewRequestKind.PortfolioProjection,
            ]);
            expect(posted[3]?.requests[0]?.accounts).toBe(2);
        });

        it('shows the cached outcomes at once and starts no worker when the overview is visited again under the same cache', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([heldFundedAccount()]);
            const cache = new ComputationCache();
            renderWithCache(root, cache);
            await settle();
            expect(created).toBe(3);
            act(() => {
                root.unmount();
            });
            root = createRoot(container);
            renderWithCache(root, cache);
            expect(sectionNamed('Expected net')?.textContent).toContain(
                '$1,111 (SE $9)',
            );
            await settle();
            expect(created).toBe(3);
            expect(posted).toHaveLength(3);
        });

        it('resimulates under a different cache: no outcome survives in a module global', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([heldFundedAccount()]);
            renderWithCache(root, new ComputationCache());
            await settle();
            expect(created).toBe(3);
            act(() => {
                root.unmount();
            });
            root = createRoot(container);
            renderWithCache(root, new ComputationCache());
            await settle();
            expect(created).toBe(6);
            expect(posted).toHaveLength(6);
        });

        it('sends the documented-run and payout-size-optimum requests in one message and the portfolio-projection request in another for the held plan and fills the expected net card and KPI from the answers', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([heldFundedAccount()]);
            render();
            await act(async () => {
                await Promise.resolve();
            });
            expect(posted).toHaveLength(3);
            expect(posted[0]?.requests.map((request) => request.kind)).toEqual([
                OverviewRequestKind.DocumentedRun,
                OverviewRequestKind.PayoutSizeOptimum,
            ]);
            expect(posted[1]?.requests.map((request) => request.kind)).toEqual([
                OverviewRequestKind.PortfolioProjection,
            ]);
            expect(posted[2]?.requests.map((request) => request.kind)).toEqual([
                OverviewRequestKind.PlanValues,
            ]);
            expect(posted[1]?.requests[0]?.accounts).toBe(1);
            expect(
                sectionNamed('Fresh-start projection')?.textContent,
            ).toContain('one ES contract risks more than your risk');
            expect(sectionNamed('Exposure')?.textContent).toContain(
                'alpha: it has no snapshot yet',
            );
            const expectedNet = sectionNamed('Expected net');
            expect(expectedNet?.textContent).toContain('$1,111 (SE $9)');
            expect(expectedNet?.textContent).toContain('1,234 trials');
            expect(expectedNet?.textContent).toContain(
                'one ES contract risks more than your risk',
            );
            expect(sectionNamed('Key figures')?.textContent).toContain(
                '$1,111',
            );
            expect(sectionNamed('Costs')?.textContent).toContain('$777-$627');
        });

        function postedAccountRequests(): OverviewRequest[] {
            return posted
                .flatMap((message) => message.requests)
                .filter(
                    (request) =>
                        request.kind === OverviewRequestKind.AccountFromState,
                );
        }

        it('sends the account-from-state request of an account with a snapshot in its own message, and shows the answer on the next payout card (PT-37)', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerWithSnapshot(heldFundedAccount());
            render();
            await settle();
            const kinds = posted.map((message) =>
                message.requests.map((request) => request.kind),
            );
            expect(kinds).toContainEqual([
                OverviewRequestKind.AccountFromState,
            ]);
            const [accountRequest] = postedAccountRequests();
            expect(accountRequest?.account?.asOf).toBe(TODAY);
            expect(accountRequest?.spec.start).toBeUndefined();
            expect(
                sectionNamed("Next payout and value from today's state")
                    ?.textContent,
            ).toContain('alpha: one ES contract risks more than your risk');
        });

        it('runs each account-from-state request once per page: the overview and its account list share one worker for it (PT-68b)', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerWithSnapshot(heldFundedAccount());
            render();
            await settle();
            expect(postedAccountRequests()).toHaveLength(1);
            expect(created).toBe(4);
            expect(posted).toHaveLength(4);
        });

        it('fills the next payout cell of the account list from the overview run, with nothing left computing (PT-68b)', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            isAnsweringAccountFromState = true;
            answerWithSnapshot(heldFundedAccount());
            render();
            await settle();
            expect(postedAccountRequests()).toHaveLength(1);
            const list = container.querySelector(
                'section[aria-labelledby="prop-accounts-list-heading"]',
            );
            expect(list?.textContent).toContain('alpha');
            expect(list?.textContent).toContain('Eligible now');
            expect(list?.textContent).not.toContain('Computing');
        });

        it('posts each request of an eval account with a snapshot once, the list and the overview sharing the documented, plan value and account runs (PT-68b)', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerWithSnapshot(overviewAccount('alpha'));
            render();
            await settle();
            const kindsByMessage = posted
                .map((message) =>
                    sortedText(message.requests.map((request) => request.kind)),
                )
                .toSorted((left, right) => left.localeCompare(right));
            expect(kindsByMessage).toEqual(
                [
                    sortedText([OverviewRequestKind.AccountFromState]),
                    sortedText([
                        OverviewRequestKind.DocumentedRun,
                        OverviewRequestKind.PayoutSizeOptimum,
                    ]),
                    sortedText([OverviewRequestKind.PlanValues]),
                    sortedText([OverviewRequestKind.PortfolioProjection]),
                ].toSorted((left, right) => left.localeCompare(right)),
            );
            const keys = posted.flatMap((message) =>
                message.requests.map((request) => overviewRequestKey(request)),
            );
            expect(new Set(keys).size).toBe(keys.length);
        });

        it('values the accounts of the viewed user, as the overview requests do, instead of refusing when a stray row of another user is in the list (PT-68b)', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            isAnsweringAccountFromState = true;
            const alpha = heldFundedAccount();
            answerWithSnapshot(alpha);
            harness.queries.set(
                'account.list',
                answer([alpha, overviewAccount('stray', { userId: 'user-b' })]),
            );
            render();
            await settle();
            const list = container.querySelector(
                'section[aria-labelledby="prop-accounts-list-heading"]',
            );
            expect(list?.textContent).not.toContain('more than one user');
            expect(list?.textContent).toContain('Eligible now');
        });

        it('still runs one account-from-state request when the plan has a measured rebuy lag, the overview and the list reading it the same way (PT-68b)', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            const prior = overviewAccount('prior', {
                purchasedOn: '2026-05-01',
                status: AccountStatus.Busted,
            });
            const alpha = {
                ...heldFundedAccount(),
                purchasedOn: '2026-06-20',
                replacesAccountId: prior.id,
            };
            answerWithSnapshot(alpha);
            harness.queries.set('account.list', answer([prior, alpha]));
            harness.queries.set(
                'event.list',
                answer([
                    purchasedEventOf(prior),
                    purchasedEventOf(alpha),
                    {
                        ...purchasedEventOf(prior),
                        id: 'event-busted',
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-06-10',
                    },
                ]),
            );
            render();
            await settle();
            const requests = postedAccountRequests();
            expect(requests).toHaveLength(1);
            expect(requests[0]?.spec.enginePolicy.rebuyLagDays).toBeGreaterThan(
                0,
            );
        });

        it('carries the personal payout override and retained cushion of the account into its own account-from-state request, as the account list does (PT-68b)', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            const withRules = {
                ...heldFundedAccount(),
                personalRules: {
                    payoutRequestOverrideCents: usdCents(40_000),
                    retainedCushionCents: usdCents(900_000),
                },
            };
            answerWithSnapshot(withRules);
            render();
            await settle();
            const requests = postedAccountRequests();
            expect(requests.length).toBeGreaterThan(0);
            for (const request of requests) {
                expect(request.spec.enginePolicy.payoutRequestOverride).toBe(
                    400,
                );
                expect(
                    request.spec.enginePolicy.retainedCushionRequest,
                ).toBeGreaterThanOrEqual(9000);
            }
        });

        it('does not send the same requests again when the view renders again with the same data', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([heldFundedAccount()]);
            render();
            await act(async () => {
                await Promise.resolve();
            });
            render();
            await act(async () => {
                await Promise.resolve();
            });
            expect(posted).toHaveLength(3);
        });

        it('says so instead of throwing when web workers are not available, and the other cards keep their data', () => {
            answerEverything([heldFundedAccount()]);
            render();
            const expectedNet = sectionNamed('Expected net');
            expect(expectedNet?.textContent).toContain(
                'Web workers are not available in this browser.',
            );
            expect(expectedNet?.textContent).toContain('Not available');
            expect(sectionNamed('Key figures')).toBeDefined();
        });

        it('sends nothing while no plan is held', () => {
            vi.stubGlobal('Worker', FakeWorker);
            answerEverything([]);
            render();
            expect(posted).toEqual([]);
        });
    });
});
