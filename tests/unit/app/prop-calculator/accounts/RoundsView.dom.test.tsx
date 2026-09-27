import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoundsView } from '~/app/(app)/prop-calculator/accounts/rounds/RoundsView';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    firmKeyId,
    FirmKeyKind,
    RoundStatus,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

interface FakeQuery {
    data: unknown;
    error: null;
    isError: false;
    isPending: boolean;
}

function firstModeledPlan(): { readonly firm: TradingFirm; readonly plan: Plan } {
    const [firm] = ALL_FIRMS;
    const [plan] = firm?.plans ?? [];
    if (firm === undefined || plan === undefined) {
        throw new Error('no modeled plan for the rounds view test');
    }
    return { firm, plan };
}

const { firm: FIRST_FIRM, plan: FIRST_PLAN } = firstModeledPlan();

const USER_ID = 'user-a';
const TODAY = '2026-09-26';
const ROUND_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';
const ALPHA_ID = '2a4c6e8f-1b3d-4f5a-9c7e-0d2f4a6c8e1b';
const BRAVO_ID = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const create = vi.fn(() => Promise.resolve({}));
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        create,
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        reset() {
            queries.clear();
            create.mockClear();
        },
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/rounds',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: { user: { id: USER_ID } },
        error: null,
        isPending: false,
    }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            event: { list: harness.query('event.list') },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: { list: harness.query('fee.list') },
            payout: { list: harness.query('payout.list') },
            round: {
                create: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.create,
                    }),
                },
                list: harness.query('round.list'),
            },
            rulebook: { get: harness.query('rulebook.get') },
        },
        useUtils: () => ({
            propAccounts: { invalidate: () => Promise.resolve() },
        }),
    },
}));

function account(id: string, label: string, overrides: Record<string, unknown> = {}) {
    return {
        accountSize: FIRST_PLAN.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-06-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FIRST_FIRM.id,
        firstFundedTradeOn: null,
        fundedOn: null,
        id,
        label,
        liveStartBalanceCents: null,
        notes: null,
        optIns: NO_PLAN_OPT_INS,
        personalRules: {},
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(FIRST_PLAN.id),
        purchasedOn: '2026-06-01',
        readIssues: [],
        replacesAccountId: null,
        roundId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-06-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
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

function element(scope: ParentNode, selector: string): HTMLElement {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
}

function input(scope: ParentNode, selector: string): HTMLInputElement {
    const found = scope.querySelector<HTMLInputElement>(selector);
    if (found === null) throw new Error(`no input ${selector}`);
    return found;
}

async function submitForm(scope: ParentNode, label: string) {
    const form = element(scope, `form[aria-label="${label}"]`);
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

describe('RoundsView', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<RoundsView />);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.reset();
        harness.queries.set('account.list', answer([]));
        harness.queries.set('event.list', answer([]));
        harness.queries.set('externalFirm.list', answer([]));
        harness.queries.set('fee.list', answer([]));
        harness.queries.set('payout.list', answer([]));
        harness.queries.set('round.list', answer([]));
        harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
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

    it('shows a round with its firm, status, budget and member count', () => {
        harness.queries.set(
            'round.list',
            answer([
                {
                    budgetCents: 100_000,
                    closedOn: null,
                    externalFirmId: null,
                    firmId: FIRST_FIRM.id,
                    id: ROUND_ID,
                    label: 'Q1 push',
                    notes: null,
                    openedOn: '2026-06-01',
                    status: RoundStatus.Open,
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha', { roundId: ROUND_ID })]),
        );
        render();
        expect(container.textContent).toContain('Q1 push');
        expect(container.textContent).toContain(FIRST_FIRM.displayName);
        expect(container.textContent).toContain('Open');
        expect(container.textContent).toContain('$0 of $1,000');
    });

    it('shows a suggestion and prefills the create form when accepted', () => {
        harness.queries.set(
            'account.list',
            answer([
                account(ALPHA_ID, 'Alpha', { purchasedOn: '2026-06-01' }),
                account(BRAVO_ID, 'Bravo', { purchasedOn: '2026-06-05' }),
            ]),
        );
        render();
        expect(container.textContent).toContain('Round suggestions');
        expect(container.textContent).toContain('2 accounts');
        act(() => {
            element(container, 'button[type="button"]').click();
        });
        const firmValue = firmKeyId({
            firmId: FIRST_FIRM.id,
            kind: FirmKeyKind.Modeled,
        });
        const select = [...container.querySelectorAll('select')].find(
            (candidate) =>
                [...candidate.options].some(
                    (option) => option.value === firmValue,
                ),
        );
        expect(select?.value).toBe(firmValue);
        expect(input(container, 'input[name="openedOn"]').value).toBe(
            '2026-06-01',
        );
    });

    it('creates a round through round.create with the picked firm', async () => {
        render();
        const firmValue = firmKeyId({
            firmId: FIRST_FIRM.id,
            kind: FirmKeyKind.Modeled,
        });
        chooseSelectValue(container, firmValue);
        typeInto(input(container, 'input[name="label"]'), 'Q2 push');
        await submitForm(container, 'Add a round');
        expect(harness.create).toHaveBeenCalledWith({
            budgetCents: null,
            externalFirmId: null,
            firmId: FIRST_FIRM.id,
            label: 'Q2 push',
            notes: null,
            openedOn: TODAY,
        });
    });
});
