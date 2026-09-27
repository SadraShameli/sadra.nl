import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type Mock,
    vi,
} from 'vitest';

import {
    AccountCreator,
    AccountEditor,
} from '~/app/(app)/prop-calculator/accounts/_components/AccountForm';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    RoundStatus,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const mutations = new Map<
        string,
        Mock<(input?: unknown) => Promise<unknown>>
    >();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateAsyncOf(path: string) {
        const existing = mutations.get(path);
        if (existing !== undefined) return existing;
        const created = vi.fn((_input?: unknown) =>
            Promise.resolve<unknown>({ id: 'created' }),
        );
        mutations.set(path, created);
        return created;
    }
    function node(path: readonly string[]): unknown {
        return new Proxy(
            {},
            {
                get(_target, key) {
                    if (typeof key !== 'string') return;
                    const name = path.join('.');
                    if (key === 'useQuery') {
                        return () => queries.get(name) ?? pending;
                    }
                    if (key === 'useMutation') {
                        return () => ({
                            isPending: false,
                            mutate: vi.fn(),
                            mutateAsync: mutateAsyncOf(name),
                        });
                    }
                    return key === 'invalidate' || key === 'cancel'
                        ? () => Promise.resolve()
                        : node([...path, key]);
                },
            },
        );
    }
    return {
        api: {
            propAccounts: node(['propAccounts']),
            useUtils: () => ({ propAccounts: node(['utils']) }),
        },
        mutateAsyncOf,
        queries,
        reset() {
            queries.clear();
            mutations.clear();
        },
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({ api: harness.api }));

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

const USER_ID = 'user-a';
const ACCOUNT_ID = '2a4c6e8f-1b3d-4f5a-9c7e-0d2f4a6c8e1b';
const OPEN_ROUND_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';
const CLOSED_ROUND_ID = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

function fiftyKPlan(): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find((candidate) => !candidate.isInstantFunded);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no firm has a non-instant-funded plan');
}

const FIFTY_K = fiftyKPlan();

const OPEN_ROUND = {
    budgetCents: null,
    closedOn: null,
    createdAt: new Date('2026-08-01T12:00:00Z'),
    externalFirmId: null,
    firmId: FIFTY_K.firm.id,
    id: OPEN_ROUND_ID,
    label: 'Q1 push',
    notes: null,
    openedOn: '2026-08-01',
    status: RoundStatus.Open,
    updatedAt: new Date('2026-08-01T12:00:00Z'),
    userId: USER_ID,
};

const CLOSED_ROUND = {
    ...OPEN_ROUND,
    closedOn: '2026-08-20',
    id: CLOSED_ROUND_ID,
    label: 'Q4 cycle',
    status: RoundStatus.Closed,
};

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

function element(scope: ParentNode, selector: string): HTMLElement {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
}

function fieldScope(scope: ParentNode, labelText: string): HTMLElement {
    const label = [...scope.querySelectorAll('label')].find(
        (candidate) => candidate.textContent.trim() === labelText,
    );
    if (label === undefined) throw new Error(`no field labelled ${labelText}`);
    const item = label.closest<HTMLElement>('.flex.flex-col.gap-2');
    if (item === null) throw new Error(`no form item for ${labelText}`);
    return item;
}

function input(scope: ParentNode, selector: string): HTMLInputElement {
    const found = scope.querySelector<HTMLInputElement>(selector);
    if (found === null) throw new Error(`no input ${selector}`);
    return found;
}

function optionOf(scope: ParentNode, value: string): HTMLOptionElement {
    const option = [...scope.querySelectorAll('option')].find(
        (candidate) => candidate.value === value,
    );
    if (option === undefined) throw new Error(`no option ${value}`);
    return option;
}

function query(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function storedAccount(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: FIFTY_K.plan.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FIFTY_K.firm.id,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: ACCOUNT_ID,
        label: 'Alpha One',
        liveStartBalanceCents: null,
        notes: null,
        optIns: NO_PLAN_OPT_INS,
        personalRules: {},
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(FIFTY_K.plan.id),
        purchasedOn: '2026-08-03',
        readIssues: [],
        replacesAccountId: null,
        roundId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

async function submitForm(scope: ParentNode) {
    const form = element(scope, 'form');
    await act(async () => {
        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function typeInto(target: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )?.set?.call(target, value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('the account form round picker (PT-58a3)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function renderCreator() {
        act(() => {
            root.render(
                <AccountCreator
                    initialFirm={FIFTY_K.firm.id}
                    initialOptIns={NO_PLAN_OPT_INS}
                    initialPlan={serializePlanId(FIFTY_K.plan.id)}
                />,
            );
        });
    }

    function skipSnapshot() {
        const includeSnapshot = element(container, '#account-include-snapshot');
        if (includeSnapshot.getAttribute('aria-checked') === 'true') {
            act(() => {
                includeSnapshot.click();
            });
        }
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        harness.queries.set('propAccounts.account.list', query([]));
        harness.queries.set('propAccounts.copyGroup.list', query([]));
        harness.queries.set('propAccounts.externalFirm.list', query([]));
        harness.queries.set(
            'propAccounts.round.list',
            query([OPEN_ROUND, CLOSED_ROUND]),
        );
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        renderCreator();
        typeInto(input(container, 'input[name="label"]'), 'Alpha One');
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('offers every open round plainly and marks a closed one', () => {
        const round = fieldScope(container, 'Round');
        expect(optionOf(round, OPEN_ROUND_ID).textContent).toBe('Q1 push');
        expect(optionOf(round, CLOSED_ROUND_ID).textContent).toBe(
            'Q4 cycle (closed)',
        );
    });

    it('saves the picked round through account.create', async () => {
        chooseSelectValue(fieldScope(container, 'Round'), OPEN_ROUND_ID);
        skipSnapshot();
        await submitForm(container);
        expect(
            harness.mutateAsyncOf('propAccounts.account.create'),
        ).toHaveBeenCalledWith(
            expect.objectContaining({ roundId: OPEN_ROUND_ID }),
        );
    });

    it('saves no round by default through account.create', async () => {
        skipSnapshot();
        await submitForm(container);
        expect(
            harness.mutateAsyncOf('propAccounts.account.create'),
        ).toHaveBeenCalledWith(expect.objectContaining({ roundId: null }));
    });

    it("preselects the account's round when editing, and clears it through account.update", async () => {
        harness.queries.set(
            'propAccounts.account.get',
            query(storedAccount({ roundId: OPEN_ROUND_ID })),
        );
        act(() => {
            root.render(<AccountEditor id={ACCOUNT_ID} />);
        });
        const round = fieldScope(container, 'Round');
        const select = [...round.querySelectorAll('select')].find(
            (candidate) =>
                [...candidate.options].some(
                    (option) => option.value === OPEN_ROUND_ID,
                ),
        );
        expect(select?.value).toBe(OPEN_ROUND_ID);

        chooseSelectValue(round, 'none');
        await submitForm(container);
        expect(
            harness.mutateAsyncOf('propAccounts.account.update'),
        ).toHaveBeenCalledWith(expect.objectContaining({ roundId: null }));
    });
});
