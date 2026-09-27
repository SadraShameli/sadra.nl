import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AccountListAccount } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { OverviewView } from '~/app/(app)/prop-calculator/accounts/_components/overview/OverviewView';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    FeeKind,
    type LedgerAccountRow,
    type LedgerEventRow,
    type LedgerFeeRow,
    type LedgerPayoutRow,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, serializePlanId } from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
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
            useQuery: () => queries.get(name) ?? pending,
        }),
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
            event: { list: harness.query('event.list') },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: { list: harness.query('fee.list') },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: { latestForAll: harness.query('snapshot.latestForAll') },
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
    'Key figures',
    'Bankroll',
    'Alerts',
    'Data notes',
    'Plan cap usage',
    'Stage funnel',
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
    harness.queries.set('event.list', answer(events));
    harness.queries.set('fee.list', answer(fees));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('snapshot.latestForAll', answer([]));
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

function overviewAccount(
    id: string,
    overrides: Partial<OverviewAccount> = {},
): OverviewAccount {
    return {
        accountSize: plan.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId: null,
        firmId: firm.id,
        fundedOn: null,
        id,
        label: id,
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
        expect(
            labelledSections().map(
                (section) => headingOf(section)?.textContent,
            ),
        ).toEqual(['Alerts', 'Accounts']);
    });

    it('keeps every card after a failed refetch and says which data is stale', () => {
        answerEverything([overviewAccount('alpha')]);
        harness.queries.set('snapshot.latestForAll', {
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
});
