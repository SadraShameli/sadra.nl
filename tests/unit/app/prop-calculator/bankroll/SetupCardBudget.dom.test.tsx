import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BankrollUrlState } from '~/app/(app)/prop-calculator/_components/bankroll/bankrollUrlState';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { dollars, fraction } from '~/lib/prop-calculator';
import { type SimOutputs } from '~/lib/prop-calculator/simulator';

const harness = vi.hoisted(() => ({
    maxAttempts: 1,
    result: null as null | SimOutputs,
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
            bankroll: { summary: { useQuery: () => ({ data: undefined }) } },
            rulebook: { get: { useQuery: () => ({ data: undefined }) } },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useBaseResult: () => ({
        error: null,
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
            state: { phase: 'idle' },
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
        harness.maxAttempts = 1;
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

    it('tells a user below the threshold budget how much they need, in red, with the attempts', () => {
        render(
            stateOf({
                budget: dollars(500),
                lossThreshold: fraction(0.05),
            }),
        );
        const sentence = alerts().find((text) =>
            text.startsWith('you need at least'),
        );
        expect(sentence).toBe(
            'you need at least $4,300 (43 attempts) at this plan for your threshold',
        );
        const alert = container.querySelector('[role="alert"]');
        expect(alert?.className).toContain('text-rose-400');
    });

    it('repeats the figure the minimum budget card shows', () => {
        render(
            stateOf({
                budget: dollars(500),
                lossThreshold: fraction(0.05),
            }),
        );
        const card = [...container.querySelectorAll('span')].find(
            (element) =>
                element.textContent === 'Minimum budget for your threshold',
        );
        const cardValue = card?.nextElementSibling?.textContent ?? '';
        const match = /^(\$[\d,]+) \((\d+) attempts\)$/.exec(cardValue);
        expect(match).not.toBeNull();
        expect(alerts()).toContain(
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
        expect(container.textContent).not.toContain('you need at least');
    });

    it('keeps the existing texts without a threshold', () => {
        render(stateOf({ budget: dollars(500) }));
        expect(alerts()).toEqual([]);
        expect(container.textContent).toContain('threshold not set');
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
            'no positive edge: no budget makes this safe',
        );
    });

    it('notes that the figures treat each trial as one attempt when max attempts is 3', () => {
        harness.maxAttempts = 3;
        render(stateOf({}));
        expect(container.textContent).toContain(
            "the calculator's max attempts is 3; the figures below treat each trial as one attempt, set it to 1 for per-attempt pricing",
        );
    });

    it('shows no such note when max attempts is 1', () => {
        render(stateOf({}));
        expect(container.textContent).not.toContain('max attempts is');
    });
});
