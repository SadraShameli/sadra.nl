import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BankrollUrlState } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollUrlState';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { AccountEventKind, FeeKind } from '~/lib/prop-accounts/core';
import { dollars, fraction } from '~/lib/prop-calculator';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

import {
    account,
    event,
    fee,
    INSTANT_PLAN,
    OTHER_USER_ID,
    payout,
} from '../../../lib/prop-accounts/metrics/ledgerFixtures';

interface Harness {
    list: (key: ListKey) => {
        list: { useQuery: (input: unknown) => QueryResult };
    };
    queries: Record<ListKey, QueryResult>;
    spies: Record<ListKey, (input: unknown) => void>;
    userId: null | string;
}

type ListKey = 'account' | 'event' | 'fee' | 'payout';

interface QueryResult {
    data: undefined | unknown[];
    error: Error | null;
    isError: boolean;
}

const EMPTY_QUERY = vi.hoisted((): QueryResult => ({
    data: [],
    error: null,
    isError: false,
}));

const harness = vi.hoisted((): Harness => {
    const state: Harness = {
        list: (key) => ({
            list: {
                useQuery: (input) => {
                    state.spies[key](input);
                    return state.queries[key];
                },
            },
        }),
        queries: {
            account: EMPTY_QUERY,
            event: EMPTY_QUERY,
            fee: EMPTY_QUERY,
            payout: EMPTY_QUERY,
        },
        spies: {
            account: vi.fn(),
            event: vi.fn(),
            fee: vi.fn(),
            payout: vi.fn(),
        },
        userId: null,
    };
    return state;
});

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: harness.userId === null ? null : { user: { id: harness.userId } },
        error: null,
        isPending: false,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: harness.list('account'),
            bankroll: { summary: { useQuery: () => ({ data: undefined }) } },
            event: harness.list('event'),
            fee: harness.list('fee'),
            payout: harness.list('payout'),
            rulebook: { get: { useQuery: () => ({ data: undefined }) } },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useBaseResult: () => ({
        error: null,
        isPending: false,
        result: {
            attemptPassProbability: 0.6,
            attemptPaysProbability: 0.2,
            costPerAttempt: 100,
            estimates: {
                attemptPassProbability: { standardError: 0.01 },
                attemptPaysProbability: { standardError: 0.01 },
                expectedMonthlyNet: { standardError: 20 },
                expectedNetPerAttempt: { standardError: 5 },
            },
            expectedNetPerAttempt: 100,
            netValues: [900, -100, -100, -100, -100],
        } as unknown as SimOutputs,
    }),
    useCalculatorInputs: () => ({ state: defaultCalculatorState() }),
}));

vi.mock('~/app/(app)/prop-calculator/_components/useTodayIsoDate', () => ({
    useTodayIsoDate: () => '2026-06-01',
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest',
    () => ({
        useToolsRequest: () => ({
            cancel: vi.fn(),
            run: vi.fn(),
            state: { phase: 'idle' },
        }),
    }),
);

const { SetupCard } =
    await import('~/app/(app)/prop-calculator/_components/bankroll/SetupCard');

function loadLedger(): void {
    const accounts = Array.from({ length: 6 }, () => account(INSTANT_PLAN));
    const stranger = account(INSTANT_PLAN, { userId: OTHER_USER_ID });
    const purchases = accounts.map((owner, index) =>
        event(owner, AccountEventKind.Purchased, `2026-01-0${index + 1}`),
    );
    const fees = accounts.map((owner, index) =>
        fee(owner, FeeKind.EvalPurchase, 10_000, `2026-01-0${index + 1}`),
    );
    const payouts = accounts.slice(0, 4).map((owner, index) =>
        payout(owner, 30_000, {
            netCents: 30_000,
            paidOn: `2026-01-1${index + 1}`,
        }),
    );
    harness.queries = {
        account: ready([...accounts, stranger]),
        event: ready([
            ...purchases,
            event(stranger, AccountEventKind.Purchased, '2026-01-01'),
        ]),
        fee: ready([
            ...fees,
            fee(stranger, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
        ]),
        payout: ready([
            ...payouts,
            payout(stranger, 90_000, {
                netCents: 90_000,
                paidOn: '2026-01-11',
            }),
        ]),
    };
}

function ready(rows: unknown[]): QueryResult {
    return { data: rows, error: null, isError: false };
}

function stateOf(overrides: Partial<BankrollUrlState>): BankrollUrlState {
    return {
        budget: null,
        capacity: null,
        horizonDays: null,
        lossThreshold: null,
        monthlyBudget: null,
        payoutLagDays: null,
        reinvestFraction: null,
        start: null,
        ...overrides,
    };
}

describe('SetupCard realized rates (PT-81 step 2)', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.userId = 'user-a';
        vi.mocked(harness.spies.account).mockClear();
        vi.mocked(harness.spies.event).mockClear();
        vi.mocked(harness.spies.fee).mockClear();
        vi.mocked(harness.spies.payout).mockClear();
        loadLedger();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    function render(state: BankrollUrlState): void {
        act(() => {
            root.render(<SetupCard onChange={vi.fn()} state={state} />);
        });
    }

    function valueOf(label: string): string {
        const span = [...container.querySelectorAll('span')].find(
            (element) => element.textContent === label,
        );
        if (span === undefined) throw new Error(`no stat card ${label}`);
        return span.nextElementSibling?.textContent ?? '';
    }

    it('shows the realized figures beside the modeled ones, with the sample count', () => {
        render(stateOf({ budget: dollars(400), lossThreshold: fraction(0.1) }));
        expect(container.textContent).toContain('6 ended attempts');
        expect(valueOf('Realized P(attempt pays)')).toBe('66.7%');
        expect(valueOf('Realized P(no payout from 4 attempts)')).toBe('1.235%');
        expect(valueOf('Realized P(batch net < 0)')).toMatch(/^1\d\.\d%$/);
        expect(valueOf('Realized minimum budget')).toMatch(
            /^\$[\d,]+ \(\d+ attempts\)$/,
        );
        expect(valueOf('P(attempt pays)')).toBe('20.0%');
    });

    it('reads only the signed-in user rows', () => {
        render(stateOf({ budget: dollars(400) }));
        expect(container.textContent).toContain('6 ended attempts');
    });

    it('reads the four lists with the overview inputs', () => {
        render(stateOf({ budget: dollars(400) }));
        expect(harness.spies.account).toHaveBeenCalledWith({
            includeArchived: true,
        });
        expect(harness.spies.event).toHaveBeenCalledWith({});
        expect(harness.spies.fee).toHaveBeenCalledWith({});
        expect(harness.spies.payout).toHaveBeenCalledWith({});
    });

    it('says the threshold is not set for the realized minimum budget without one', () => {
        render(stateOf({ budget: dollars(400) }));
        expect(valueOf('Realized minimum budget')).toBe('threshold not set');
    });

    it('says there are no ended attempts instead of a figure for an empty ledger', () => {
        harness.queries = {
            account: ready([]),
            event: ready([]),
            fee: ready([]),
            payout: ready([]),
        };
        render(stateOf({ budget: dollars(400) }));
        expect(container.textContent).toContain('no ended attempts');
        expect(container.textContent).not.toContain('Realized P(batch');
    });

    it('shows nothing realized when signed out and reads no list', () => {
        harness.userId = null;
        render(stateOf({ budget: dollars(400) }));
        expect(container.textContent).not.toContain('Realized');
        expect(container.textContent).not.toContain('ended attempts');
        expect(harness.spies.account).not.toHaveBeenCalled();
        expect(harness.spies.payout).not.toHaveBeenCalled();
    });

    it('says so when a list fails to load', () => {
        harness.queries = {
            ...harness.queries,
            payout: {
                data: undefined,
                error: new Error('boom'),
                isError: true,
            },
        };
        render(stateOf({ budget: dollars(400) }));
        const alert = container.querySelector('[role="alert"]');
        expect(alert?.textContent).toBe(
            'Your realized figures could not be loaded.',
        );
        expect(container.textContent).not.toContain('Realized P(attempt pays)');
    });

    it('shows a loading line while a list is pending', () => {
        harness.queries = {
            ...harness.queries,
            fee: { data: undefined, error: null, isError: false },
        };
        render(stateOf({ budget: dollars(400) }));
        expect(container.textContent).toContain(
            'Loading your realized figures',
        );
    });
});
