import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseAccountAdviceModule from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';

import {
    AdviceValueRequestKind,
    adviceValueRequestOf,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts';
import {
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    PayoutCountTotalTrigger,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountSubstate,
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    PayoutBlockReasonKind,
    PayoutRequestDecisionKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

const USER_ID = 'user-a';
const ACCOUNT_ID = 'account-a';
const OTHER_ID = 'account-b';
const TODAY = '2026-09-28';

function topStepPlan() {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (plan === undefined) throw new Error('no TopStep 50K plan');
    return plan;
}

const PLAN = topStepPlan();

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
    refetch?: () => unknown;
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
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        scopedQuery: (name: string) => ({
            useQuery: (input?: { accountId?: string }) =>
                queries.get(
                    input?.accountId === undefined ? `${name}.ledger` : name,
                ) ?? pending,
        }),
    };
});

const adviceBox = vi.hoisted(() => ({ inputs: [] as unknown[] }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/app/(app)/prop-calculator/_components/useTodayIsoDate', () => ({
    useTodayIsoDate: () => '2026-09-28',
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
            dpAdvice: {
                listForAccount: harness.query('dpAdvice.listForAccount'),
            },
            event: {
                list: harness.query('event.list'),
                listForAccount: harness.query('event.listForAccount'),
            },
            payout: { list: harness.scopedQuery('payout.list') },
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
            }) => {
                adviceBox.inputs.push(input);
                return {
                    advice: input.advisor.assemble([]),
                    failedOptima: [],
                    phase: 'ready',
                    values: { phase: 'idle' },
                };
            },
        };
    },
);

const { AdvicePanel } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel');

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function account(id: string, overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 50_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2025-11-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FirmId.TopStep,
        firstFundedTradeOn: '2025-12-01',
        fundedOn: '2025-12-01',
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2025-11-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2025-11-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(
    ledgerPayouts: FakeQuery,
    overrides: Record<string, FakeQuery> = {},
) {
    harness.queries.set('account.get', answer(account(ACCOUNT_ID)));
    harness.queries.set(
        'account.list',
        answer([account(ACCOUNT_ID), account(OTHER_ID)]),
    );
    harness.queries.set(
        'snapshot.listForAccount',
        answer([eligibleSnapshot()]),
    );
    harness.queries.set(
        'event.list',
        answer(
            [ACCOUNT_ID, OTHER_ID].map((accountId) => ({
                accountId,
                createdAt: new Date('2025-11-01T12:00:00Z'),
                id: `event-${accountId}`,
                kind: AccountEventKind.Purchased,
                occurredOn: '2025-11-01',
                userId: USER_ID,
            })),
        ),
    );
    harness.queries.set('event.listForAccount', answer([]));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('payout.list.ledger', ledgerPayouts);
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('decision.listForAccount', answer([]));
    harness.queries.set('violation.list', answer([]));
    for (const [name, query] of Object.entries(overrides)) {
        harness.queries.set(name, query);
    }
}

function eligibleSnapshot() {
    return {
        accountId: ACCOUNT_ID,
        asOf: TODAY,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(5_600_000),
        createdAt: new Date(`${TODAY}T12:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(5_600_000),
        highestIntradayBalanceCents: usdCents(5_600_000),
        id: 'snap-1',
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: 30,
        tradingDays: 40,
        updatedAt: new Date(`${TODAY}T12:00:00Z`),
        userId: USER_ID,
    };
}

function paid(index: number) {
    const day = String(index + 1).padStart(2, '0');
    return {
        accountId: OTHER_ID,
        approvedOn: null,
        grossCents: usdCents(50_000),
        id: `payout-${String(index)}`,
        netCents: usdCents(45_000),
        paidOn: `2026-08-${day}`,
        requestedOn: `2026-08-${day}`,
        status: PayoutStatus.Paid,
        userId: USER_ID,
    };
}

function payoutAdviceOfLastInput() {
    const input = adviceBox.inputs.at(-1) as
        | undefined
        | {
              advisor: {
                  assemble: (results: []) => {
                      payoutAdvice: null | {
                          assumptions: readonly unknown[];
                          documented: {
                              kind: string;
                              reason?: { kind: string };
                          };
                      };
                  };
              };
          };
    if (input === undefined) throw new Error('the panel built no advisor');
    return input.advisor.assemble([]).payoutAdvice;
}

function withPolicy<T>(run: () => T): T {
    const firm = findFirm(FirmId.TopStep) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy([
        new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
    ]);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('the advice panel passes the firm payout count to the advisor (PT-36g, F-145)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<AdvicePanel id={ACCOUNT_ID} />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
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
        vi.unstubAllGlobals();
    });

    it('blocks the payout as one that goes live once the firm ledger count is one under a verified trigger', () => {
        answerEverything(
            answer(Array.from({ length: 9 }, (_unused, index) => paid(index))),
        );
        withPolicy(render);
        const advice = payoutAdviceOfLastInput();
        expect(advice?.documented).toMatchObject({
            kind: PayoutRequestDecisionKind.NotEligible,
            reason: { kind: PayoutBlockReasonKind.WouldTriggerLive },
        });
        expect(advice?.assumptions).toEqual([]);
    });

    it('still requests under the verified trigger while the firm count is lower', () => {
        answerEverything(
            answer(Array.from({ length: 3 }, (_unused, index) => paid(index))),
        );
        withPolicy(render);
        expect(payoutAdviceOfLastInput()?.documented.kind).toBe(
            PayoutRequestDecisionKind.Request,
        );
    });

    it('waits for the firm payout ledger before it builds the advisor', () => {
        answerEverything({
            data: undefined,
            error: null,
            isError: false,
            isPending: true,
        });
        withPolicy(render);
        expect(adviceBox.inputs).toEqual([]);
        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it('says the firm count could not be loaded, and the advisor discloses the unchecked live trigger, when the firm payout ledger failed', () => {
        answerEverything({
            data: undefined,
            error: new Error('ledger exploded'),
            isError: true,
            isPending: false,
        });
        withPolicy(render);
        expect(container.textContent).toContain(
            'The firm payout count could not be loaded',
        );
        expect(container.textContent).toContain('ledger exploded');
        const advice = payoutAdviceOfLastInput();
        expect(advice?.documented.kind).toBe(PayoutRequestDecisionKind.Request);
        expect(advice?.assumptions.length).toBeGreaterThan(0);
    });
});

describe('the advice panel flags a firm payout ledger that failed to refresh (PT-36g)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
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
        vi.unstubAllGlobals();
    });

    it('says the firm payouts could not be refreshed when the ledger keeps stale data after a failed refetch', () => {
        answerEverything({
            data: [paid(0)],
            error: new Error('refetch exploded'),
            isError: true,
            isPending: false,
        });
        act(() => {
            root.render(<AdvicePanel id={ACCOUNT_ID} />);
        });
        expect(container.textContent).toContain(
            'The firm payouts could not be refreshed',
        );
    });

    it('does not say so while the firm payout ledger is healthy', () => {
        answerEverything(answer([paid(0)]));
        act(() => {
            root.render(<AdvicePanel id={ACCOUNT_ID} />);
        });
        expect(container.textContent).not.toContain('could not be refreshed');
    });
});

describe('a suspended account never reaches the value request builder through a panel short-circuit (PT-36g, PT-19i addendum)', () => {
    it('returns NotRequested from the request builder itself for the advice of a suspended advisor', () => {
        const rebuilt = AccountReconstruction.rebuild(
            {
                asOf: TODAY,
                balance: dollars(56_000),
                dashboardConvention: DashboardBalanceConvention.Nominal,
                firstFundedTradeOn: '2025-12-01',
                fundedOn: '2025-12-01',
                highestEodBalance: dollars(56_000),
                highestIntradayBalance: dollars(56_000),
                payoutsTaken: 0,
                qualifyingDaysSinceLastPayout: 30,
                stage: SizingStage.Funded,
                tradingDays: 40,
            },
            PLAN,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        const advisor = createSizingAdvisor(rebuilt, {
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: TODAY,
            substate: AccountSubstate.Suspended,
            today: TODAY,
        });
        const request = adviceValueRequestOf({
            account: rebuilt,
            advice: advisor.assemble([]),
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            plan: PLAN,
            rulebook: DEFAULT_RULEBOOK,
        });
        expect(request.kind).toBe(AdviceValueRequestKind.NotRequested);
    });

    it('does not test isSuspended before building the value request in AdvicePanel', () => {
        const source = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../../../../../src/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel.tsx',
            ),
            'utf8',
        );
        const beforeRequest = source.slice(
            0,
            source.indexOf('adviceValueRequestOf({'),
        );
        expect(beforeRequest.slice(-200)).not.toContain('isSuspended()');
    });
});
