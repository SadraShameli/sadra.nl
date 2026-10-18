import { act, lazy, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DebouncedSimulationModule from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';

import {
    RulebookSource,
    rulebookSourceNotice,
} from '~/app/(app)/prop-calculator/_components/bankroll/rulebookSource';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

interface Harness {
    data: typeof DEFAULT_RULEBOOK | undefined;
    isError: boolean;
    sessionError: Error | null;
    sessionPending: boolean;
    state: CalculatorState;
    userId: null | string;
}

const harness = vi.hoisted((): Harness => ({
    data: undefined,
    isError: false,
    sessionError: null,
    sessionPending: false,
    state: null as unknown as CalculatorState,
    userId: null,
}));

vi.mock('next/dynamic', () => ({
    default: (
        loader: () => Promise<{
            default: (properties: Record<string, unknown>) => null;
        }>,
    ) => {
        const Loaded = lazy(loader);
        return function Dynamic(properties: Record<string, unknown>) {
            return (
                <Suspense fallback={null}>
                    <Loaded {...properties} />
                </Suspense>
            );
        };
    },
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({
        data: harness.userId === null ? null : { user: { id: harness.userId } },
        error: harness.sessionError,
        isPending: harness.sessionPending,
    }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: {
                    useQuery: () => ({
                        data: harness.data,
                        isError: harness.isError,
                    }),
                },
            },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({
        dispatch: vi.fn(),
        setEvalDayPolicy: vi.fn(),
    }),
    useCalculatorInputs: () => ({
        simInputs: buildSimInputs(harness.state),
        state: harness.state,
    }),
    useObjectiveChoice: () => ({ automaticBasis: null, queryFailure: null }),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/useDebouncedSimulation',
    async (importOriginal) => ({
        ...(await importOriginal<typeof DebouncedSimulationModule>()),
        useDebouncedComputation: () => ({
            error: null,
            pending: false,
            result: [],
        }),
    }),
);

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

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/SensitivityHeatmap', () => ({
    default: () => null,
}));

const { SizingView } =
    await import('~/app/(app)/prop-calculator/(tools)/sizing/SizingView');

const FAILED_TEXT = rulebookSourceNotice(RulebookSource.DefaultFailed)?.text;
const LOADING_TEXT = rulebookSourceNotice(RulebookSource.DefaultLoading)?.text;
const SESSION_FAILED_TEXT = rulebookSourceNotice(
    RulebookSource.DefaultSessionFailed,
)?.text;
const SESSION_PENDING_TEXT = rulebookSourceNotice(
    RulebookSource.DefaultSessionPending,
)?.text;

function occurrences(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

describe('the whole sizing page says which rulebook it used exactly once (PT-63e, F-V24)', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function renderPage(): Promise<string> {
        act(() => {
            root.render(<SizingView />);
        });
        await vi.waitFor(
            async () => {
                await act(async () => {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                });
                expect(
                    container.querySelector(
                        '.app-prop-calculator__optimal-risk',
                    ),
                ).not.toBeNull();
                expect(container.textContent).toContain('Take-profit what-if');
            },
            { interval: 20, timeout: 8000 },
        );
        return container.textContent;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.data = undefined;
        harness.isError = false;
        harness.sessionError = null;
        harness.sessionPending = false;
        harness.state = defaultCalculatorState();
        harness.userId = null;
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

    it('mounts the real optimal risk table and the take-profit card', async () => {
        await renderPage();
        expect(
            container.querySelector('.app-prop-calculator__optimal-risk'),
        ).not.toBeNull();
        expect(container.textContent).toContain('Take-profit what-if');
    });

    it('prints one alert when the signed-in rulebook query failed', async () => {
        harness.isError = true;
        harness.userId = 'user-1';
        const text = await renderPage();
        expect(occurrences(text, FAILED_TEXT ?? '')).toBe(1);
        expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    });

    it('prints one status while the signed-in rulebook loads', async () => {
        harness.userId = 'user-1';
        const text = await renderPage();
        expect(occurrences(text, LOADING_TEXT ?? '')).toBe(1);
        expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    });

    it('prints one status while the session is pending', async () => {
        harness.sessionPending = true;
        const text = await renderPage();
        expect(occurrences(text, SESSION_PENDING_TEXT ?? '')).toBe(1);
        expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    });

    it('prints one alert when the session request failed', async () => {
        harness.sessionError = new Error('session down');
        const text = await renderPage();
        expect(occurrences(text, SESSION_FAILED_TEXT ?? '')).toBe(1);
        expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    });

    it('prints nothing for a signed-out visitor or a loaded user rulebook', async () => {
        const signedOut = await renderPage();
        expect(signedOut).not.toContain('rulebook is used');
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(container.querySelector('[role="status"]')).toBeNull();
        act(() => {
            root.unmount();
        });
        root = createRoot(container);
        harness.userId = 'user-1';
        harness.data = DEFAULT_RULEBOOK;
        const loaded = await renderPage();
        expect(loaded).not.toContain('rulebook is used');
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(container.querySelector('[role="status"]')).toBeNull();
    });
});
