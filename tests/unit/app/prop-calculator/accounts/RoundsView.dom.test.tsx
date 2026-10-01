import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseToolsWorkerModule from '~/app/(app)/prop-calculator/_components/useToolsWorker';

import { ToolsResponseKind } from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';
import { RoundsView } from '~/app/(app)/prop-calculator/accounts/rounds/RoundsView';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    FeeKind,
    firmKeyId,
    FirmKeyKind,
    type LedgerFeeRow,
    type LedgerPayoutRow,
    PayoutStatus,
    RoundStatus,
    usdCents,
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
    error: null | { message: string };
    isError: boolean;
    isPending: boolean;
}

function firstModeledPlan(): {
    readonly firm: TradingFirm;
    readonly plan: Plan;
} {
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
    const create = vi.fn(() => Promise.resolve({ id: 'created-round' }));
    const assign = vi.fn(() => Promise.resolve({}));
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        assign,
        create,
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        reset() {
            queries.clear();
            create.mockClear();
            assign.mockClear();
        },
    };
});

const toolsWorkerBox = vi.hoisted(() => ({
    instances: [] as {
        runSpy: (request: unknown) => void;
        setState: (state: unknown) => void;
    }[],
}));

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
            bankroll: { summary: harness.query('bankroll.summary') },
            edge: { summary: harness.query('edge.summary') },
            event: { list: harness.query('event.list') },
            externalFirm: { list: harness.query('externalFirm.list') },
            fee: { list: harness.query('fee.list') },
            payout: { list: harness.query('payout.list') },
            round: {
                assign: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.assign,
                    }),
                },
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

vi.mock(
    '~/app/(app)/prop-calculator/_components/useToolsWorker',
    async (importOriginal) => {
        const React = await import('react');
        const actual = await importOriginal<typeof UseToolsWorkerModule>();
        return {
            ToolsWorkerPhase: actual.ToolsWorkerPhase,
            useToolsWorker: () => {
                const [state, setState] = React.useState<unknown>({
                    phase: actual.ToolsWorkerPhase.Idle,
                });
                const indexReference = React.useRef<null | number>(null);
                if (indexReference.current === null) {
                    indexReference.current = toolsWorkerBox.instances.length;
                    toolsWorkerBox.instances.push({
                        runSpy: vi.fn(),
                        setState,
                    });
                }
                const instance =
                    toolsWorkerBox.instances[indexReference.current];
                return {
                    cancel: vi.fn(),
                    run: (request: unknown) => {
                        instance?.runSpy(request);
                    },
                    state,
                };
            },
        };
    },
);

function account(
    id: string,
    label: string,
    overrides: Record<string, unknown> = {},
) {
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

function failed(message: string): FakeQuery {
    return {
        data: undefined,
        error: { message },
        isError: true,
        isPending: false,
    };
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
        toolsWorkerBox.instances = [];
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

    it('assigns the suggested accounts to the round it creates from a prefilled suggestion', async () => {
        harness.queries.set(
            'account.list',
            answer([
                account(ALPHA_ID, 'Alpha', { purchasedOn: '2026-06-01' }),
                account(BRAVO_ID, 'Bravo', { purchasedOn: '2026-06-05' }),
            ]),
        );
        render();
        act(() => {
            element(container, 'button[type="button"]').click();
        });
        await submitForm(container, 'Add a round');
        expect(harness.create).toHaveBeenCalledTimes(1);
        expect(harness.assign).toHaveBeenNthCalledWith(1, {
            accountId: ALPHA_ID,
            roundId: 'created-round',
        });
        expect(harness.assign).toHaveBeenNthCalledWith(2, {
            accountId: BRAVO_ID,
            roundId: 'created-round',
        });
    });

    it('keeps the add-round button disabled while suggested accounts are still being assigned', async () => {
        harness.queries.set(
            'account.list',
            answer([
                account(ALPHA_ID, 'Alpha', { purchasedOn: '2026-06-01' }),
                account(BRAVO_ID, 'Bravo', { purchasedOn: '2026-06-05' }),
            ]),
        );
        let resolveFirstAssign: (() => void) | undefined;
        harness.assign.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirstAssign = () => resolve({});
                }),
        );
        render();
        act(() => {
            element(container, 'button[type="button"]').click();
        });
        const form = element(container, 'form[aria-label="Add a round"]');
        await act(async () => {
            form.dispatchEvent(
                new Event('submit', { bubbles: true, cancelable: true }),
            );
            await Promise.resolve();
            await Promise.resolve();
        });
        const button = element(
            container,
            'button[type="submit"]',
        ) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        await act(async () => {
            resolveFirstAssign?.();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(button.disabled).toBe(false);
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

    it('shows an error instead of an indefinite loading skeleton when a required query fails', () => {
        harness.queries.set('account.list', failed('accounts down'));
        render();
        expect(container.textContent).toContain('accounts down');
        expect(container.querySelector('.animate-pulse')).toBeNull();
    });

    it('warns when the external firms could not be loaded, without blocking the rest of the page', () => {
        harness.queries.set('externalFirm.list', failed('firms down'));
        render();
        expect(container.textContent).toContain('firms down');
        expect(container.textContent).toContain('Rounds');
        expect(container.textContent).toContain('No rounds yet');
    });

    it('warns when the rulebook could not be loaded, without blocking the rest of the page', () => {
        harness.queries.set('rulebook.get', failed('rulebook down'));
        render();
        expect(container.textContent).toContain('rulebook down');
        expect(container.textContent).toContain('Rounds');
        expect(container.textContent).toContain('No rounds yet');
    });

    it('warns when the available bankroll could not be loaded, instead of silently leaving option B uncapped', () => {
        harness.queries.set(
            'round.list',
            answer([
                {
                    budgetCents: null,
                    closedOn: '2026-07-01',
                    externalFirmId: null,
                    firmId: FIRST_FIRM.id,
                    id: ROUND_ID,
                    label: 'Q1 push',
                    notes: null,
                    openedOn: '2026-06-01',
                    status: RoundStatus.Closed,
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha', { roundId: ROUND_ID })]),
        );
        harness.queries.set('bankroll.summary', failed('bankroll down'));
        render();
        expect(container.textContent).toContain('bankroll down');
        expect(container.textContent).toContain('Rounds');
    });

    it('shows no "Next round" card when no round is closed', () => {
        harness.queries.set(
            'round.list',
            answer([
                {
                    budgetCents: null,
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
        expect(container.textContent).not.toContain('Next round');
        const instance = toolsWorkerBox.instances[0];
        const calls = (instance?.runSpy as unknown as ReturnType<typeof vi.fn>)
            .mock.calls;
        expect(calls).toHaveLength(0);
    });

    it('runs a "Next round" request through the tools worker for a closed round, and shows the scale gate note when thresholds are not set', () => {
        harness.queries.set(
            'round.list',
            answer([
                {
                    budgetCents: null,
                    closedOn: '2026-07-01',
                    externalFirmId: null,
                    firmId: FIRST_FIRM.id,
                    id: ROUND_ID,
                    label: 'Q1 push',
                    notes: null,
                    openedOn: '2026-06-01',
                    status: RoundStatus.Closed,
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha', { roundId: ROUND_ID })]),
        );
        const paidFee: LedgerFeeRow = {
            accountId: ALPHA_ID,
            amountCents: usdCents(10_000),
            id: 'fee-alpha',
            kind: FeeKind.EvalPurchase,
            paidOn: '2026-06-01',
            userId: USER_ID,
        };
        harness.queries.set('fee.list', answer([paidFee]));
        const paidPayout: LedgerPayoutRow = {
            accountId: ALPHA_ID,
            approvedOn: null,
            grossCents: usdCents(30_000),
            id: 'payout-alpha',
            netCents: usdCents(30_000),
            paidOn: '2026-06-25',
            requestedOn: '2026-06-20',
            status: PayoutStatus.Paid,
            userId: USER_ID,
        };
        harness.queries.set('payout.list', answer([paidPayout]));
        render();

        expect(container.textContent).toContain('Next round');
        expect(container.textContent).toContain('Q1 push');
        const instance = toolsWorkerBox.instances[0];
        expect(instance).toBeDefined();
        const calls = (instance?.runSpy as unknown as ReturnType<typeof vi.fn>)
            .mock.calls;
        expect(calls).toHaveLength(1);
        const [request] = calls.at(-1) as [{ kind: string; runId: number }];
        expect(request.kind).toBe('next-round');

        act(() => {
            instance?.setState({
                phase: 'succeeded',
                result: {
                    kind: ToolsResponseKind.NextRound,
                    optionA: fakeTimelineResult(150),
                    optionB: fakeTimelineResult(900),
                    runId: request.runId,
                },
            });
        });

        expect(container.textContent).toContain('thresholds not set');
        expect(container.textContent).toContain('Recommended');
    });

    it(
        'does not double-fire the next-round worker request when a query refetch returns ' +
            'a referentially new but content-identical array (PT-62e CRITICAL runId-in-key fix)',
        () => {
            harness.queries.set(
                'round.list',
                answer([
                    {
                        budgetCents: null,
                        closedOn: '2026-07-01',
                        externalFirmId: null,
                        firmId: FIRST_FIRM.id,
                        id: ROUND_ID,
                        label: 'Q1 push',
                        notes: null,
                        openedOn: '2026-06-01',
                        status: RoundStatus.Closed,
                        userId: USER_ID,
                    },
                ]),
            );
            harness.queries.set(
                'account.list',
                answer([account(ALPHA_ID, 'Alpha', { roundId: ROUND_ID })]),
            );
            const paidFee: LedgerFeeRow = {
                accountId: ALPHA_ID,
                amountCents: usdCents(10_000),
                id: 'fee-alpha',
                kind: FeeKind.EvalPurchase,
                paidOn: '2026-06-01',
                userId: USER_ID,
            };
            harness.queries.set('fee.list', answer([paidFee]));
            const paidPayout: LedgerPayoutRow = {
                accountId: ALPHA_ID,
                approvedOn: null,
                grossCents: usdCents(30_000),
                id: 'payout-alpha',
                netCents: usdCents(30_000),
                paidOn: '2026-06-25',
                requestedOn: '2026-06-20',
                status: PayoutStatus.Paid,
                userId: USER_ID,
            };
            harness.queries.set('payout.list', answer([paidPayout]));
            render();

            const instance = toolsWorkerBox.instances[0];
            expect(instance).toBeDefined();
            const calls = (
                instance?.runSpy as unknown as ReturnType<typeof vi.fn>
            ).mock.calls;
            expect(calls).toHaveLength(1);

            harness.queries.set('fee.list', answer([{ ...paidFee }]));
            harness.queries.set('payout.list', answer([{ ...paidPayout }]));
            harness.queries.set(
                'account.list',
                answer([account(ALPHA_ID, 'Alpha', { roundId: ROUND_ID })]),
            );
            render();

            expect(calls).toHaveLength(1);
        },
    );

    it('names a ledger-only member of the closed round as left out of the next-round pricing', () => {
        harness.queries.set(
            'round.list',
            answer([
                {
                    budgetCents: null,
                    closedOn: '2026-07-01',
                    externalFirmId: null,
                    firmId: FIRST_FIRM.id,
                    id: ROUND_ID,
                    label: 'Q1 push',
                    notes: null,
                    openedOn: '2026-06-01',
                    status: RoundStatus.Closed,
                    userId: USER_ID,
                },
            ]),
        );
        harness.queries.set(
            'account.list',
            answer([
                account(ALPHA_ID, 'Alpha', { roundId: ROUND_ID }),
                account(BRAVO_ID, 'My own tracked account', {
                    planLabel: 'My own tracked plan',
                    planSerial: null,
                    roundId: ROUND_ID,
                    tracking: AccountTracking.LedgerOnly,
                }),
            ]),
        );
        const paidFee: LedgerFeeRow = {
            accountId: ALPHA_ID,
            amountCents: usdCents(10_000),
            id: 'fee-alpha',
            kind: FeeKind.EvalPurchase,
            paidOn: '2026-06-01',
            userId: USER_ID,
        };
        harness.queries.set('fee.list', answer([paidFee]));
        render();

        expect(container.textContent).toContain('Next round');
        expect(container.textContent).toContain('My own tracked account');
    });
});

function fakeTimelineResult(cashEnd: number) {
    return {
        cardsBoughtP50: 1,
        cashP10: [100, cashEnd],
        cashP50: [100, cashEnd],
        cashP90: [100, cashEnd],
        cumulativeSpendP10: [0, 0],
        cumulativeSpendP50: [0, 0],
        cumulativeSpendP90: [0, 0],
        days: [0, 1],
        measuredCycleDays: null,
        pathRuin: 0.1,
        payoutP10: [0, 0],
        payoutP50: [0, 0],
        payoutP90: [0, 0],
        pFinalNetNegative: 0.2,
        withdrawnP10: [0, 0],
        withdrawnP50: [0, 0],
        withdrawnP90: [0, 0],
    };
}
