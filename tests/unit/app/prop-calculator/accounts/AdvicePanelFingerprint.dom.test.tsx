import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseAccountAdviceModule from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';

import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
} from '~/lib/prop-accounts';
import {
    ApexVariant,
    findFirm,
    FirmId,
    serializePlanId,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

const USER_ID = 'user-a';
const ACCOUNT_ID = 'account-a';

function apexEod50k() {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (plan === undefined) throw new Error('no Apex EOD 50K plan');
    return plan;
}

const PLAN = apexEod50k();

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        mutation: () => ({
            useMutation: () => ({ isPending: false, mutate: vi.fn() }),
        }),
        payoutQuery: () => ({
            useQuery: () => queries.get('payout.list') ?? pending,
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
    };
});

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: { user: { id: 'user-a' } },
        error: null,
        isPending: false,
    }),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                get: harness.query('account.get'),
                list: harness.query('account.list'),
            },
            decision: {
                create: harness.mutation(),
                listForAccount: harness.query('decision.listForAccount'),
                recordActual: harness.mutation(),
            },
            event: {
                list: harness.query('event.list'),
                listForAccount: harness.query('event.listForAccount'),
            },
            payout: { list: harness.payoutQuery() },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                listForAccount: harness.query('snapshot.listForAccount'),
            },
            violation: {
                create: harness.mutation(),
                list: harness.query('violation.list'),
            },
        },
        useUtils: () => ({
            propAccounts: {
                decision: { invalidate: vi.fn() },
                invalidate: vi.fn(),
            },
        }),
    },
}));

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice',
    async (importOriginal) => {
        const actual = await importOriginal<typeof UseAccountAdviceModule>();
        return {
            ...actual,
            useAccountAdvice: (input: {
                advisor: { assemble: (results: []) => unknown };
            }) => ({
                advice: input.advisor.assemble([]),
                failedOptima: [],
                phase: actual.AccountAdvicePhase.Ready,
                values: { phase: actual.AdviceValuesPhase.Idle },
            }),
        };
    },
);

const { AdvicePanel } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel');

function account(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 50_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        currentPlanRulesFingerprint: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FirmId.Apex,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: ACCOUNT_ID,
        label: 'Alpha',
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: null,
        planRulesChanged: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-08-03',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerWith(row: ReturnType<typeof account>) {
    harness.queries.clear();
    harness.queries.set('account.get', answer(row));
    harness.queries.set('account.list', answer([row]));
    harness.queries.set('snapshot.listForAccount', answer([snapshot()]));
    harness.queries.set('event.list', answer([]));
    harness.queries.set('event.listForAccount', answer([]));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('decision.listForAccount', answer([]));
    harness.queries.set('violation.list', answer([]));
}

function snapshot() {
    return {
        accountId: ACCOUNT_ID,
        asOf: '2026-09-26',
        balanceAtLastPayoutCents: null,
        balanceCents: 5_100_000,
        createdAt: new Date('2026-09-26T12:00:00Z'),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: 5_100_000,
        highestIntradayBalanceCents: null,
        id: 'snap-1',
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 5,
        updatedAt: new Date('2026-09-26T12:00:00Z'),
        userId: USER_ID,
    };
}

describe('the advice panel passes the plan rules fingerprint check to the advisor (PT-108 step 6, F-98, F-126)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<AdvicePanel id={ACCOUNT_ID} />);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date('2026-09-26T12:00:00Z'),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
        vi.restoreAllMocks();
    });

    it('shows the stale view "plan rules changed since purchase" when the stamp and the current fingerprint differ', () => {
        answerWith(
            account({
                currentPlanRulesFingerprint: 'bbbb2222',
                planRulesFingerprint: 'aaaa1111',
            }),
        );

        render();

        const text = container.textContent;
        expect(text).toContain('Plan rules changed since purchase');
        expect(text).toContain("Enter today's balance to see sized amounts");
    });

    it('shows the fingerprint in the provenance line when the stamp matches the current fingerprint', () => {
        answerWith(
            account({
                currentPlanRulesFingerprint: 'aaaa1111',
                planRulesFingerprint: 'aaaa1111',
            }),
        );

        render();

        const text = container.textContent;
        expect(text).not.toContain('Plan rules changed since purchase');
        expect(text).toContain('plan rules fingerprint aaaa1111');
    });

    it('never marks advice stale for a null stamp and still shows the current fingerprint', () => {
        answerWith(
            account({
                currentPlanRulesFingerprint: 'bbbb2222',
                planRulesFingerprint: null,
            }),
        );

        render();

        const text = container.textContent;
        expect(text).not.toContain('Plan rules changed since purchase');
        expect(text).toContain('plan rules fingerprint bbbb2222');
    });

    it('shows no fingerprint and no stale view when the plan cannot be fingerprinted', () => {
        answerWith(
            account({
                currentPlanRulesFingerprint: null,
                planRulesFingerprint: 'aaaa1111',
            }),
        );

        render();

        const text = container.textContent;
        expect(text).not.toContain('Plan rules changed since purchase');
        expect(text).not.toContain('plan rules fingerprint');
    });
});
