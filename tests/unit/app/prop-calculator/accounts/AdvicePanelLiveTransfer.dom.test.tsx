import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseAccountAdviceModule from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';

import { AdvisorRequestOutcomeKind } from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import { PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT } from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
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
import * as advisorLib from '~/lib/prop-calculator/advisor';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import * as advisorValue from '~/lib/prop-calculator/advisor/value';
import {
    LiveTransferContinuationKind,
    liveTransferSentLiveText,
} from '~/lib/prop-calculator/simulator';

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
            dpAdvice: {
                listForAccount: harness.query('dpAdvice.listForAccount'),
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

const { AccountAdvicePhase } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice');
const { AdvicePanel } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel');

function account() {
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
    harness.queries.set('violation.list', answer([]));
    for (const [name, query] of Object.entries(overrides)) {
        harness.queries.set(name, query);
    }
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

const LIVE_TRANSFER = {
    bias: advisorLib.AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    hazard: 0.3,
    kind: advisorLib.AssumptionKind.LiveTransferHazard,
    notes: ['A plan note.'],
    sentLiveShare: 0.37,
} satisfies advisorLib.LiveTransferHazardAssumption;

const PRICED_TRIGGER = {
    amount: 100_000,
    bias: advisorLib.AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    kind: advisorLib.AssumptionKind.CumulativePayoutTriggerPriced,
    notes: [],
    source: {
        fetchedOn: '2026-09-01',
        quote: 'a synthetic test quote',
        url: 'https://example.test/policy',
    },
} satisfies advisorLib.CumulativePayoutTriggerAssumption;

const HAZARD_RULEBOOK = {
    ...DEFAULT_RULEBOOK,
    liveTransfer: {
        ...DEFAULT_RULEBOOK.liveTransfer,
        hazardPerPaidPayoutByFirm: { [FirmId.Apex]: 0.3 },
    },
};

const HAZARD_LINE =
    'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).';

function valuesWithLiveTransfer(risk: number, candidatesShare = 0.37) {
    const base = valuesFor(risk);
    const now = advisorValue.valueResult(
        {
            creditFree: { standardError: 10, value: 1000 },
            creditInclusive: { standardError: 10, value: 1090 },
        },
        42,
        1000,
        LIVE_TRANSFER,
    );
    return {
        ...base,
        candidates: succeeded({
            ...base.candidates.value,
            liveTransfer: { ...LIVE_TRANSFER, sentLiveShare: candidatesShare },
        }),
        now: succeeded(now),
    };
}

const CONTINUE_SHARE = 0.37;
const REQUEST_NOW_SHARE = 0.55;

function stakeWith(hasHazard: boolean) {
    const withHazard = (sentLiveShare: number) =>
        hasHazard ? { ...LIVE_TRANSFER, sentLiveShare } : undefined;
    return {
        continueNow: advisorValue.valueResult(
            {
                creditFree: { standardError: 10, value: 1000 },
                creditInclusive: { standardError: 10, value: 1090 },
            },
            42,
            1000,
            withHazard(CONTINUE_SHARE),
        ),
        kind: advisorValue.ValueResultKind.PayoutStake as const,
        reducedRiskWhatIf: null,
        requestedAmount: 500,
        requestNow: advisorValue.valueResult(
            {
                creditFree: { standardError: 9, value: 1300 },
                creditInclusive: { standardError: 9, value: 1390 },
            },
            42,
            1000,
            withHazard(REQUEST_NOW_SHARE),
        ),
        traderReceivesNow: 450,
    };
}

const PAYOUT_ADVICE = (derived: unknown) => ({
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
});

const BANNER_LIST =
    'ul[aria-label="Live-transfer and payout-trigger assumptions behind the payout request"]';

describe('AdvicePanel live-transfer disclosure (PT-73f)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<AdvicePanel id={ACCOUNT_ID} />);
        });
    }

    function documentedRisk(): number {
        adviceBox.state = { phase: AccountAdvicePhase.Loading };
        render();
        const risk = lastInput().values?.rungs[0]?.risk;
        if (risk === undefined) throw new Error('no value request rung');
        return risk;
    }

    function readyWith(
        values: unknown,
        adjust: (derived: unknown) => unknown = (derived) => derived,
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

    it('puts the share of runs sent live in the value run note beside the next-trade values', () => {
        answerEverything({ 'rulebook.get': answer(HAZARD_RULEBOOK) });
        const risk = documentedRisk();

        readyWith(valuesWithLiveTransfer(risk));

        const text = sectionOf('What the next trade does to value').textContent;
        expect(text).toContain(HAZARD_LINE);
        expect(text).toContain(
            liveTransferSentLiveText(LIVE_TRANSFER.sentLiveShare),
        );
    });

    it('says the hazard in the run note without a share when the now value carries none', () => {
        answerEverything({ 'rulebook.get': answer(HAZARD_RULEBOOK) });
        const risk = documentedRisk();

        readyWith(valuesFor(risk));

        const text = sectionOf('What the next trade does to value').textContent;
        expect(text).toContain(HAZARD_LINE);
        expect(text).not.toContain('of runs are sent live');
    });

    it('puts the priced cumulative trigger in the value run note beside the next-trade values', () => {
        answerEverything();
        const risk = documentedRisk();
        const base = valuesFor(risk);

        readyWith({
            ...base,
            now: succeeded({
                ...base.now.value,
                cumulativePayoutTrigger: PRICED_TRIGGER,
            }),
        });

        expect(
            sectionOf('What the next trade does to value').textContent,
        ).toContain(advisorLib.assumptionText(PRICED_TRIGGER));
    });

    it('prints no trigger line beside the next-trade values that priced none', () => {
        answerEverything();
        const risk = documentedRisk();

        readyWith(valuesFor(risk));

        expect(
            sectionOf('What the next trade does to value').textContent,
        ).not.toContain('confirmed trigger');
    });

    it('prints the live-transfer hazard under the risk candidates that priced it', () => {
        answerEverything();
        const risk = documentedRisk();

        readyWith(valuesWithLiveTransfer(risk));

        const list = sectionOf('One-step risk candidates').querySelector(
            'ul[aria-label="Live-transfer and payout-trigger assumptions behind the risk candidates"]',
        );
        expect(list).not.toBeNull();
        expect(list?.textContent).toContain(HAZARD_LINE);
        expect(list?.textContent).toContain('A plan note.');
    });

    it('prints no live-transfer line under the risk candidates of an account with no hazard', () => {
        answerEverything();
        const risk = documentedRisk();

        readyWith(valuesFor(risk));

        const section = sectionOf('One-step risk candidates');
        expect(section.textContent).not.toContain('Live transfer');
        expect(
            section.querySelector(
                'ul[aria-label="Live-transfer and payout-trigger assumptions behind the risk candidates"]',
            ),
        ).toBeNull();
    });
    it('keeps the next-trade share and the candidates share apart, each with its own run', () => {
        answerEverything({ 'rulebook.get': answer(HAZARD_RULEBOOK) });
        const risk = documentedRisk();

        readyWith(valuesWithLiveTransfer(risk, 0.5));

        const nextTrade = sectionOf(
            'What the next trade does to value',
        ).textContent;
        const candidates = sectionOf('One-step risk candidates').textContent;
        expect(nextTrade).toContain(liveTransferSentLiveText(0.37));
        expect(nextTrade).not.toContain(liveTransferSentLiveText(0.5));
        expect(candidates).toContain(liveTransferSentLiveText(0.5));
        expect(candidates).not.toContain(liveTransferSentLiveText(0.37));
    });

    it('prints the hazard once in the risk candidates section, not once in the run note and once in the list', () => {
        answerEverything({ 'rulebook.get': answer(HAZARD_RULEBOOK) });
        const risk = documentedRisk();

        readyWith(valuesWithLiveTransfer(risk, 0.5));

        const text = sectionOf('One-step risk candidates').textContent;
        expect(text.split(HAZARD_LINE)).toHaveLength(2);
        expect(text).toContain('Value runs:');
    });

    it('keeps the run note hazard in the risk candidates section when the candidates priced none', () => {
        answerEverything({ 'rulebook.get': answer(HAZARD_RULEBOOK) });
        const risk = documentedRisk();

        readyWith(valuesFor(risk));

        const text = sectionOf('One-step risk candidates').textContent;
        expect(text.split(HAZARD_LINE)).toHaveLength(2);
    });

    it('prints the hazard and both shares under the request-payout banner', () => {
        answerEverything();
        const risk = documentedRisk();

        const stake = succeeded(stakeWith(true));
        readyWith(valuesFor(risk, { payoutStake: stake }), PAYOUT_ADVICE);

        const list = container.querySelector(BANNER_LIST);
        expect(list).not.toBeNull();
        const text = list?.textContent ?? '';
        expect(text).toContain(HAZARD_LINE);
        expect(text).toContain(
            `Continuing: ${liveTransferSentLiveText(CONTINUE_SHARE)}`,
        );
        expect(text).toContain(
            `Request now: ${liveTransferSentLiveText(REQUEST_NOW_SHARE)}`,
        );
        expect(text).toContain(PAYOUT_STAKE_REQUEST_NOW_TRANSFER_TEXT);
    });

    it('prints no live-transfer line under the request-payout banner of an account with no hazard', () => {
        answerEverything();
        const risk = documentedRisk();

        const stake = succeeded(stakeWith(false));
        readyWith(valuesFor(risk, { payoutStake: stake }), PAYOUT_ADVICE);

        expect(container.textContent).toContain('EV at stake');
        expect(container.querySelector(BANNER_LIST)).toBeNull();
    });
});
