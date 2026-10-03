import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ContractsSizingModule from '~/app/(app)/prop-calculator/accounts/_components/advice/contractsSizingModel';
import type * as UseAccountAdviceModule from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';

import { AdvisorRequestOutcomeKind } from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
} from '~/lib/prop-accounts';
import {
    ApexVariant,
    type Dollars,
    dollars,
    findFirm,
    FirmId,
    serializePlanId,
} from '~/lib/prop-calculator';
import * as advisorLib from '~/lib/prop-calculator/advisor';
import {
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    RetainedCushionBasis,
} from '~/lib/prop-calculator/advisor';
import * as advisorValue from '~/lib/prop-calculator/advisor/value';

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
            useMutation: (
                options: {
                    onError?: (error: unknown) => void;
                    onSuccess?: () => void;
                } = {},
            ) => ({
                isPending: false,
                mutate: (input: unknown) => {
                    mutateOf(name)(input);
                    options.onSuccess?.();
                },
            }),
        }),
        payoutQuery: () => ({
            useQuery: (input?: { accountId?: string }) =>
                (input?.accountId === undefined
                    ? (queries.get('payout.list.ledger') ??
                      queries.get('payout.list'))
                    : queries.get('payout.list')) ?? pending,
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
        state: {
            data: { user: { id: 'user-a' } },
            error: null,
            isPending: false,
        },
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
            payout: { list: harness.payoutQuery() },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: {
                listForAccount: harness.query('snapshot.listForAccount'),
            },
            violation: {
                create: harness.mutation('violation.create'),
                list: harness.query('violation.list'),
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
          readonly values?: unknown;
      }
    | {
          readonly phase: 'failed';
          readonly reason: string;
          readonly retry: () => void;
      }
    | { readonly phase: 'loading' };

const adviceBox = vi.hoisted(() => {
    const box: {
        adjust: ((derived: unknown) => unknown) | null;
        inputs: unknown[];
        state: FakeAdviceState;
    } = {
        adjust: null,
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
                const { state } = adviceBox;
                if (state.phase !== 'ready') return state;
                const derived =
                    adviceBox.adjust === null
                        ? state.advice
                        : adviceBox.adjust(
                              (
                                  input as {
                                      advisor: { assemble: (r: []) => unknown };
                                  }
                              ).advisor.assemble([]),
                          );
                return { values: { phase: 'idle' }, ...state, advice: derived };
            },
        };
    },
);

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/advice/contractsSizingModel',
    async (importOriginal) => {
        const actual = await importOriginal<typeof ContractsSizingModule>();
        return {
            ...actual,
            contractsSizingOf: vi.fn(actual.contractsSizingOf),
        };
    },
);

const { AccountAdvicePhase } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice');
const { contractsSizingOf } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/contractsSizingModel');
const { AdvicePanel } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel');
const { EvalSizingAdvisor, FundedSizingAdvisor } =
    await import('~/lib/prop-calculator/advisor');
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

function accountWith(personalRules: Record<string, unknown>) {
    answerEverything({
        'account.get': answer(account({ personalRules })),
    });
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
    harness.queries.set('violation.list', answer([]));
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

function readyAdviceWithProjection(personalDll: Dollars | null): unknown {
    const advisor = new FundedSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: 3500,
            fundedTracker: newFundedCycleTracker({
                balance: 50_000,
                bestDayProfit: 0,
                consecutiveIdleDays: 0,
                intradayHighProfit: 0,
                peakDayCloseProfit: 0,
                peakIntradayProfit: 0,
                qualifyingDays: 0,
                startingBalance: 50_000,
                threshold: 48_000,
                thresholdLocked: false,
                todayPnL: 0,
                tradingDays: 0,
            }),
            kind: TradingPhase.Funded,
            plan: PLAN,
            resolvedDailyLossLimit: null,
            state: {
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
            },
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        fundedHorizonDays: 252,
        personalDll,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    });
    return advisor.assemble([
        {
            projection: {
                accountLostBeforeFirstPayoutProbability: 0.1,
                accountLostBeforeFirstPayoutStandardError: 0.01,
                alreadyEligible: false,
                expectedCalendarDaysToFirstPayout: {
                    standardError: 0.5,
                    value: 12.3,
                },
                expectedResetFeeBeforeFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
                expectedSessionDaysToFirstPayout: {
                    standardError: 0.4,
                    value: 9,
                },
                firstPayoutCausedBreachProbability: 0,
                firstPayoutCausedBreachStandardError: 0,
                payingTrials: 150,
                trials: 200,
            },
            source: advisorLib.AdviceSource.NextPayoutProjection,
        },
    ]);
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
    const tracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    });
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
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
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

const VIDEO_FIGURES = ['600', '350', '466'];

function advisorOfLastInput(): {
    documented: () => unknown;
    optimumRequests: () => readonly unknown[];
} {
    return (
        lastInput() as unknown as {
            advisor: {
                documented: () => unknown;
                optimumRequests: () => readonly unknown[];
            };
        }
    ).advisor;
}

function decisionOf(id: string, actualRiskCents: null | number) {
    return {
        acceptedRiskCents: 50_000,
        acceptedRungsCents: [50_000],
        accountId: ACCOUNT_ID,
        actualRiskCents,
        createdAt: new Date('2026-09-26T12:00:00Z'),
        decidedOn: '2026-09-26',
        headlineRiskCents: 50_000,
        id,
        note: null,
        snapshotId: 'snap-1',
        source: 'ladder-search-fresh',
        stage: AccountStage.Eval,
        updatedAt: new Date('2026-09-26T12:00:00Z'),
        userId: USER_ID,
    };
}

function lastInput() {
    return adviceBox.inputs.at(-1) as {
        advisor: { dailyPlanCard: () => null | { rungs: { risk: number }[] } };
        values: null | {
            payoutStake: unknown;
            rungs: { risk: number; rr: number }[];
            spec: {
                enginePolicy: {
                    payoutRequestOverride: null | number;
                    retainedCushionRequest: null | number;
                };
                rulebook: unknown;
            };
            start: { phase: string };
        };
        valuesUnavailableReason?: null | string;
    };
}

function logViolationButton(
    container: HTMLElement,
): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find(
        (candidate) => candidate.textContent === 'Log violation',
    );
}

function succeeded<T>(value: T) {
    return { kind: AdvisorRequestOutcomeKind.Succeeded as const, value };
}

function valueOf(creditFree: number, standardError: number) {
    return advisorValue.valueResult(
        {
            creditFree: { standardError, value: creditFree },
            creditInclusive: { standardError, value: creditFree + 90 },
        },
        42,
        1000,
    );
}

function valuesFor(risk: number, overrides: Record<string, unknown> = {}) {
    const now = valueOf(1000, 10);
    const afterWin = valueOf(1400, 10);
    const afterLoss = valueOf(700, 8);
    const swing = {
        afterLoss,
        afterLossBusted: false,
        afterLossRebuyLagDays: null,
        afterWin,
        assumption: advisorValue.TRADE_VALUE_SWING_ASSUMPTION,
        deltaLoss: advisorValue.valueGap(now, afterLoss),
        deltaWin: advisorValue.valueGap(now, afterWin),
        kind: advisorValue.ValueResultKind.Swing,
        now,
        winProbability: 0.4,
    };
    const candidateRow = (placedRisk: number, value: number) => ({
        continuationValue: { standardError: 5, value },
        monthlyNetCharge: 0,
        netOfDurationCharge: value,
        placement: { contracts: null, intendedRisk: placedRisk, placedRisk },
        swing,
    });
    return {
        candidates: succeeded({
            basis: advisorValue.RiskCandidateBasis.Simulator,
            kind: advisorValue.ValueResultKind.Candidates,
            label: advisorValue.RISK_CANDIDATE_LABEL,
            rows: [candidateRow(risk / 2, 1500), candidateRow(risk, 900)],
        }),
        now: succeeded(now),
        payoutStake: null,
        swings: [succeeded(swing)].map((outcome) => ({
            outcome,
            rung: { risk, rr: 2 },
        })),
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
        adviceBox.adjust = null;
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

    it('shows a stale state with the reason and no amounts when the advice is stale', () => {
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
                ...NO_PENDING_PAYOUT_COUNTS,
            },
            maxEvalDays: 150,
            rulebook: DEFAULT_RULEBOOK,
            sims: 20,
            snapshotAsOf: '2026-01-01',
            substate: null,
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

        const call = harness.mutateOf('decision.create').mock.calls[0]?.[0] as {
            acceptedRungsCents: number[];
            snapshotId: null | string;
            stage: string;
        };
        expect(call).toBeDefined();
        expect(call.snapshotId).toBe('snap-1');
        expect(call.stage).toBe(AccountStage.Eval);
        expect(call.acceptedRungsCents.every((cents) => cents > 0)).toBe(true);
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
        expect(options?.accountPolicy).toBe(
            findFirm(FirmId.Apex)?.accountPolicy,
        );
    });

    it('shows the message of an unexpected advisor error as a not-modeled state instead of unmounting the panel', () => {
        vi.spyOn(advisorLib, 'createSizingAdvisor').mockImplementation(() => {
            throw new Error('the stored rulebook is inconsistent');
        });
        answerEverything();
        render();

        expect(container.textContent).toContain('not modeled');
        expect(container.textContent).toContain(
            'the stored rulebook is inconsistent',
        );
    });

    it('passes a measured rebuy lag from the accounts already loaded on the detail page to the advisor (PT-34b)', () => {
        const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
        const priorId = 'prior-account';
        answerEverything({
            'account.get': answer(
                account({
                    purchasedOn: '2026-08-13',
                    replacesAccountId: priorId,
                }),
            ),
            'account.list': answer([
                account({
                    purchasedOn: '2026-08-13',
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
                account({
                    purchasedOn: '2026-08-13',
                    replacesAccountId: priorId,
                }),
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
                account({
                    purchasedOn: '2026-08-13',
                    replacesAccountId: priorId,
                }),
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
                    account({
                        purchasedOn: '2026-08-13',
                        replacesAccountId: priorId,
                    }),
                ),
                'account.list': answer([
                    account({
                        purchasedOn: '2026-08-13',
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
        }

        it('shows a loading state and builds no advisor while the session is loading, even with every query answered', () => {
            const spy = vi.spyOn(advisorLib, 'createSizingAdvisor');
            replacementLedger();
            sessionBox.state = { data: null, error: null, isPending: true };
            render();

            expect(spy).not.toHaveBeenCalled();
            expect(adviceBox.inputs).toEqual([]);
            expect(
                container.querySelector('[aria-busy="true"]'),
            ).not.toBeNull();
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
                'payout.list.ledger': answer([]),
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
            if (button === undefined)
                throw new Error('no Retry refresh button');
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

    function documentedRisk(): number {
        answerEverything();
        adviceBox.state = { phase: AccountAdvicePhase.Loading };
        render();
        const risk = lastInput().values?.rungs[0]?.risk;
        if (risk === undefined) throw new Error('no value request rung');
        return risk;
    }

    function readyWith(
        values: unknown,
        adjust: ((derived: unknown) => unknown) | null = (derived) => derived,
    ) {
        adviceBox.adjust = adjust;
        adviceBox.state = {
            advice: null,
            failedOptima: [],
            phase: AccountAdvicePhase.Ready,
            values: { phase: 'ready', result: values },
        };
        render();
    }

    function sectionOf(heading: string): HTMLElement {
        const found = [...container.querySelectorAll('h3')].find(
            (candidate) => candidate.textContent === heading,
        );
        const section = found?.parentElement;
        if (!section) throw new Error(`no section ${heading}`);
        return section;
    }

    function setField(label: string, text: string) {
        const input = container.querySelector<HTMLInputElement>(
            `input[aria-label="${CSS.escape(label)}"], input[id="${CSS.escape(label)}"]`,
        );
        if (input === null) throw new Error(`no input ${label}`);
        act(() => {
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set?.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    describe('value extensions (PT-67)', () => {
        it('asks the worker for the value request of the account state with a swing per daily rung', () => {
            answerEverything();
            render();

            const { values } = lastInput();
            expect(values).not.toBeNull();
            const rungs = lastInput().advisor.dailyPlanCard()?.rungs ?? [];
            expect(values?.rungs.map((rung) => rung.risk)).toEqual(
                rungs.map((rung) => rung.risk),
            );
            expect(values?.start.phase).toBe('eval');
            expect(values?.spec.rulebook).toEqual(DEFAULT_RULEBOOK);
            expect(values?.payoutStake).toBeNull();
        });

        it('shows win and loss EV per rung, the one-step tree and the one-step candidates with the documented rung marked', () => {
            const risk = documentedRisk();

            readyWith(valuesFor(risk));

            const section = sectionOf(
                'What the next trade does to value',
            ).textContent;
            expect(section).toContain('win: +$400 EV');
            expect(section).toContain('loss: -$300 EV');
            expect(
                container.querySelector('[aria-label="One-step value tree"]'),
            ).not.toBeNull();
            const candidates = sectionOf(
                'One-step risk candidates',
            ).textContent;
            expect(candidates).toContain(
                'one-step comparison, documented sizing afterwards',
            );
            expect(candidates).toContain('Documented rung');
        });

        it('shows the eval candidates unranked, with the documented sizing rule stated', () => {
            const risk = documentedRisk();

            readyWith(valuesFor(risk));

            const section = sectionOf('One-step risk candidates');
            expect(section.textContent).toContain('maximum allowed risk');
            expect(
                [...section.querySelectorAll('th')].map(
                    (header) => header.textContent,
                ),
            ).not.toContain('Rank');
        });

        it('fills the daily card with V now and the values after a win and a loss', () => {
            const risk = documentedRisk();

            readyWith(valuesFor(risk));

            expect(sectionOf("Today's plan").textContent).toContain(
                'Value now $1,000; after a win $1,400; after a loss $700',
            );
        });

        it('does not append a flat-risk reason for an eval account, where the documented rung is the maximum', () => {
            const risk = documentedRisk();

            readyWith(valuesFor(risk));

            expect(sectionOf('Reasons').textContent).not.toContain(
                'ignores your current state',
            );
        });

        it('states the session boundary the swing is valued at under the next trade value, on an eval account', () => {
            const risk = documentedRisk();

            readyWith(valuesFor(risk));

            const text = sectionOf(
                'What the next trade does to value',
            ).textContent;
            expect(text).toContain(
                'Assumption: valued at the next session start, as if you stop after this trade.',
            );
            expect(text).not.toContain('not modeled for eval accounts');
        });

        it('adds that the rest of the day rungs are not in the after-loss value when the documented rule keeps trading', () => {
            const risk = documentedRisk();
            const base = valuesFor(risk);

            readyWith({
                ...base,
                swings: [...base.swings, ...base.swings],
            });

            expect(
                sectionOf('What the next trade does to value').textContent,
            ).toContain(
                "the rest of today's rungs are not in the after-loss value",
            );
        });

        it('shows a failed value request as it is, never as a fixed eval line', () => {
            const risk = documentedRisk();
            const failure = {
                kind: AdvisorRequestOutcomeKind.Failed as const,
                reason: 'the engine refused this start',
            };

            readyWith(
                valuesFor(risk, {
                    candidates: failure,
                    swings: [{ outcome: failure, rung: { risk, rr: 2 } }],
                }),
            );

            const text = [
                sectionOf('What the next trade does to value'),
                sectionOf('One-step risk candidates'),
            ]
                .map((section) => section.textContent)
                .join(' ');
            expect(text).toContain('Left out: the engine refused this start');
            expect(text).not.toContain('not modeled for eval accounts');
        });

        it('states the run assumptions next to the value figures', () => {
            const risk = documentedRisk();

            readyWith(valuesFor(risk));

            const text = sectionOf(
                'What the next trade does to value',
            ).textContent;
            expect(text).toContain('Value runs: 1000 trials, seed 42');
            expect(text).toContain('rebuy lag assumed zero (optimistic)');
        });

        it('values the payout the way the account documents it: the personal request and the larger retained cushion', () => {
            answerEverything({
                'account.get': answer(
                    account({
                        personalRules: {
                            payoutRequestOverrideCents: 75_000,
                            retainedCushionCents: 300_000,
                        },
                    }),
                ),
            });
            render();

            const policy = lastInput().values?.spec.enginePolicy;
            expect(policy?.payoutRequestOverride).toBe(750);
            expect(policy?.retainedCushionRequest).toBe(3000);
        });

        it('states a left-out candidates computation instead of hiding it', () => {
            const risk = documentedRisk();

            readyWith(
                valuesFor(risk, {
                    candidates: {
                        kind: AdvisorRequestOutcomeKind.Failed,
                        reason: 'the engine refused this start',
                    },
                }),
            );

            expect(sectionOf('One-step risk candidates').textContent).toContain(
                'Left out: the engine refused this start',
            );
        });

        it('shows the advice with the value views still computing, not a blocked panel', () => {
            documentedRisk();
            adviceBox.adjust = (derived) => derived;
            adviceBox.state = {
                advice: null,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
                values: { phase: 'loading' },
            };
            render();

            expect(container.textContent).toContain('your documented rule');
            expect(
                container.querySelectorAll(
                    '[aria-label="Computing the value views"]',
                ),
            ).toHaveLength(2);
        });

        it('states a failed value run and retries it, keeping the advice', () => {
            documentedRisk();
            const retry = vi.fn();
            adviceBox.adjust = (derived) => derived;
            adviceBox.state = {
                advice: null,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
                values: {
                    phase: 'failed',
                    reason: 'the value run crashed',
                    retry,
                },
            };
            render();

            expect(container.textContent).toContain('your documented rule');
            expect(
                sectionOf('What the next trade does to value').textContent,
            ).toContain('Left out: the value run crashed');
            const button = [...container.querySelectorAll('button')].find(
                (candidate) =>
                    candidate.textContent === 'Retry the value views',
            );
            if (button === undefined) throw new Error('no retry button');
            act(() => {
                button.click();
            });
            expect(retry).toHaveBeenCalledTimes(1);
        });

        it('says the value views are unavailable when no value request could be built', () => {
            documentedRisk();
            adviceBox.adjust = (derived) => derived;
            adviceBox.state = {
                advice: null,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
                values: { phase: 'idle' },
            };
            render();

            expect(sectionOf('One-step risk candidates').textContent).toContain(
                'unavailable for this account state',
            );
        });

        it('says why the value views could not be built instead of going quiet', () => {
            documentedRisk();
            adviceBox.adjust = (derived) => derived;
            adviceBox.state = {
                advice: null,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
                values: {
                    phase: 'unavailable',
                    reason: 'a funded account needs its funded cycle tracker',
                },
            };
            render();

            expect(sectionOf('One-step risk candidates').textContent).toContain(
                'Left out: a funded account needs its funded cycle tracker',
            );
        });

        it('shows no payout banner for an account that cannot request a payout', () => {
            const risk = documentedRisk();

            readyWith(valuesFor(risk));

            expect(
                [...container.querySelectorAll('h3')].some(
                    (heading) => heading.textContent === 'Request payout',
                ),
            ).toBe(false);
        });

        it('shows the request-payout banner with the documented rungs unchanged when a payout can be requested', () => {
            const risk = documentedRisk();
            const stake = {
                continueNow: valueOf(1000, 10),
                kind: advisorValue.ValueResultKind.PayoutStake as const,
                reducedRiskWhatIf: {
                    label: advisorValue.REDUCED_RISK_WHAT_IF_LABEL,
                    risk: 125,
                    value: valueOf(900, 11),
                },
                requestedAmount: 500,
                requestNow: {
                    creditFree: { standardError: 9, value: 1300 },
                    creditInclusive: { standardError: 9, value: 1390 },
                },
                traderReceivesNow: 450,
            };
            const rungsBefore =
                lastInput().advisor.dailyPlanCard()?.rungs.length;

            readyWith(
                valuesFor(risk, { payoutStake: succeeded(stake) }),
                (derived) => ({
                    ...(derived as object),
                    payoutAdvice: {
                        assumptions: [],
                        caps: [],
                        documented: {
                            kind: 'request',
                            notice: null,
                            requestAmount: 500,
                            retainedCushion: 2000,
                            retainedCushionBasis: 'rulebook-size',
                            sources: [],
                        },
                        engineHorizonCredit: null,
                        netAfterSplit: 450,
                        ruleCappedWithdrawable: null,
                    },
                }),
            );

            const headings = [...container.querySelectorAll('h3')].map(
                (heading) => heading.textContent,
            );
            expect(headings).toContain('Request payout');
            expect(container.textContent).toContain('EV at stake');
            expect(container.textContent).toContain(
                'what-if: your documented rung is unchanged (QV-18)',
            );
            expect(
                sectionOf("Today's plan").querySelectorAll(':scope tbody tr'),
            ).toHaveLength(rungsBefore ?? -1);
        });

        it('links Size in contracts to the position size page with the risk, plan and instrument prefilled', () => {
            const risk = documentedRisk();

            readyWith(valuesFor(risk));

            const link = [...container.querySelectorAll('a')].find(
                (candidate) => candidate.textContent === 'Size in contracts',
            );
            if (link === undefined)
                throw new Error('no Size in contracts link');
            const href = link.getAttribute('href') ?? '';
            expect(href.startsWith('/prop-calculator/position-size?')).toBe(
                true,
            );
            const query = new URLSearchParams(href.split('?', 2)[1]);
            expect(query.get('psr')).toBe(String(risk));
            expect(query.get('psp')).toBe(serializePlanId(PLAN.id));
            expect(query.get('psi')).toBe('NQ');
            expect(query.has('pss')).toBe(false);
        });

        it('shows the whole contracts inline once a stop is entered', () => {
            const risk = documentedRisk();
            readyWith(valuesFor(risk));
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

            setField('daily-card-stop', '7.5');
            act(() => {
                vi.advanceTimersByTime(5000);
            });

            expect(sectionOf("Today's plan").textContent).toMatch(/\d+ NQ/);
        });

        it('renders a lock once the entered trades of the day have fired the stop', () => {
            const risk = documentedRisk();
            readyWith(valuesFor(risk));
            expect(sectionOf("Today's plan").textContent).not.toContain(
                'Stop for today:',
            );

            setField('Losses today', '50');

            expect(sectionOf("Today's plan").textContent).toContain(
                'Stop for today:',
            );
        });

        it('says a risk within the documented plan is within plan and offers no violation log', () => {
            const risk = documentedRisk();
            readyWith(valuesFor(risk));

            setField('Proposed risk ($)', '1');

            expect(
                sectionOf('Check a risk before you place it').textContent,
            ).toContain('Within your documented plan.');
            expect(
                [...container.querySelectorAll('button')].some(
                    (candidate) => candidate.textContent === 'Log violation',
                ),
            ).toBe(false);
        });

        it('flags a proposed risk above the documented rung after a loss without offering to log a violation for a trade not placed', () => {
            const risk = documentedRisk();
            answerEverything({
                'decision.listForAccount': answer([
                    decisionOf('decision-1', null),
                ]),
            });
            readyWith(valuesFor(risk));

            setField('Proposed risk ($)', '100000');
            setField('Losses today', '1');

            expect(
                sectionOf('Check a risk before you place it').textContent,
            ).toContain('Above the documented rung');
            expect(logViolationButton(container)).toBeUndefined();
        });

        it('logs a ForcedRecovery violation against the decision that holds the recorded actual risk, not the latest decision of the day', () => {
            const risk = documentedRisk();
            answerEverything({
                'decision.listForAccount': answer([
                    decisionOf('decision-later', null),
                    decisionOf('decision-recorded', 10_000_000),
                ]),
            });
            readyWith(valuesFor(risk));

            setField('Losses today', '1');
            const log = logViolationButton(container);
            if (log === undefined) throw new Error('no Log violation button');
            act(() => {
                log.click();
            });

            expect(harness.mutateOf('violation.create')).toHaveBeenCalledWith({
                accountId: ACCOUNT_ID,
                costCents: null,
                decisionId: 'decision-recorded',
                kind: 'forced-recovery',
                note: null,
                occurredOn: '2026-09-26',
            });
        });

        it('shows Violation recorded instead of the button for a decision that already has a violation of that kind, after a remount too', () => {
            const risk = documentedRisk();
            answerEverything({
                'decision.listForAccount': answer([
                    decisionOf('decision-recorded', 10_000_000),
                ]),
                'violation.list': answer([
                    {
                        accountId: ACCOUNT_ID,
                        decisionId: 'decision-recorded',
                        id: 'violation-1',
                        kind: 'forced-recovery',
                    },
                ]),
            });
            readyWith(valuesFor(risk));

            setField('Losses today', '1');

            expect(logViolationButton(container)).toBeUndefined();
            expect(
                sectionOf('Check a risk before you place it').textContent,
            ).toContain('Violation recorded');
        });

        it('says what day progress the recorded risk was judged against', () => {
            const risk = documentedRisk();
            answerEverything({
                'decision.listForAccount': answer([
                    decisionOf('decision-recorded', 10_000_000),
                ]),
            });
            readyWith(valuesFor(risk));

            expect(
                sectionOf('Check a risk before you place it').textContent,
            ).toContain(
                'Judged as the first trade of the day: no wins or losses are entered above.',
            );

            setField('Losses today', '1');

            expect(
                sectionOf('Check a risk before you place it').textContent,
            ).toContain('Judged against 0 wins and 1 loss entered above.');
        });

        it('shows the verdict for the recorded actual risk of a decision made today', () => {
            const risk = documentedRisk();
            answerEverything({
                'decision.listForAccount': answer([
                    {
                        acceptedRiskCents: 50_000,
                        acceptedRungsCents: [50_000],
                        accountId: ACCOUNT_ID,
                        actualRiskCents: 10_000_000,
                        createdAt: new Date('2026-09-26T12:00:00Z'),
                        decidedOn: '2026-09-26',
                        headlineRiskCents: 50_000,
                        id: 'decision-2',
                        note: null,
                        snapshotId: 'snap-1',
                        source: 'ladder-search-fresh',
                        stage: AccountStage.Eval,
                        updatedAt: new Date('2026-09-26T12:00:00Z'),
                        userId: USER_ID,
                    },
                ]),
            });
            readyWith(valuesFor(risk));

            const text = sectionOf(
                'Check a risk before you place it',
            ).textContent;
            expect(text).toContain('Recorded actual risk $100,000');
            expect(text).toContain('Above the documented rung');
        });

        it('says an invalid entry is invalid instead of checking it', () => {
            const risk = documentedRisk();
            readyWith(valuesFor(risk));

            setField('Proposed risk ($)', '-5');

            expect(
                sectionOf('Check a risk before you place it').textContent,
            ).toContain('Enter a risk above $0');
        });

        it('shows none of the video figures in the new sections', () => {
            const risk = documentedRisk();
            readyWith(valuesFor(risk));
            setField('Proposed risk ($)', '100000');
            setField('Losses today', '1');

            const text = [
                sectionOf('What the next trade does to value'),
                sectionOf('One-step risk candidates'),
                sectionOf('Check a risk before you place it'),
            ]
                .map((section) => section.textContent)
                .join(' ');
            for (const figure of VIDEO_FIGURES) {
                expect(text).not.toContain(figure);
            }
        });
    });

    describe('the panel passes the personal limits (PT-68g, F-V16)', () => {
        const NOT_CHECKED_TEXT = 'not checked against your personal limits';

        it('sends the personal max risk, max trades, daily profit cap and daily loss limit in the spec of the value request', () => {
            accountWith({
                dailyLossLimitCents: 60_000,
                dailyProfitCapCents: 50_000,
                maxRiskPerTradeCents: 15_000,
                maxTradesPerDay: 2,
            });
            render();

            const policy = lastInput().values?.spec.enginePolicy as
                | undefined
                | {
                      personalCaps?: Record<string, null | number>;
                      personalDll?: number;
                  };
            expect(policy?.personalCaps).toEqual({
                dailyProfitCap: 500,
                maxRiskPerTrade: 150,
                maxTradesPerDay: 2,
            });
            expect(policy?.personalDll).toBe(600);
            const rungs = lastInput().values?.rungs ?? [];
            for (const rung of rungs) {
                expect(rung.risk).toBeLessThanOrEqual(150);
            }
        });

        it('leaves the value spec without any personal limit for an account that sets none', () => {
            answerEverything();
            render();

            const policy = lastInput().values?.spec.enginePolicy;
            expect(policy).not.toHaveProperty('personalCaps');
            expect(policy).not.toHaveProperty('personalDll');
        });

        it('shows the run note with the applied personal max risk beside the value figures', () => {
            const risk = documentedRisk();
            accountWith({ maxRiskPerTradeCents: 15_000 });
            readyWith(valuesFor(risk));

            expect(
                sectionOf('What the next trade does to value').textContent,
            ).toContain('max risk per trade $150.00');
        });

        it('shows no limits note for an account that sets no personal limit', () => {
            answerEverything();
            adviceBox.state = {
                advice: readyAdviceWithProjection(null),
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            expect(container.textContent).not.toContain(NOT_CHECKED_TEXT);
            expect(container.textContent).not.toContain('do not apply your');
        });

        it('shows no not-applied note for a daily loss limit in the rendered panel, because the engine rows simulate it', () => {
            accountWith({ dailyLossLimitCents: 60_000 });
            adviceBox.state = {
                advice: readyAdviceWithProjection(dollars(600)),
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            expect(container.textContent).not.toContain(NOT_CHECKED_TEXT);
            expect(container.textContent).not.toContain('do not apply your');
        });
    });

    describe('PT-19h: the Suspended gate, the override warning and the run note', () => {
        const PAYOUT_WARNING = {
            horizonDays: 252,
            optimumBustProbability: 0.12,
            optimumMonthlyNet: 4321,
            optimumRequestSize: 2000,
            overrideBustProbability: 0.34,
            overrideMonthlyNet: 1234,
            overrideRequestSize: 750,
            retainedCushion: 2750,
            retainedCushionBasis: RetainedCushionBasis.RulebookSize,
        };

        it('builds the advisor of a Suspended account with the Suspended substate, so it is never sized (F-118)', () => {
            answerEverything({
                'account.get': answer(
                    account({ status: AccountStatus.Suspended }),
                ),
            });
            render();

            const advisor = advisorOfLastInput();
            expect(advisor.documented()).toBeNull();
            expect(advisor.optimumRequests()).toEqual([]);
        });

        it('asks for no value request for a Suspended account, so no value worker can start (F-118 review)', () => {
            answerEverything({
                'account.get': answer(
                    account({ status: AccountStatus.Suspended }),
                ),
            });
            render();

            expect(lastInput().values).toBeNull();
            expect(lastInput().valuesUnavailableReason).toBeNull();
        });

        it('renders an explicit Suspended notice and none of the sizing, value or risk sections for a Suspended account', () => {
            answerEverything({
                'account.get': answer(
                    account({ status: AccountStatus.Suspended }),
                ),
            });
            adviceBox.adjust = (derived) => derived;
            adviceBox.state = {
                advice: null,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            const text = container.textContent;
            expect(text).toContain('This account is suspended');
            expect(text).not.toContain('The engine refused');
            expect(text).not.toContain('Not modeled for this account');
            expect(text).not.toContain('No documented sizing applies');
            const headings = [...container.querySelectorAll('h3')].map(
                (heading) => heading.textContent,
            );
            expect(headings).toEqual([]);
        });

        it('still renders the sizing sections for an Active account', () => {
            answerEverything();
            adviceBox.adjust = (derived) => derived;
            adviceBox.state = {
                advice: null,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            expect(container.textContent).not.toContain(
                'This account is suspended',
            );
            expect(
                [...container.querySelectorAll('h3')].map(
                    (heading) => heading.textContent,
                ),
            ).toContain('What the next trade does to value');
        });

        it('still sizes an Active account', () => {
            answerEverything();
            render();

            const advisor = advisorOfLastInput();
            expect(advisor.documented()).not.toBeNull();
            expect(advisor.optimumRequests().length).toBeGreaterThan(0);
        });

        it('shows the non-monotonic payout-size warning of the payout advice with its typed figures (F-128)', () => {
            const base = realFundedAdvice();
            if (base.payoutAdvice === null) {
                throw new Error('expected payout advice');
            }
            answerEverything();
            adviceBox.state = {
                advice: {
                    ...base,
                    payoutAdvice: {
                        ...base.payoutAdvice,
                        personalOverrideWarning: PAYOUT_WARNING,
                    },
                },
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            const text = sectionOf('Payout advice').textContent;
            expect(text).toContain('$1,234');
            expect(text).toContain('$4,321');
            expect(text).toContain('34');
            expect(text).toContain('12');
            expect(text).toContain('payout request underperforms');
            expect(text).toContain('payout-size sweep');
        });

        it('names the request sizes, the horizon and the retained cushion with its basis in the override warning (F-128)', () => {
            const base = realFundedAdvice();
            if (base.payoutAdvice === null) {
                throw new Error('expected payout advice');
            }
            answerEverything();
            adviceBox.state = {
                advice: {
                    ...base,
                    payoutAdvice: {
                        ...base.payoutAdvice,
                        personalOverrideWarning: PAYOUT_WARNING,
                    },
                },
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            const text = sectionOf('Payout advice').textContent;
            expect(text).toContain('$1,234 at a $750 request');
            expect(text).toContain('$4,321 at $2,000');
            expect(text).toContain('252 funded days');
            expect(text).toContain(
                "retaining $2,750 (your rulebook's retained cushion)",
            );
        });

        it('shows no payout override warning when the payout advice carries none', () => {
            const base = realFundedAdvice();
            answerEverything();
            adviceBox.state = {
                advice: base,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            expect(sectionOf('Payout advice').textContent).not.toContain(
                'underperforms',
            );
        });

        it('shows the value run note beside the one-step risk candidates too (F-V16)', () => {
            const risk = documentedRisk();
            accountWith({ maxRiskPerTradeCents: 15_000 });
            readyWith(valuesFor(risk));

            expect(sectionOf('One-step risk candidates').textContent).toContain(
                'max risk per trade $150.00',
            );
        });
    });

    describe('PT-108: the payout card states the withdrawable and the caps (F-128)', () => {
        function payoutAdviceWith(overrides: Record<string, unknown>) {
            const base = realFundedAdvice();
            if (base.payoutAdvice === null) {
                throw new Error('expected payout advice');
            }
            answerEverything();
            adviceBox.state = {
                advice: {
                    ...base,
                    payoutAdvice: { ...base.payoutAdvice, ...overrides },
                },
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();
            return sectionOf('Payout advice').textContent;
        }

        it('names the rule-capped withdrawable and the cap that limits it beside the engine horizon credit and the net after the split', () => {
            const text = payoutAdviceWith({
                caps: [
                    {
                        amount: dollars(2000),
                        kind: advisorLib.PayoutCapKind.RequestCap,
                        limitsWithdrawable: true,
                    },
                    {
                        amount: dollars(4000),
                        kind: advisorLib.PayoutCapKind.BalanceShare,
                        limitsWithdrawable: false,
                        share: 0.5,
                    },
                    {
                        kind: advisorLib.PayoutCapKind.RemainingPayouts,
                        remaining: 2,
                    },
                ],
                engineHorizonCredit: dollars(1500),
                netAfterSplit: dollars(1800),
                ruleCappedWithdrawable: dollars(2000),
            });

            expect(text).toContain(
                'Rule-capped withdrawable $2,000.00, limited by the per-request cap of $2,000.00',
            );
            expect(text).toContain(
                'Per-request cap $2,000.00 (limits the withdrawable)',
            );
            expect(text).toContain(
                'Balance-share cap 50% of profit, $4,000.00',
            );
            expect(text).toContain('2 payouts remaining');
            expect(text).toContain('Engine horizon credit $1,500.00');
            expect(text).toContain('Net after the payout split $1,800.00');
        });

        it('names the post-payout floor and the retained cushion when no cap limits the withdrawable', () => {
            const text = payoutAdviceWith({
                caps: [],
                ruleCappedWithdrawable: dollars(900),
            });

            expect(text).toContain(
                'Rule-capped withdrawable $900.00, limited by the post-payout floor and your retained cushion',
            );
        });

        it('says one payout remaining in the singular', () => {
            const text = payoutAdviceWith({
                caps: [
                    {
                        kind: advisorLib.PayoutCapKind.RemainingPayouts,
                        remaining: 1,
                    },
                ],
                ruleCappedWithdrawable: dollars(900),
            });

            expect(text).toContain('1 payout remaining');
            expect(text).not.toContain('1 payouts remaining');
        });

        it('shows no withdrawable line when the advice carries none', () => {
            const text = payoutAdviceWith({
                caps: [],
                ruleCappedWithdrawable: null,
            });

            expect(text).not.toContain('Rule-capped withdrawable');
        });
    });

    describe('PT-108: the card gets the day-start cushion and the daily loss room (PT-92 addendum, F-V31)', () => {
        it("sizes the contracts against the card's own cushion and daily loss room", () => {
            answerEverything();
            adviceBox.adjust = (derived) => {
                const advice = derived as {
                    dailyPlanCard: Record<string, unknown>;
                };
                return {
                    ...advice,
                    dailyPlanCard: {
                        ...advice.dailyPlanCard,
                        cushion: dollars(1234),
                        dailyLossRoom: dollars(321),
                    },
                };
            };
            adviceBox.state = {
                advice: null,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            const input = vi.mocked(contractsSizingOf).mock.calls.at(-1)?.[0];
            expect(input?.cushionLeft).toBe(1234);
            expect(input?.dailyLossRoom).toBe(321);
        });

        it('passes no daily loss room when the card carries none', () => {
            answerEverything();
            adviceBox.adjust = (derived) => {
                const advice = derived as {
                    dailyPlanCard: Record<string, unknown>;
                };
                return {
                    ...advice,
                    dailyPlanCard: {
                        ...advice.dailyPlanCard,
                        dailyLossRoom: null,
                    },
                };
            };
            adviceBox.state = {
                advice: null,
                failedOptima: [],
                phase: AccountAdvicePhase.Ready,
            };
            render();

            const input = vi.mocked(contractsSizingOf).mock.calls.at(-1)?.[0];
            expect(input?.dailyLossRoom).toBeNull();
            expect(typeof input?.cushionLeft).toBe('number');
        });
    });
});
