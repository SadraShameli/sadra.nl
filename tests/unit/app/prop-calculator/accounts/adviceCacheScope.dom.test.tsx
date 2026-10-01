import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
} from '~/lib/prop-accounts';
import { ApexVariant, findFirm, FirmId, serializePlanId } from '~/lib/prop-calculator';
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
        state: { data: { user: { id: 'user-a' } }, error: null, isPending: false },
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
        postMessage(message: { runId: number }) {
            this.runId = message.runId;
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
        },
        useUtils: () => ({
            propAccounts: {
                decision: { invalidate: vi.fn() },
                invalidate: vi.fn(),
            },
        }),
    },
}));

const { AdviceCacheProvider } = await import(
    '~/app/(app)/prop-calculator/accounts/_components/advice/AdviceCacheProvider'
);
const { AdvicePanel } = await import(
    '~/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel'
);

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

function snapshot(accountId: string, userId: string) {
    return {
        accountId,
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

    function answerAll(personalRules: Record<string, unknown>) {
        const row = account(accountId, ROW_USER, personalRules);
        harness.queries.set('account.get', answer(row));
        harness.queries.set('account.list', answer([row]));
        harness.queries.set(
            'snapshot.listForAccount',
            answer([snapshot(accountId, ROW_USER)]),
        );
        harness.queries.set('event.list', answer([]));
        harness.queries.set('event.listForAccount', answer([]));
        harness.queries.set('payout.list', answer([]));
        harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
        harness.queries.set('decision.listForAccount', answer([]));
    }

    function mountPage() {
        root = createRoot(container);
        act(() => {
            root.render(
                <AdviceCacheProvider>
                    <AdvicePanel id={accountId} />
                </AdviceCacheProvider>,
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

    it('computes once and shows the advice from the cache after navigating away and back with nothing changed', () => {
        answerAll({});
        mountPage();
        expect(container.textContent).toContain('Sizing advice');
        expect(workerBox.FakeWorker.instances).toHaveLength(1);
        leavePage();

        mountPage();

        expect(workerBox.FakeWorker.instances).toHaveLength(1);
        expect(container.textContent).toContain('Sizing advice');
        leavePage();
    });

    it.each([
        ['the daily profit cap', { dailyProfitCapCents: 100_000 }, { dailyProfitCapCents: 50_000 }],
        ['the trades per day cap', { maxTradesPerDay: 3 }, { maxTradesPerDay: 1 }],
        ['the daily loss limit', { dailyLossLimitCents: 200_000 }, { dailyLossLimitCents: 100_000 }],
    ])('reuses the same worker run and shows fresh advice after %s changes', (_name, before, after) => {
        answerAll(before);
        mountPage();
        const adviceBefore = container.textContent;
        expect(workerBox.FakeWorker.instances).toHaveLength(1);
        leavePage();

        answerAll(after);
        mountPage();

        expect(workerBox.FakeWorker.instances).toHaveLength(1);
        expect(container.textContent).toContain('Sizing advice');
        expect(container.textContent).not.toBe(adviceBefore);
        leavePage();
    });

    it('recomputes after the retained cushion changes the engine requests', () => {
        answerAll({ retainedCushionCents: 300_000 });
        mountPage();
        leavePage();

        answerAll({ retainedCushionCents: 100_000 });
        mountPage();

        expect(workerBox.FakeWorker.instances).toHaveLength(2);
        leavePage();
    });

    it('shows advice built for the later day without a new worker run, so the staleness verdict is not frozen', () => {
        answerAll({});
        mountPage();
        const adviceBefore = container.textContent;
        leavePage();

        vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
        mountPage();

        expect(workerBox.FakeWorker.instances).toHaveLength(1);
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

        expect(workerBox.FakeWorker.instances).toHaveLength(1);
        expect(container.textContent).toContain('Sizing advice');
        leavePage();
    });
});
