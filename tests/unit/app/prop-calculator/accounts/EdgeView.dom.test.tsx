import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EdgeView } from '~/app/(app)/prop-calculator/accounts/edge/EdgeView';
import { EdgeDrift, type EdgeSummary } from '~/lib/prop-accounts/edge';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
    isSuccess: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
        isSuccess: false,
    };
    return {
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/edge',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            edge: { summary: harness.query('edge.summary') },
            rulebook: { get: harness.query('rulebook.get') },
        },
    },
}));

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false, isSuccess: true };
}

function edgeSummary(sampleSize: number): EdgeSummary {
    const metric = {
        assumed: 0.4,
        drift: EdgeDrift.WithinNoise,
        observed: 0.4,
        standardError: 0.05,
    };
    return {
        expectancyR: metric,
        measuredRewardToRisk: null,
        rewardToRisk: 2,
        sampleSize,
        winRate: metric,
    };
}

describe('EdgeView', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    function render() {
        act(() => {
            root.render(<EdgeView />);
        });
    }

    it('shows no sample badge when the rulebook sets no trades threshold', () => {
        harness.queries.set(
            'edge.summary',
            answer({ summary: edgeSummary(10), truncated: false }),
        );
        render();
        expect(container.textContent).toContain('n = 10');
        expect(container.textContent).not.toContain('sample');
    });

    it('shows a low-sample badge once the rulebook sets a trades threshold above the journal size', () => {
        harness.queries.set('rulebook.get', {
            data: {
                ...DEFAULT_RULEBOOK,
                samples: { ...DEFAULT_RULEBOOK.samples, minTrades: 50 },
            },
            error: null,
            isError: false,
            isPending: false,
            isSuccess: true,
        });
        harness.queries.set(
            'edge.summary',
            answer({ summary: edgeSummary(10), truncated: false }),
        );
        render();
        expect(container.textContent).toContain('Low sample');
    });

    it('shows an adequate-sample badge once the journal meets the rulebook threshold', () => {
        harness.queries.set('rulebook.get', {
            data: {
                ...DEFAULT_RULEBOOK,
                samples: { ...DEFAULT_RULEBOOK.samples, minTrades: 5 },
            },
            error: null,
            isError: false,
            isPending: false,
            isSuccess: true,
        });
        harness.queries.set(
            'edge.summary',
            answer({ summary: edgeSummary(10), truncated: false }),
        );
        render();
        expect(container.textContent).toContain('Adequate sample');
    });

    it('links the measured win rate and the rulebook reward:risk into the calculator, disclosing which is which (F-V22)', () => {
        harness.queries.set(
            'edge.summary',
            answer({ summary: edgeSummary(10), truncated: false }),
        );
        render();
        const link = [...container.querySelectorAll('a')].find(
            (candidate) =>
                candidate.textContent ===
                'Try my measured win rate in the calculator',
        );
        expect(link).toBeDefined();
        const href = link?.getAttribute('href') ?? '';
        expect(href.startsWith(routes.propCalculator.index)).toBe(true);
        const query = new URLSearchParams(href.split('?', 2)[1]);
        expect(query.get('wr')).toBe('0.400');
        expect(query.get('rr')).toBe('2.00');
        expect(container.textContent).toContain(
            "not measured from your trades",
        );
    });

    it('shows no measured-edge link when the journal has no observed win rate', () => {
        harness.queries.set(
            'edge.summary',
            answer({
                summary: {
                    ...edgeSummary(10),
                    winRate: {
                        assumed: 0.4,
                        drift: EdgeDrift.NoTrades,
                        observed: null,
                        standardError: null,
                    },
                },
                truncated: false,
            }),
        );
        render();
        const link = [...container.querySelectorAll('a')].find(
            (candidate) =>
                candidate.textContent === 'Try my measured win rate in the calculator',
        );
        expect(link).toBeUndefined();
    });

    it('never writes the rulebook: the page calls no upsert mutation, only a plain link (F-95)', () => {
        harness.queries.set(
            'edge.summary',
            answer({ summary: edgeSummary(10), truncated: false }),
        );
        render();
        const link = [...container.querySelectorAll('a')].find(
            (candidate) =>
                candidate.textContent === 'Try my measured win rate in the calculator',
        );
        expect(link?.tagName).toBe('A');
    });
});
