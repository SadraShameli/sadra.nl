import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import { AccountsCacheProvider } from '~/app/(app)/prop-calculator/accounts/_components/AccountsCacheProvider';
import { AdvicePanel } from '~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel';
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

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const plan = findFirm(FirmId.Apex)?.findPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});
if (plan === undefined) throw new Error('no Apex EOD 50K plan');
const PLAN_SERIAL = serializePlanId(plan.id);
const ROW_USER = 'user-a';

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
    };
});

const sessionBox = vi.hoisted(() => {
    const box: {
        state: {
            data: null | { user: { id: string } };
            error: null;
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

const workerBox = vi.hoisted(() => {
    type Listener = (event: { data: unknown }) => void;
    class FakeWorker {
        static instances: FakeWorker[] = [];
        private readonly listeners: Listener[] = [];
        private finished = false;
        private runId = 0;
        runsEngineRequests = false;
        constructor() {
            FakeWorker.instances.push(this);
        }
        addEventListener(kind: string, listener: Listener) {
            if (kind === 'message') this.listeners.push(listener);
        }
        finish() {
            if (this.finished) return;
            this.finished = true;
            for (const listener of this.listeners) {
                listener({
                    data: {
                        kind: 'done',
                        result: { outcomes: [] },
                        runId: this.runId,
                    },
                });
            }
        }
        postMessage(message: {
            request: { requests: readonly unknown[] };
            runId: number;
        }) {
            this.runId = message.runId;
            this.runsEngineRequests = message.request.requests.length > 0;
        }
        terminate() {
            return;
        }
    }
    return { FakeWorker };
});

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

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
                create: harness.mutation(),
                listForAccount: harness.query('decision.listForAccount'),
                recordActual: harness.mutation(),
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

function engineWorkers() {
    return workerBox.FakeWorker.instances.filter(
        (worker) => worker.runsEngineRequests,
    );
}

const accountCounter = { value: 0 };

function account(
    id: string,
    userId: string,
    personalRules: Record<string, unknown>,
) {
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
        id,
        label: 'Alpha',
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules,
        planLabel: null,
        planRulesFingerprint: null,
        planSerial: PLAN_SERIAL,
        purchasedOn: '2026-08-03',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
        userId,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function snapshot(accountId: string, userId: string, balanceCents: number) {
    return {
        accountId,
        asOf: '2026-09-26',
        balanceAtLastPayoutCents: null,
        balanceCents,
        createdAt: new Date('2026-09-26T12:00:00Z'),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: balanceCents,
        highestIntradayBalanceCents: null,
        id: `snap-${accountId}`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 5,
        updatedAt: new Date('2026-09-26T12:00:00Z'),
        userId,
    };
}

describe('the advice cache scope (PT-34c review)', () => {
    let container: HTMLDivElement;
    let root: Root;
    let accountId: string;
    let userId: string;
    let cache: ComputationCache;

    function answerAll(
        personalRules: Record<string, unknown>,
        balanceCents = 5_100_000,
    ) {
        const row = account(accountId, ROW_USER, personalRules);
        harness.queries.set('account.get', answer(row));
        harness.queries.set('account.list', answer([row]));
        harness.queries.set(
            'snapshot.listForAccount',
            answer([snapshot(accountId, ROW_USER, balanceCents)]),
        );
        harness.queries.set('event.list', answer([]));
        harness.queries.set('event.listForAccount', answer([]));
        harness.queries.set('payout.list', answer([]));
        harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
        harness.queries.set('decision.listForAccount', answer([]));
        harness.queries.set('violation.list', answer([]));
    }

    function mountPage(sharedCache: ComputationCache | null = cache) {
        root = createRoot(container);
        act(() => {
            root.render(
                sharedCache === null ? (
                    <AccountsCacheProvider>
                        <AdvicePanel id={accountId} />
                    </AccountsCacheProvider>
                ) : (
                    <ComputationCacheContext.Provider value={sharedCache}>
                        <AdvicePanel id={accountId} />
                    </ComputationCacheContext.Provider>
                ),
            );
        });
        for (const worker of workerBox.FakeWorker.instances) {
            act(() => {
                worker.finish();
            });
        }
    }

    function leavePage() {
        act(() => {
            root.unmount();
        });
    }

    beforeEach(() => {
        cache = new ComputationCache();
        accountCounter.value += 1;
        accountId = `account-${accountCounter.value}`;
        userId = 'user-a';
        vi.useFakeTimers({
            now: new Date('2026-09-26T12:00:00Z'),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', workerBox.FakeWorker);
        workerBox.FakeWorker.instances = [];
        harness.queries.clear();
        sessionBox.state = {
            data: { user: { id: userId } },
            error: null,
            isPending: false,
        };
        container = document.createElement('div');
        document.body.append(container);
    });

    afterEach(() => {
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('computes once and shows the advice from the accounts layout cache after navigating away and back with nothing changed', () => {
        answerAll({});
        mountPage(null);
        expect(container.textContent).toContain('Sizing advice');
        expect(engineWorkers()).toHaveLength(1);
        leavePage();

        mountPage(null);

        expect(engineWorkers()).toHaveLength(1);
        expect(container.textContent).toContain('Sizing advice');
        leavePage();
    });

    it('computes once and shows the advice from the cache after navigating away and back with nothing changed', () => {
        answerAll({});
        mountPage();
        expect(container.textContent).toContain('Sizing advice');
        expect(engineWorkers()).toHaveLength(1);
        leavePage();

        mountPage();

        expect(engineWorkers()).toHaveLength(1);
        expect(container.textContent).toContain('Sizing advice');
        leavePage();
    });

    it('runs the worker again and shows fresh advice after the trades per day cap changes, because the ladder grid slots follow the cap (PT-68f)', () => {
        answerAll({ maxTradesPerDay: 3 });
        mountPage();
        expect(container.textContent).toContain('$300.00$600.00$500.00');
        expect(container.textContent).toContain('$450.00$900.00$950.00');
        expect(container.textContent).not.toContain('$50.00$100.00$1,000.00');
        expect(engineWorkers()).toHaveLength(1);
        leavePage();

        answerAll({ maxTradesPerDay: 1 });
        mountPage();

        expect(engineWorkers()).toHaveLength(2);
        expect(container.textContent).toContain('$200.00$400.00$200.00');
        expect(container.textContent).not.toContain('$300.00$600.00$500.00');
        leavePage();
    });

    it('runs a new worker run, because the ladder search runs under the limit, and shows the new first rung and personal cap after the personal daily loss limit changes', () => {
        answerAll({});
        mountPage();
        expect(container.textContent).toContain('first rung $200.00');
        expect(container.textContent).not.toContain(
            'Capped by a personal risk limit.',
        );
        leavePage();

        answerAll({ dailyLossLimitCents: 30_000 });
        mountPage();

        expect(engineWorkers()).toHaveLength(2);
        expect(container.textContent).toContain('first rung $50.00');
        expect(container.textContent).toContain(
            '1$50.00$100.00$50.00Capped by a personal risk limit.',
        );
        expect(container.textContent).toContain(
            '4$150.00$300.00$300.00Capped by a personal risk limit.',
        );
        leavePage();
    });

    it('runs a new worker run, because the ladder search runs under the cap, and shows the capped daily plan after the personal daily profit cap changes', () => {
        answerAll({});
        mountPage();
        expect(container.textContent).toContain('1$200.00$400.00$200.00');
        leavePage();

        answerAll({ dailyProfitCapCents: 20_000 });
        mountPage();

        expect(engineWorkers()).toHaveLength(2);
        expect(container.textContent).toContain(
            '1$100.00$200.00$100.00Capped by the daily loss limit., Capped by a personal risk limit.',
        );
        expect(container.textContent).toContain('3$200.00$400.00$450.00');
        leavePage();
    });

    it('recomputes after the balance changes the engine requests', () => {
        answerAll({}, 5_100_000);
        mountPage();
        leavePage();

        answerAll({}, 5_200_000);
        mountPage();

        expect(engineWorkers()).toHaveLength(2);
        leavePage();
    });

    it('shows advice built for the later day without a new worker run, so the staleness verdict is not frozen', () => {
        answerAll({});
        mountPage();
        const adviceBefore = container.textContent;
        leavePage();

        vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
        mountPage();

        expect(engineWorkers()).toHaveLength(1);
        expect(container.textContent).not.toBe(adviceBefore);
        leavePage();
    });

    it('reuses the engine outcome of identical engine requests for another user in the same tab, which carries no account data beyond the request', () => {
        answerAll({});
        mountPage();
        leavePage();

        userId = 'user-b';
        sessionBox.state = {
            data: { user: { id: userId } },
            error: null,
            isPending: false,
        };
        answerAll({});
        mountPage();

        expect(engineWorkers()).toHaveLength(1);
        expect(container.textContent).toContain('Sizing advice');
        leavePage();
    });
});
