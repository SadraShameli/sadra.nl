import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountDetailView } from '~/app/(app)/prop-calculator/accounts/_components/detail/AccountDetailView';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    type Plan,
    PlanAvailability,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const USER_ID = 'user-a';
const ACCOUNT_ID = '4b6f3c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2c';

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

function findFirmPlan(isMatch: (plan: Plan) => boolean): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find((candidate) => isMatch(candidate));
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no plan matches the predicate');
}

const DISCONTINUED = findFirmPlan(
    (plan) => plan.availability === PlanAvailability.Discontinued,
);

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const mutate = new Map<string, ReturnType<typeof vi.fn>>();
    const mutateAsync = new Map<string, ReturnType<typeof vi.fn>>();
    const invalidate = vi.fn(() => Promise.resolve());
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateOf(name: string) {
        const existing = mutate.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn();
        mutate.set(name, created);
        return created;
    }
    function mutateAsyncOf(name: string) {
        const existing = mutateAsync.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn(() => Promise.resolve({}));
        mutateAsync.set(name, created);
        return created;
    }
    return {
        invalidate,
        mutateAsyncOf,
        mutateOf,
        mutation: (name: string) => ({
            useMutation: () => ({
                isPending: false,
                mutate: mutateOf(name),
                mutateAsync: mutateAsyncOf(name),
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        reset() {
            queries.clear();
            mutate.clear();
            mutateAsync.clear();
            invalidate.mockClear();
        },
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                archive: harness.mutation('account.archive'),
                get: harness.query('account.get'),
                list: harness.query('account.list'),
                remove: harness.mutation('account.remove'),
                unarchive: harness.mutation('account.unarchive'),
                upgradeToModeled: harness.mutation('account.upgradeToModeled'),
            },
            bankroll: { list: harness.query('bankroll.list') },
            copyGroup: { list: harness.query('copyGroup.list') },
            decision: {
                list: harness.query('decision.list'),
                listForAccount: harness.query('decision.listForAccount'),
            },
            event: {
                list: harness.query('event.list'),
                listForAccount: harness.query('event.listForAccount'),
                record: harness.mutation('event.record'),
            },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: {
                create: harness.mutation('fee.create'),
                list: harness.query('fee.list'),
                remove: harness.mutation('fee.remove'),
                update: harness.mutation('fee.update'),
            },
            payout: {
                create: harness.mutation('payout.create'),
                list: harness.query('payout.list'),
                remove: harness.mutation('payout.remove'),
                update: harness.mutation('payout.update'),
            },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                create: harness.mutation('snapshot.create'),
                latestForAll: harness.query('snapshot.latestForAll'),
                listForAccount: harness.query('snapshot.listForAccount'),
                remove: harness.mutation('snapshot.remove'),
            },
            violation: {
                create: harness.mutation('violation.create'),
                list: harness.query('violation.list'),
                remove: harness.mutation('violation.remove'),
                update: harness.mutation('violation.update'),
            },
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

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(overrides: Record<string, FakeQuery> = {}) {
    const account = ledgerOnlyAccount();
    harness.queries.set('account.get', answer(account));
    harness.queries.set('account.list', answer([account]));
    harness.queries.set('snapshot.listForAccount', answer([]));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('fee.list', answer([]));
    harness.queries.set('event.listForAccount', answer([]));
    harness.queries.set('event.list', answer([]));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('copyGroup.list', answer([]));
    harness.queries.set('snapshot.latestForAll', answer([]));
    harness.queries.set('externalFirm.list', answer([]));
    for (const [name, query] of Object.entries(overrides)) {
        harness.queries.set(name, query);
    }
}

function chooseSelectValue(scope: ParentNode, value: string) {
    const select = [...scope.querySelectorAll('select')].find((candidate) =>
        [...candidate.options].some((option) => option.value === value),
    );
    if (select === undefined) throw new Error(`no select offering ${value}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value',
        )?.set?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function ledgerOnlyAccount(): Record<string, unknown> {
    return {
        accountSize: DISCONTINUED.plan.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: DISCONTINUED.firm.id,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: ACCOUNT_ID,
        label: 'Hola',
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: 'Hola plan',
        planRulesFingerprint: null,
        planSerial: null,
        purchasedOn: '2026-08-03',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.LedgerOnly,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
        userId: USER_ID,
    };
}

describe('the upgrade-to-modeled form offers the account’s own plan, even discontinued (PT-71h)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date('2026-09-26T12:00:00Z'),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
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

    async function clickUpgrade() {
        await act(async () => {
            const button =
                container.querySelector<HTMLButtonElement>('#account-upgrade');
            if (button === null) throw new Error('no upgrade button');
            button.click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    it('offers a discontinued plan, tagged, when upgrading a ledger-only account it already holds', () => {
        answerEverything();
        act(() => {
            root.render(<AccountDetailView id={ACCOUNT_ID} userId={USER_ID} />);
        });
        const optionValues = [...container.querySelectorAll('option')].map(
            (option) => option.value,
        );
        expect(optionValues).toContain(serializePlanId(DISCONTINUED.plan.id));
        expect(container.textContent).toContain('no longer sold');
    });

    it('can save the upgrade onto the account’s own discontinued plan', async () => {
        answerEverything();
        act(() => {
            root.render(<AccountDetailView id={ACCOUNT_ID} userId={USER_ID} />);
        });
        chooseSelectValue(container, serializePlanId(DISCONTINUED.plan.id));
        await clickUpgrade();
        expect(
            harness.mutateAsyncOf('account.upgradeToModeled'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                accountSize: DISCONTINUED.plan.id.accountSize,
                firmId: DISCONTINUED.firm.id,
                id: ACCOUNT_ID,
                planSerial: serializePlanId(DISCONTINUED.plan.id),
            }),
        );
    });
});
