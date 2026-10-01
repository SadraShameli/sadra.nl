import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseAccountAdviceModule from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
} from '~/lib/prop-accounts';
import { ApexVariant, findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
import * as advisorLib from '~/lib/prop-calculator/advisor';
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
    refetch?: () => unknown;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    type MutateMock = ReturnType<typeof vi.fn<(input: unknown) => void>>;
    const mutate = new Map<string, MutateMock>();
    const invalidate = vi.fn(() => Promise.resolve());
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function mutateOf(name: string): MutateMock {
        const existing = mutate.get(name);
        if (existing !== undefined) return existing;
        const created = vi.fn<(input: unknown) => void>();
        mutate.set(name, created);
        return created;
    }
    return {
        invalidate,
        mutate,
        mutateOf,
        mutation: (name: string) => ({
            useMutation: (options: {
                onError?: (error: unknown) => void;
                onSuccess?: () => void;
            } = {}) => ({
                isPending: false,
                mutate: (input: unknown) => {
                    mutateOf(name)(input);
                    options.onSuccess?.();
                },
            }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        reset() {
            queries.clear();
            mutate.clear();
            invalidate.mockClear();
        },
    };
});

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

const sessionBox = vi.hoisted(() => {
    const box: {
        state: {
            data: null | { user: { id: string } };
            error: null | { message: string };
            isPending: boolean;
        };
    } = {
        state: { data: { user: { id: 'user-a' } }, error: null, isPending: false },
    };
    return box;
});

vi.mock('~/lib/auth/client', () => ({
    useSession: () => sessionBox.state,
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
                create: harness.mutation('decision.create'),
                listForAccount: harness.query('decision.listForAccount'),
                recordActual: harness.mutation('decision.recordActual'),
            },
            event: {
                list: harness.query('event.list'),
                listForAccount: harness.query('event.listForAccount'),
            },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                listForAccount: harness.query('snapshot.listForAccount'),
            },
        },
        useUtils: () => ({
            propAccounts: {
                decision: { invalidate: harness.invalidate },
                invalidate: harness.invalidate,
            },
        }),
    },
}));

type FakeAdviceState =
    | {
          readonly advice: unknown;
          readonly failedOptima: readonly {
              readonly reason: string;
              readonly source: string;
          }[];
          readonly phase: 'ready';
      }
    | { readonly phase: 'failed'; readonly reason: string; readonly retry: () => void }
    | { readonly phase: 'loading' };

const adviceBox = vi.hoisted(() => {
    const box: { inputs: unknown[]; state: FakeAdviceState } = {
        inputs: [],
        state: { phase: 'loading' },
    };
    return box;
});

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice',
    async (importOriginal) => {
        const actual = await importOriginal<typeof UseAccountAdviceModule>();
        return {
            ...actual,
            useAccountAdvice: (input: unknown) => {
                adviceBox.inputs.push(input);
                return adviceBox.state;
            },
        };
    },
);

const { AccountAdvicePhase } = await import(
    '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice'
);
const { AdvicePanel } = await import(
    '~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel'
);
const { EvalSizingAdvisor, FundedSizingAdvisor } = await import(
    '~/lib/prop-calculator/advisor'
);
const { TradingPhase } = await import('~/lib/prop-calculator/core');
const { newFundedCycleTracker } = await import('~/lib/prop-calculator');

function account(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 50_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-08-01T12:00:00Z'),
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

function answerEverything(overrides: Record<string, FakeQuery> = {}) {
    harness.queries.set('account.get', answer(account()));
    harness.queries.set('account.list', answer([account()]));
    harness.queries.set('snapshot.listForAccount', answer([snapshot()]));
    harness.queries.set('event.list', answer([]));
    harness.queries.set('event.listForAccount', answer([]));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('decision.listForAccount', answer([]));
    for (const [name, query] of Object.entries(overrides)) {
        harness.queries.set(name, query);
    }
}

function failed(message: string, refetch = vi.fn()): FakeQuery {
    return {
        data: undefined,
        error: new Error(message),
        isError: true,
        isPending: false,
        refetch,
    };
}

function pendingQuery(): FakeQuery {
    return { data: undefined, error: null, isError: false, isPending: true };
}

function realFundedAdvice() {
    const state = {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
    const tracker = newFundedCycleTracker({ ...state, balance: state.startingBalance });
    const advisor = new FundedSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: state.balance - state.threshold,
            fundedTracker: tracker,
            kind: TradingPhase.Funded,
            plan: PLAN,
            resolvedDailyLossLimit: null,
            state,
        },
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        today: '2026-09-26',
        trials: 20,
    });
    return advisor.assemble([]);
}

function snapshot(overrides: Record<string, unknown> = {}) {
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
        ...overrides,
    };
}

describe('AdvicePanel (PT-34, F-131, F-132)', () => {
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
        harness.reset();
        sessionBox.state = {
            data: { user: { id: USER_ID } },
            error: null,
            isPending: false,
        };
        adviceBox.state = { phase: AccountAdvicePhase.Loading };
        adviceBox.inputs = [];
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

    it('shows a loading state while the account query is pending', () => {
        harness.queries.set('account.get', pendingQuery());
        render();

        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it('shows a not-modeled state for a ledger-only account', () => {
        answerEverything({
            'account.get': answer(
                account({
                    externalFirmId: 'external-firm-1',
                    firmId: null,
                    planLabel: 'My prop account',
                    planSerial: null,
                    tracking: AccountTracking.LedgerOnly,
                }),
            ),
        });
        render();

        expect(container.textContent).toContain('not modeled');
    });

    it('shows a loading state while the advice worker is running', () => {
        answerEverything();
        adviceBox.state = { phase: AccountAdvicePhase.Loading };
        render();

        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it('shows an error state when the advice worker fails', () => {
        answerEverything();
        adviceBox.state = {
            phase: AccountAdvicePhase.Failed,
            reason: 'the engine refused these inputs',
            retry: vi.fn(),
        };
        render();

        expect(container.textContent).toContain(
            'The advice could not be computed',
        );
        expect(container.textContent).toContain(
            'the engine refused these inputs',
        );
    });

    it('retries the advice computation when "Retry" is clicked after a failure', () => {
        answerEverything();
        const retry = vi.fn();
        adviceBox.state = {
            phase: AccountAdvicePhase.Failed,
            reason: 'the engine refused these inputs',
            retry,
        };
        render();

        const button = [...container.querySelectorAll('button')].find(
            (candidate) => candidate.textContent === 'Retry',
        );
        if (button === undefined) throw new Error('no Retry button');
        act(() => {
            button.click();
        });

        expect(retry).toHaveBeenCalledTimes(1);
    });

    it('shows the ready advice: headline, optima, reasons, assumptions, provenance', () => {
        answerEverything();
        adviceBox.state = {
            advice: realFundedAdvice(),
            failedOptima: [],
            phase: AccountAdvicePhase.Ready,
        };
        render();

        expect(container.textContent).toContain('your documented rule');
        expect(container.querySelectorAll('table').length).toBeGreaterThan(0);
    });

    it('shows a left-out row for an engine request the worker failed to compute (review finding: dropped worker failures)', () => {
        answerEverything();
        adviceBox.state = {
            advice: realFundedAdvice(),
            failedOptima: [
                {
                    reason: 'the ladder grid exceeded the size limit',
                    source: 'ladder-search-fresh',
                },
            ],
            phase: AccountAdvicePhase.Ready,
        };
        render();

        expect(container.textContent).toContain(
            'Left out: the ladder grid exceeded the size limit',
        );
    });

    it("shows a stale state with the reason and no amounts when the advice is stale", () => {
        answerEverything();
        const advisor = new EvalSizingAdvisor({
            account: {
                assumptions: [],
                contractLimit: null,
                cushion: 2000,
                fundedTracker: null,
                kind: TradingPhase.Eval,
                plan: PLAN,
                resolvedDailyLossLimit: null,
                state: {
                    balance: 51_000,
                    bestDayProfit: 0,
                    consecutiveIdleDays: 0,
                    elapsedDays: 10,
                    intradayHighProfit: 0,
                    peakDayCloseProfit: 0,
                    peakIntradayProfit: 0,
                    qualifyingDays: 0,
                    startingBalance: 50_000,
                    threshold: 48_000,
                    thresholdLocked: false,
                    todayPnL: 0,
                    tradingDays: 10,
                },
            },
            maxEvalDays: 150,
            rulebook: DEFAULT_RULEBOOK,
            sims: 20,
            snapshotAsOf: '2026-01-01',
            today: '2026-09-26',
        });
        adviceBox.state = {
            advice: advisor.assemble([]),
            failedOptima: [],
            phase: AccountAdvicePhase.Ready,
        };
        render();

        expect(container.textContent).toContain(
            "Enter today's balance to see sized amounts again.",
        );
    });

    it('calls decision.create with the snapshot id, the stored stage and the source when "Accept size" is clicked', () => {
        answerEverything();
        adviceBox.state = {
            advice: realFundedAdvice(),
            failedOptima: [],
            phase: AccountAdvicePhase.Ready,
        };
        render();

        const button = [...container.querySelectorAll('button')].find(
            (candidate) => candidate.textContent === 'Accept size',
        );
        if (button === undefined) throw new Error('no Accept size button');
        act(() => {
            button.click();
        });

        const call = harness.mutateOf('decision.create').mock
            .calls[0]?.[0] as {
            acceptedRungsCents: number[];
            snapshotId: null | string;
            stage: string;
        };
        expect(call).toBeDefined();
        expect(call.snapshotId).toBe('snap-1');
        expect(call.stage).toBe(AccountStage.Eval);
        expect(call.acceptedRungsCents.every((cents) => cents > 0)).toBe(
            true,
        );
    });

    it('calls decision.recordActual when "Record actual" is used', () => {
        answerEverything({
            'decision.listForAccount': answer([
                {
                    acceptedRiskCents: 50_000,
                    acceptedRungsCents: [50_000],
                    accountId: ACCOUNT_ID,
                    actualRiskCents: null,
                    createdAt: new Date('2026-09-26T12:00:00Z'),
                    decidedOn: '2026-09-26',
                    headlineRiskCents: 50_000,
                    id: 'decision-1',
                    note: null,
                    snapshotId: 'snap-1',
                    source: 'funded-sweep-fresh',
                    stage: AccountStage.Eval,
                    updatedAt: new Date('2026-09-26T12:00:00Z'),
                    userId: USER_ID,
                },
            ]),
        });
        adviceBox.state = {
            advice: realFundedAdvice(),
            failedOptima: [],
            phase: AccountAdvicePhase.Ready,
        };
        render();

        const input = container.querySelector('input[type="number"]');
        if (input === null) throw new Error('no actual risk input');
        act(() => {
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set?.call(input, '450');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const button = [...container.querySelectorAll('button')].find(
            (candidate) => candidate.textContent === 'Record actual',
        );
        if (button === undefined) throw new Error('no Record actual button');
        act(() => {
            button.click();
        });

        const call = harness.mutateOf('decision.recordActual').mock
            .calls[0]?.[0] as { actualRiskCents: number; id: string };
        expect(call).toBeDefined();
        expect(call.id).toBe('decision-1');
        expect(call.actualRiskCents).toBe(45_000);
    });

    it("passes the plan's firm policy to the advisor (PT-34b)", () => {
        const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
        answerEverything();
        render();

        expect(spy).toHaveBeenCalled();
        const options = spy.mock.calls[0]?.[1];
        expect(options?.accountPolicy).toBe(findFirm(FirmId.Apex)?.accountPolicy);
    });

    it('passes a measured rebuy lag from the accounts already loaded on the detail page to the advisor (PT-34b)', () => {
        const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
        const priorId = 'prior-account';
        answerEverything({
            'account.get': answer(
                account({ purchasedOn: '2026-08-13', replacesAccountId: priorId }),
            ),
            'account.list': answer([
                account({ purchasedOn: '2026-08-13', replacesAccountId: priorId }),
                account({ id: priorId, status: AccountStatus.Busted }),
            ]),
            'event.list': answer([
                {
                    accountId: priorId,
                    createdAt: new Date('2026-08-03T12:00:00Z'),
                    detail: { changes: [], note: null },
                    id: 'e-purchased',
                    kind: AccountEventKind.Purchased,
                    occurredOn: '2026-08-03',
                    updatedAt: new Date('2026-08-03T12:00:00Z'),
                    userId: USER_ID,
                },
                {
                    accountId: priorId,
                    createdAt: new Date('2026-08-10T12:00:00Z'),
                    detail: { changes: [], note: null },
                    id: 'e-busted',
                    kind: AccountEventKind.Busted,
                    occurredOn: '2026-08-10',
                    updatedAt: new Date('2026-08-10T12:00:00Z'),
                    userId: USER_ID,
                },
            ]),
        });
        render();

        expect(spy).toHaveBeenCalled();
        const options = spy.mock.calls[0]?.[1];
        expect(options?.measuredRebuyLag).toEqual({ days: 2, samples: 1 });
    });

    it('waits for the portfolio-wide queries before building the advisor, so it never runs with an assumed rebuy lag (PT-34b)', () => {
        const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
        const priorId = 'prior-account';
        answerEverything({
            'account.get': answer(
                account({ purchasedOn: '2026-08-13', replacesAccountId: priorId }),
            ),
            'account.list': pendingQuery(),
            'event.list': pendingQuery(),
        });
        render();

        expect(spy).not.toHaveBeenCalled();
        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

        harness.queries.set(
            'account.list',
            answer([
                account({ purchasedOn: '2026-08-13', replacesAccountId: priorId }),
                account({ id: priorId, status: AccountStatus.Busted }),
            ]),
        );
        harness.queries.set(
            'event.list',
            answer([
                {
                    accountId: priorId,
                    createdAt: new Date('2026-08-03T12:00:00Z'),
                    detail: { changes: [], note: null },
                    id: 'e-purchased',
                    kind: AccountEventKind.Purchased,
                    occurredOn: '2026-08-03',
                    updatedAt: new Date('2026-08-03T12:00:00Z'),
                    userId: USER_ID,
                },
                {
                    accountId: priorId,
                    createdAt: new Date('2026-08-10T12:00:00Z'),
                    detail: { changes: [], note: null },
                    id: 'e-busted',
                    kind: AccountEventKind.Busted,
                    occurredOn: '2026-08-10',
                    updatedAt: new Date('2026-08-10T12:00:00Z'),
                    userId: USER_ID,
                },
            ]),
        );
        render();

        expect(spy).toHaveBeenCalledTimes(1);
        const options = spy.mock.calls[0]?.[1];
        expect(options?.measuredRebuyLag).toEqual({ days: 2, samples: 1 });
    });

    it('shows a data-integrity alert instead of a silent assumption when a stored replacement date cannot be measured (PT-34b)', () => {
        const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
        const priorId = 'prior-account';
        const corruptId = 'corrupt-sibling-account';
        answerEverything({
            'account.list': answer([
                account(),
                account({
                    id: corruptId,
                    purchasedOn: '2026-02-30',
                    replacesAccountId: priorId,
                }),
                account({ id: priorId, status: AccountStatus.Busted }),
            ]),
            'event.list': answer([
                {
                    accountId: priorId,
                    createdAt: new Date('2026-08-03T12:00:00Z'),
                    detail: { changes: [], note: null },
                    id: 'e-purchased',
                    kind: AccountEventKind.Purchased,
                    occurredOn: '2026-08-03',
                    updatedAt: new Date('2026-08-03T12:00:00Z'),
                    userId: USER_ID,
                },
                {
                    accountId: priorId,
                    createdAt: new Date('2026-08-10T12:00:00Z'),
                    detail: { changes: [], note: null },
                    id: 'e-busted',
                    kind: AccountEventKind.Busted,
                    occurredOn: '2026-08-10',
                    updatedAt: new Date('2026-08-10T12:00:00Z'),
                    userId: USER_ID,
                },
            ]),
        });
        adviceBox.state = {
            advice: realFundedAdvice(),
            failedOptima: [],
            phase: AccountAdvicePhase.Ready,
        };
        render();

        expect(container.textContent).toContain(
            'The rebuy lag could not be measured',
        );
        expect(container.textContent).toContain(
            'Not a calendar date: "2026-02-30".',
        );
        expect(container.textContent).toContain('zero-day rebuy lag');
        expect(spy).toHaveBeenCalled();
        const options = spy.mock.calls[0]?.[1];
        expect(options?.measuredRebuyLag).toBeNull();
    });

    it('builds the advisor with non-empty personal rules (PT-34b)', () => {
        const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
        answerEverything({
            'account.get': answer(
                account({
                    personalRules: {
                        dailyLossLimitCents: 100_000,
                        dailyProfitCapCents: 50_000,
                        maxTradesPerDay: 3,
                        payoutRequestOverrideCents: 25_000,
                        retainedCushionCents: 300_000,
                    },
                }),
            ),
        });
        render();

        expect(spy).toHaveBeenCalled();
        const options = spy.mock.calls[0]?.[1];
        expect(options?.personalDll).toBe(1000);
        expect(options?.personalPayoutOverride).toBe(250);
        expect(options?.personalRetainedCushion).toBe(3000);
        expect(options?.personalCaps?.dailyProfitCap).toBe(500);
        expect(options?.personalCaps?.maxTradesPerDay).toBe(3);
    });

    describe('the session (PT-34c)', () => {
        const priorId = 'prior-account';

        function replacementLedger() {
            answerEverything({
                'account.get': answer(
                    account({ purchasedOn: '2026-08-13', replacesAccountId: priorId }),
                ),
                'account.list': answer([
                    account({ purchasedOn: '2026-08-13', replacesAccountId: priorId }),
                    account({ id: priorId, status: AccountStatus.Busted }),
                ]),
                'event.list': answer([
                    {
                        accountId: priorId,
                        createdAt: new Date('2026-08-03T12:00:00Z'),
                        detail: { changes: [], note: null },
                        id: 'e-purchased',
                        kind: AccountEventKind.Purchased,
                        occurredOn: '2026-08-03',
                        updatedAt: new Date('2026-08-03T12:00:00Z'),
                        userId: USER_ID,
                    },
                    {
                        accountId: priorId,
                        createdAt: new Date('2026-08-10T12:00:00Z'),
                        detail: { changes: [], note: null },
                        id: 'e-busted',
                        kind: AccountEventKind.Busted,
                        occurredOn: '2026-08-10',
                        updatedAt: new Date('2026-08-10T12:00:00Z'),
                        userId: USER_ID,
                    },
                ]),
            });
        }

        it('shows a loading state and builds no advisor while the session is loading, even with every query answered', () => {
            const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
            replacementLedger();
            sessionBox.state = { data: null, error: null, isPending: true };
            render();

            expect(spy).not.toHaveBeenCalled();
            expect(adviceBox.inputs).toEqual([]);
            expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
        });

        it('builds the advisor with the measured rebuy lag once the session resolves', () => {
            const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
            replacementLedger();
            sessionBox.state = { data: null, error: null, isPending: true };
            render();
            expect(spy).not.toHaveBeenCalled();

            sessionBox.state = {
                data: { user: { id: USER_ID } },
                error: null,
                isPending: false,
            };
            render();

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0]?.[1]?.measuredRebuyLag).toEqual({
                days: 2,
                samples: 1,
            });
            expect(adviceBox.inputs.at(-1)).not.toBeNull();
        });

        it('says the user is signed out, not loading, and builds no advisor when the session resolved without a user', () => {
            const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
            replacementLedger();
            sessionBox.state = { data: null, error: null, isPending: false };
            render();

            expect(spy).not.toHaveBeenCalled();
            expect(container.querySelector('[aria-busy="true"]')).toBeNull();
            expect(container.textContent).toContain('Sign in');
            expect(adviceBox.inputs).toEqual([]);
        });

        it('says the session could not be read, not that the user is signed out, when the session fetch failed', () => {
            replacementLedger();
            sessionBox.state = {
                data: null,
                error: { message: 'session fetch failed' },
                isPending: false,
            };
            render();

            expect(container.textContent).toContain('session fetch failed');
            expect(container.textContent).not.toContain('Sign in');
            expect(container.querySelector('[aria-busy="true"]')).toBeNull();
        });
    });

    describe('a failed query (PT-34c review)', () => {
        it.each([
            ['account.get', 'account'],
            ['account.list', 'accounts'],
            ['snapshot.listForAccount', 'snapshots'],
            ['event.listForAccount', 'events'],
            ['event.list', 'ledger events'],
            ['payout.list', 'payouts'],
            ['rulebook.get', 'rulebook'],
        ])('shows the error of %s instead of the loading skeleton', (name) => {
            answerEverything({ [name]: failed(`${name} exploded`) });
            render();

            expect(container.textContent).toContain(`${name} exploded`);
            expect(container.querySelector('[aria-busy="true"]')).toBeNull();
            expect(adviceBox.inputs).toEqual([]);
        });

        it('offers a retry that refetches the failed query', () => {
            const refetch = vi.fn();
            answerEverything({ 'event.list': failed('boom', refetch) });
            render();

            const button = [...container.querySelectorAll('button')].find(
                (candidate) => candidate.textContent === 'Retry',
            );
            if (button === undefined) throw new Error('no Retry button');
            act(() => {
                button.click();
            });

            expect(refetch).toHaveBeenCalledTimes(1);
        });

        it('says so when the decision log could not be loaded instead of showing an empty log', () => {
            answerEverything({
                'decision.listForAccount': failed('decisions exploded'),
            });
            adviceBox.state = {
                advice: realFundedAdvice(),
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            expect(container.textContent).toContain('decisions exploded');
            expect(container.textContent).toContain('Sizing advice');
        });
    });

    describe('named failures and a failed refresh (PT-34d)', () => {
        it('names the source of each failed input query when several fail with the same message', () => {
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(vi.fn());
            answerEverything({
                'account.list': failed('network down'),
                'payout.list': failed('network down'),
            });
            render();

            expect(container.textContent).toContain(
                'The accounts list could not be loaded',
            );
            expect(container.textContent).toContain(
                'The payouts could not be loaded',
            );
            const keyWarnings = errorSpy.mock.calls.filter((call) =>
                String(call[0]).includes('same key'),
            );
            expect(keyWarnings).toEqual([]);
        });

        it('shows the advice with a could-not-refresh notice when a background refetch failed and the previous data is kept', () => {
            answerEverything({
                'payout.list': {
                    data: [],
                    error: new Error('refetch exploded'),
                    isError: true,
                    isPending: false,
                },
            });
            adviceBox.state = {
                advice: realFundedAdvice(),
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            expect(container.textContent).toContain('Sizing advice');
            expect(container.textContent).toContain(
                'The payouts could not be refreshed',
            );
            expect(container.textContent).toContain('refetch exploded');
            expect(container.textContent).not.toContain(
                'The advice inputs could not be loaded',
            );
        });

        it('offers a retry for the failed refresh that refetches that query only', () => {
            const refetch = vi.fn();
            answerEverything({
                'payout.list': {
                    data: [],
                    error: new Error('refetch exploded'),
                    isError: true,
                    isPending: false,
                    refetch,
                },
            });
            adviceBox.state = {
                advice: realFundedAdvice(),
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            const button = [...container.querySelectorAll('button')].find(
                (candidate) => candidate.textContent === 'Retry refresh',
            );
            if (button === undefined) throw new Error('no Retry refresh button');
            act(() => {
                button.click();
            });

            expect(refetch).toHaveBeenCalledTimes(1);
        });

        it('says which figures may be stale and withholds the Accept size action while a refresh failed', () => {
            answerEverything({
                'snapshot.listForAccount': {
                    data: [snapshot()],
                    error: new Error('refetch exploded'),
                    isError: true,
                    isPending: false,
                },
            });
            adviceBox.state = {
                advice: realFundedAdvice(),
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            expect(container.textContent).toContain(
                'may not reflect your latest snapshots',
            );
            const button = [...container.querySelectorAll('button')].find(
                (candidate) => candidate.textContent === 'Accept size',
            );
            if (button === undefined) throw new Error('no Accept size button');
            expect(button.disabled).toBe(true);
        });

        it('offers Accept size again once no refresh has failed', () => {
            answerEverything();
            adviceBox.state = {
                advice: realFundedAdvice(),
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            const button = [...container.querySelectorAll('button')].find(
                (candidate) => candidate.textContent === 'Accept size',
            );
            if (button === undefined) throw new Error('no Accept size button');
            expect(button.disabled).toBe(false);
        });

        it('keeps blocking on a failed query that has no previous data', () => {
            answerEverything({ 'payout.list': failed('first load exploded') });
            adviceBox.state = {
                advice: realFundedAdvice(),
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            expect(container.textContent).toContain('first load exploded');
            expect(container.textContent).not.toContain('Sizing advice');
        });

        it('moves today to the next day at midnight without a remount', () => {
            vi.useFakeTimers({
                now: new Date('2026-09-26T23:59:00Z'),
                toFake: ['Date', 'setTimeout', 'clearTimeout'],
            });
            const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
            answerEverything();
            render();

            expect(spy.mock.calls.at(-1)?.[1].today).toBe('2026-09-26');

            act(() => {
                vi.advanceTimersByTime(2 * 60 * 1000);
            });

            expect(spy.mock.calls.at(-1)?.[1].today).toBe('2026-09-27');
        });

        it('moves today when the page becomes visible again after the timer was throttled past midnight', () => {
            vi.useFakeTimers({
                now: new Date('2026-09-26T23:59:00Z'),
                toFake: ['Date', 'setTimeout', 'clearTimeout'],
            });
            const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
            answerEverything();
            render();
            expect(spy.mock.calls.at(-1)?.[1].today).toBe('2026-09-26');

            vi.setSystemTime(new Date('2026-09-27T08:00:00Z'));
            act(() => {
                document.dispatchEvent(new Event('visibilitychange'));
            });

            expect(spy.mock.calls.at(-1)?.[1].today).toBe('2026-09-27');
        });

        it('moves today when the window regains focus after the timer was throttled past midnight', () => {
            vi.useFakeTimers({
                now: new Date('2026-09-26T23:59:00Z'),
                toFake: ['Date', 'setTimeout', 'clearTimeout'],
            });
            const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
            answerEverything();
            render();

            vi.setSystemTime(new Date('2026-09-27T08:00:00Z'));
            act(() => {
                window.dispatchEvent(new Event('focus'));
            });

            expect(spy.mock.calls.at(-1)?.[1].today).toBe('2026-09-27');
        });

        it('stops listening for visibility and focus after unmount', () => {
            const documentRemove = vi.spyOn(document, 'removeEventListener');
            const windowRemove = vi.spyOn(window, 'removeEventListener');
            answerEverything();
            render();
            act(() => {
                root.unmount();
            });
            root = createRoot(container);

            expect(documentRemove).toHaveBeenCalledWith(
                'visibilitychange',
                expect.any(Function),
            );
            expect(windowRemove).toHaveBeenCalledWith(
                'focus',
                expect.any(Function),
            );
        });
    });
});
