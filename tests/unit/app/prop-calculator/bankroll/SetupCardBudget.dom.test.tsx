import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BankrollUrlState } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollUrlState';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { dollars, fraction } from '~/lib/prop-calculator';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

import { statStripValue } from '../statStripValue';

interface Harness {
    availableCents: null | number;
    baseError: null | string;
    maxAttempts: number;
    result: null | SimOutputs;
    workerState: WorkerStateStub;
}

interface WorkerStateStub {
    phase: string;
    reason?: string;
}

const harness = vi.hoisted((): Harness => ({
    availableCents: null,
    baseError: null,
    maxAttempts: 1,
    result: null,
    workerState: { phase: 'idle' },
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            bankroll: {
                summary: {
                    useQuery: () => ({
                        data:
                            harness.availableCents === null
                                ? undefined
                                : { availableCents: harness.availableCents },
                    }),
                },
            },
            rulebook: { get: { useQuery: () => ({ data: undefined }) } },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useBaseResult: () => ({
        error: harness.baseError,
        isPending: false,
        result: harness.result,
    }),
    useCalculatorInputs: () => ({
        state: {
            ...defaultCalculatorState(),
            maxAttempts: harness.maxAttempts,
        },
    }),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/bankroll/useToolsRequest',
    () => ({
        useToolsRequest: () => ({
            cancel: vi.fn(),
            run: vi.fn(),
            state: harness.workerState,
        }),
    }),
);

const { SetupCard } =
    await import('~/app/(app)/prop-calculator/_components/bankroll/SetupCard');

const TWO_POINT_NETS = [900, -100, -100, -100, -100];
const NEGATIVE_EDGE_NETS = [100, -100, -100, -100, -100];

function simOutputs(netValues: readonly number[]): SimOutputs {
    return {
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
        netValues,
    } as unknown as SimOutputs;
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

describe('SetupCard budget check (PT-81 steps 1 and 4)', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.availableCents = null;
        harness.baseError = null;
        harness.maxAttempts = 1;
        harness.workerState = { phase: 'idle' };
        harness.result = simOutputs(TWO_POINT_NETS);
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

    function alerts(): string[] {
        return [...container.querySelectorAll('[role="alert"]')].map(
            (element) => element.textContent,
        );
    }

    function statuses(): string[] {
        return [...container.querySelectorAll('[role="status"]')].map(
            (element) => element.textContent,
        );
    }

    function budgetStatus(): Element | undefined {
        return [...container.querySelectorAll('[role="status"]')].find(
            (element) => element.textContent.startsWith('you need at least'),
        );
    }

    it('tells a user below the threshold budget how much they need, in red, with the attempts', () => {
        render(
            stateOf({
                budget: dollars(500),
                lossThreshold: fraction(0.05),
            }),
        );
        const sentence = statuses().find((text) =>
            text.startsWith('you need at least'),
        );
        expect(sentence).toBe(
            'you need at least $4,300 (43 attempts) at this plan for your threshold',
        );
        expect(
            budgetStatus()?.querySelector('.text-destructive'),
        ).not.toBeNull();
    });

    it('repeats the figure the minimum budget card shows', () => {
        render(
            stateOf({
                budget: dollars(500),
                lossThreshold: fraction(0.05),
            }),
        );
        const cardValue =
            statStripValue(container, 'Minimum budget for your threshold')
                ?.textContent ?? '';
        const match = /^(\$[\d,]+) \((\d+) attempts\)$/.exec(cardValue);
        expect(match).not.toBeNull();
        expect(statuses()).toContain(
            `you need at least ${match?.[1] ?? ''} (${match?.[2] ?? ''} attempts) at this plan for your threshold`,
        );
    });

    it('shows nothing when the budget is at or above the minimum', () => {
        render(
            stateOf({
                budget: dollars(1_000_000),
                lossThreshold: fraction(0.05),
            }),
        );
        expect(alerts()).toEqual([]);
        expect(budgetStatus()).toBeUndefined();
        expect(container.textContent).not.toContain('you need at least');
    });

    it('keeps the existing texts without a threshold', () => {
        render(stateOf({ budget: dollars(500) }));
        expect(alerts()).toEqual([]);
        expect(container.textContent).toContain('Threshold not set');
    });

    it('keeps the existing no-edge text with no positive edge', () => {
        harness.result = simOutputs(NEGATIVE_EDGE_NETS);
        render(
            stateOf({
                budget: dollars(500),
                lossThreshold: fraction(0.05),
            }),
        );
        expect(alerts()).toEqual([]);
        expect(container.textContent).toContain(
            'No positive edge: no budget makes this safe.',
        );
    });

    it('notes that the figures treat each trial as one attempt when max attempts is 3', () => {
        harness.maxAttempts = 3;
        render(stateOf({}));
        expect(container.textContent).toContain(
            "The calculator's max attempts is 3, but the figures below treat each trial as one attempt. Set it to 1 for per-attempt pricing.",
        );
    });

    it('shows no such note when max attempts is 1', () => {
        render(stateOf({}));
        expect(container.textContent).not.toContain('max attempts is');
    });

    function availableBankrollButton(): HTMLButtonElement | undefined {
        return [...container.querySelectorAll('button')].find((button) =>
            button.textContent.startsWith('Use your available bankroll'),
        );
    }

    it('offers the available bankroll as the budget when it is positive', () => {
        harness.availableCents = 250_000;
        render(stateOf({}));
        expect(availableBankrollButton()?.textContent).toBe(
            'Use your available bankroll ($2,500)',
        );
    });

    it('does not offer a negative or zero available bankroll as the budget', () => {
        harness.availableCents = -132_300;
        render(stateOf({}));
        expect(availableBankrollButton()).toBeUndefined();

        harness.availableCents = 0;
        render(stateOf({}));
        expect(availableBankrollButton()).toBeUndefined();
    });

    function isSkeleton(label: string): boolean {
        return (
            statStripValue(container, label)?.querySelector(
                '[data-slot="skeleton"]',
            ) != null
        );
    }

    it('shows only the batch figure as a skeleton while the batch prices, and the figures already known, never n/a', () => {
        harness.workerState = { phase: 'running' };
        render(stateOf({ budget: dollars(500) }));
        expect(isSkeleton('P(batch net < 0)')).toBe(true);
        expect(isSkeleton('Attempts affordable')).toBe(false);
        expect(
            statStripValue(container, 'Attempts affordable')?.textContent,
        ).toBe('5');
        expect(isSkeleton('P(no payout from 5 attempts)')).toBe(false);
        expect(isSkeleton('Attempt cost')).toBe(false);
        expect(statStripValue(container, 'Attempt cost')?.textContent).toBe(
            '$100',
        );
        expect(container.textContent).not.toContain('n/a');
    });

    it('shows the budget figures as skeletons before the batch request is dispatched', () => {
        render(stateOf({ budget: dollars(500) }));
        expect(isSkeleton('P(batch net < 0)')).toBe(true);
        expect(container.textContent).not.toContain('n/a');
    });

    it('shows the budget figures, not skeletons, once the batch request has failed', () => {
        harness.workerState = { phase: 'failed', reason: 'worker failed' };
        render(stateOf({ budget: dollars(500) }));
        expect(isSkeleton('Attempts affordable')).toBe(false);
        expect(
            statStripValue(container, 'Attempts affordable')?.textContent,
        ).toBe('5');
        expect(alerts()).toEqual(['worker failed']);
    });

    it('shows the per-attempt figures as skeletons while the base simulation runs', () => {
        harness.result = null;
        render(stateOf({ budget: dollars(500) }));
        expect(isSkeleton('Attempt cost')).toBe(true);
        expect(isSkeleton('P(attempt pays)')).toBe(true);
        expect(isSkeleton('Minimum budget for your threshold')).toBe(true);
        expect(container.textContent).not.toContain('n/a');
        expect(container.textContent).not.toContain('$0');
    });

    it('shows no skeleton once the base simulation has failed', () => {
        harness.result = null;
        harness.baseError = 'the simulation failed';
        render(stateOf({ budget: dollars(500) }));
        expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
        expect(statStripValue(container, 'Attempt cost')).toBeUndefined();
    });

    it('asks for a budget instead of showing n/a budget figures without one', () => {
        render(stateOf({}));
        expect(container.textContent).toContain(
            'Enter a budget to price the batch it buys.',
        );
        expect(
            statStripValue(container, 'Attempts affordable'),
        ).toBeUndefined();
        expect(statStripValue(container, 'Attempt cost')?.textContent).toBe(
            '$100',
        );
    });
});
