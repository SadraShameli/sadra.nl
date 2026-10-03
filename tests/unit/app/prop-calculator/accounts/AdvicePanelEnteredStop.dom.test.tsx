import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseAccountAdviceModule from '~/app/(app)/prop-calculator/accounts/_components/advice/useAccountAdvice';

import { advisorWorkerCacheKey } from '~/app/(app)/prop-calculator/_workers/advisorWorkerMessages';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    usdCents,
} from '~/lib/prop-accounts';
import {
    findFirm,
    FirmId,
    type FirmId as FirmIdType,
    type PlanOptIns,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    BELOW_ONE_CONTRACT_TEXT,
    DEFAULT_RULEBOOK,
    type SizingAdvisor,
} from '~/lib/prop-calculator/advisor';
import { RungPlacement } from '~/lib/prop-calculator/advisor';

const USER_ID = 'user-a';
const ACCOUNT_ID = 'account-a';
const TODAY = '2026-09-28';
const SETTLE_MS = 5000;

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

interface AdviceInput {
    readonly advisor: SizingAdvisor;
    readonly firmId: FirmIdType;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
}

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
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

const adviceBox = vi.hoisted(() => ({
    inputs: [] as unknown[],
    loading: false,
}));

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
                if (adviceBox.loading) return { phase: 'loading' };
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

function account(overrides: Record<string, unknown> = {}) {
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
        id: ACCOUNT_ID,
        label: ACCOUNT_ID,
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

function advisorsBuilt(): ReadonlySet<SizingAdvisor> {
    return new Set(
        (adviceBox.inputs as readonly AdviceInput[]).map(
            (input) => input.advisor,
        ),
    );
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything(overrides: Record<string, unknown> = {}) {
    harness.queries.set('account.get', answer(account(overrides)));
    harness.queries.set('account.list', answer([account(overrides)]));
    harness.queries.set('snapshot.listForAccount', answer([snapshot()]));
    harness.queries.set(
        'event.list',
        answer([
            {
                accountId: ACCOUNT_ID,
                createdAt: new Date('2025-11-01T12:00:00Z'),
                id: 'event-1',
                kind: AccountEventKind.Purchased,
                occurredOn: '2025-11-01',
                userId: USER_ID,
            },
        ]),
    );
    harness.queries.set('event.listForAccount', answer([]));
    harness.queries.set('payout.list', answer([]));
    harness.queries.set('payout.list.ledger', answer([]));
    harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
    harness.queries.set('decision.listForAccount', answer([]));
    harness.queries.set('violation.list', answer([]));
}

function cacheKeyOf(input: AdviceInput): string {
    return advisorWorkerCacheKey({
        firmId: input.firmId,
        optIns: input.optIns,
        planSerial: input.planSerial,
        requests: input.advisor.optimumRequests(),
    });
}

function lastInput(): AdviceInput {
    const input = adviceBox.inputs.at(-1) as AdviceInput | undefined;
    if (input === undefined) throw new Error('the panel built no advisor');
    return input;
}

function placementsOf(input: AdviceInput): readonly RungPlacement[] {
    return input.advisor.dailyPlanCard()?.rungPlacements ?? [];
}

function settle() {
    act(() => {
        vi.advanceTimersByTime(SETTLE_MS);
    });
}

function snapshot(balanceCents = 5_600_000) {
    return {
        accountId: ACCOUNT_ID,
        asOf: TODAY,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(balanceCents),
        createdAt: new Date(`${TODAY}T12:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(balanceCents),
        highestIntradayBalanceCents: usdCents(balanceCents),
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

describe('the advice panel passes the entered instrument and stop to the advisor (PT-36k, F-154)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<AdvicePanel id={ACCOUNT_ID} />);
        });
    }

    function setField(selector: string, text: string) {
        const input = container.querySelector<HTMLInputElement>(selector);
        if (input === null) throw new Error(`no field ${selector}`);
        act(() => {
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set?.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        adviceBox.inputs = [];
        adviceBox.loading = false;
        answerEverything();
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
        vi.useRealTimers();
    });

    it('checks no rung for placement while no stop is entered', () => {
        render();

        const placements = placementsOf(lastInput());
        expect(placements.length).toBeGreaterThan(0);
        expect(new Set(placements)).toEqual(
            new Set([RungPlacement.NotChecked]),
        );
        expect(container.textContent).not.toContain('cannot be placed');
    });

    it('builds the advisor with the entered stop, so the card carries the advisor flag and the one-contract risk', () => {
        render();

        setField('#daily-card-stop', '20');
        settle();

        const placements = placementsOf(lastInput());
        expect(new Set(placements)).toEqual(
            new Set([RungPlacement.BelowOneContract]),
        );
        const text = container.textContent;
        expect(text).toContain('cannot be placed');
        expect(text).toContain('where one contract risks $400.00');
    });

    it('flags nothing when one contract at the entered stop fits inside the rung', () => {
        render();

        setField('#daily-card-stop', '5');
        settle();

        const placements = placementsOf(lastInput());
        expect(new Set(placements)).toEqual(new Set([RungPlacement.Placeable]));
        expect(container.textContent).not.toContain('cannot be placed');
    });

    it('carries the advisor flag into the risk check', () => {
        render();

        setField('#daily-card-stop', '20');
        setField('#risk-check-risk', '250');
        settle();

        expect(container.textContent).toContain(
            `The documented rung ${BELOW_ONE_CONTRACT_TEXT}.`,
        );
    });

    it('rebuilds the advisor only after the stop settles, once for the final stop', () => {
        render();
        const buildsBefore = advisorsBuilt().size;

        setField('#daily-card-stop', '2');
        act(() => {
            vi.advanceTimersByTime(100);
        });
        setField('#daily-card-stop', '20');
        act(() => {
            vi.advanceTimersByTime(100);
        });

        expect(advisorsBuilt().size).toBe(buildsBefore);

        settle();

        const placementsSeen = adviceBox.inputs.flatMap((input) =>
            placementsOf(input as AdviceInput),
        );
        expect(placementsSeen).not.toContain(RungPlacement.Placeable);
        expect(placementsOf(lastInput())).toContain(
            RungPlacement.BelowOneContract,
        );
    });

    it('keys the engine requests by the entered stop, so each stop is its own cached run', () => {
        render();
        const unplaced = cacheKeyOf(lastInput());

        setField('#daily-card-stop', '20');
        settle();
        const atTwenty = cacheKeyOf(lastInput());

        setField('#daily-card-stop', '5');
        settle();
        const atFive = cacheKeyOf(lastInput());

        setField('#daily-card-stop', '20');
        settle();
        const backAtTwenty = cacheKeyOf(lastInput());

        expect(atTwenty).not.toBe(unplaced);
        expect(atFive).not.toBe(atTwenty);
        expect(backAtTwenty).toBe(atTwenty);
    });

    it('keeps the stop field, its value and its focus when the settled stop sends the engine job to loading', () => {
        render();
        setField('#daily-card-stop', '20');
        settle();
        const field =
            container.querySelector<HTMLInputElement>('#daily-card-stop');
        if (field === null) throw new Error('no stop field');
        act(() => {
            field.focus();
        });

        adviceBox.loading = true;
        setField('#daily-card-stop', '20.5');
        settle();

        const after =
            container.querySelector<HTMLInputElement>('#daily-card-stop');
        expect(after).toBe(field);
        expect(after?.value).toBe('20.5');
        expect(document.activeElement).toBe(field);
    });

    it('keeps the last advice on screen with a recomputing notice and no accepted size while the engine job runs for the new stop', () => {
        render();
        setField('#daily-card-stop', '20');
        settle();
        expect(container.textContent).toContain('Today');

        adviceBox.loading = true;
        setField('#daily-card-stop', '5');
        settle();

        const text = container.textContent;
        expect(text).toContain('Recomputing the advice');
        expect(text).toContain('Accepting a size is off until it finishes');
        expect(text).toContain("Today's plan");
        expect(text).toContain('Trade');
        expect(
            container.querySelector('[aria-label="Computing the advice"]'),
        ).toBeNull();
    });

    it('shows the skeleton, not stale advice, when no advice has been computed yet', () => {
        adviceBox.loading = true;

        render();

        expect(
            container.querySelector('[aria-label="Computing the advice"]'),
        ).not.toBeNull();
        expect(container.textContent).not.toContain('Recomputing');
    });

    it('drops the recomputing notice once the new advice arrives', () => {
        render();
        setField('#daily-card-stop', '20');
        settle();
        adviceBox.loading = true;
        setField('#daily-card-stop', '5');
        settle();
        expect(container.textContent).toContain('Recomputing the advice');

        adviceBox.loading = false;
        setField('#daily-card-stop', '6');
        settle();

        expect(container.textContent).not.toContain('Recomputing');
        const placements = new Set(placementsOf(lastInput()));
        expect(placements).toEqual(new Set([RungPlacement.Placeable]));
    });

    it('shows the inline contracts status only once the typed stop is the settled stop', () => {
        render();

        setField('#daily-card-stop', '20');
        expect(container.textContent).not.toContain(
            'No whole NQ contract fits',
        );

        settle();
        expect(container.textContent).toContain('No whole NQ contract fits');
    });
});

describe('an evaluation account is told its placement is not checked (PT-36k review)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        adviceBox.inputs = [];
        adviceBox.loading = false;
        answerEverything({
            firstFundedTradeOn: null,
            fundedOn: null,
            stage: AccountStage.Eval,
        });
        harness.queries.set(
            'snapshot.listForAccount',
            answer([snapshot(5_020_000)]),
        );
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
        vi.useRealTimers();
    });

    it('says so once a stop is entered, because the eval advisor never flags a rung', () => {
        act(() => {
            root.render(<AdvicePanel id={ACCOUNT_ID} />);
        });
        const field =
            container.querySelector<HTMLInputElement>('#daily-card-stop');
        if (field === null) throw new Error('no stop field');
        act(() => {
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set?.call(field, '20');
            field.dispatchEvent(new Event('input', { bubbles: true }));
        });
        settle();

        const placements = new Set(placementsOf(lastInput()));
        expect(placements).toEqual(new Set([RungPlacement.NotChecked]));
        expect(container.textContent).toContain(
            'Placement at the entered stop is not checked for evaluation accounts',
        );
    });
});
