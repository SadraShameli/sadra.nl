import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UseToolsWorkerModule from '~/app/(app)/prop-calculator/_components/useToolsWorker';

import { AnalysisView } from '~/app/(app)/prop-calculator/(tools)/analysis/AnalysisView';
import { SimulatorView } from '~/app/(app)/prop-calculator/(tools)/simulator/SimulatorView';
import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { PropCalculatorSubnav } from '~/app/(app)/prop-calculator/_components/PropCalculatorSubnav';
import {
    LINKED_TOOL_CATALOG,
    toolsByGroup,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { SIM_INPUTS_REFUSAL_PREFIX, simulate } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

import { basePath, hasToolPage } from './toolPageFiles';

const navigation = vi.hoisted(() => ({
    pathname: '/',
    router: { replace: vi.fn<(href: string) => void>() },
}));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => navigation.router,
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock(import('~/lib/prop-calculator'), async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, simulate: vi.fn(actual.simulate) };
});

vi.mock('next/dynamic', () => ({ default: () => renderNothing }));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/InputsSummary', () => ({
    InputsSummary: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorInputsForm', () => ({
    CalculatorInputsForm: ({ aside }: { aside: ReactNode }) => aside,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/useToolsWorker',
    async (importOriginal) => {
        const actual = await importOriginal<typeof UseToolsWorkerModule>();
        return {
            ToolsWorkerPhase: actual.ToolsWorkerPhase,
            useToolsWorker: () => ({
                cancel: vi.fn(),
                run: vi.fn(),
                state: { phase: actual.ToolsWorkerPhase.Idle },
            }),
        };
    },
);

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', async () => {
    const { trpcDoubleReact } = await import('../../../stubs/trpcDouble');
    return trpcDoubleReact({
        api: {
            propAccounts: {
                bankroll: {
                    summary: { query: () => ({ data: undefined }) },
                },
                rulebook: {
                    get: { query: () => ({ data: undefined }) },
                },
            },
        },
    });
});

const NOTICE = '.app-prop-calculator__simulation-failure';
const ENGINE_FAILURES = [
    [
        'a plain engine error',
        'simulate: trials must be a positive safe integer',
        'simulate: trials must be a positive safe integer',
    ],
    [
        'a non-sizing engine input refusal',
        `${SIM_INPUTS_REFUSAL_PREFIX}winrate must be between 0 and 1`,
        'winrate must be between 0 and 1',
    ],
] as const;

function notices(): string[] {
    return [...document.querySelectorAll(NOTICE)].map(
        (node) => node.textContent,
    );
}

function renderNothing(): null {
    return null;
}

async function settle(ms = 0) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

function visit(url: string) {
    window.history.replaceState(null, '', url);
    navigation.pathname = new URL(url, window.location.origin).pathname;
}

describe('CalculatorProvider mount', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(children: ReactNode = null) {
        act(() => {
            root.render(<CalculatorProvider>{children}</CalculatorProvider>);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        navigation.router.replace.mockReset();
        window.sessionStorage.clear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        window.dispatchEvent(new Event('keydown'));
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.mocked(simulate).mockReset();
    });

    it.each(ENGINE_FAILURES)(
        'the simulator page shows the exact text of %s thrown by the base simulation (PT-11g)',
        async (_, thrown, shown) => {
            vi.mocked(simulate).mockImplementation(() => {
                throw new Error(thrown);
            });
            visit(routes.propCalculator.simulator);
            render(<SimulatorView />);
            await settle(SIM_DEBOUNCE_MS + 1);
            await settle(SIM_DEBOUNCE_MS + 1);
            expect(simulate).toHaveBeenCalled();
            expect(notices()).toEqual([shown, shown]);
            expect(document.querySelector('.animate-pulse')).toBeNull();
        },
    );

    it.each(ENGINE_FAILURES)(
        'the analysis page shows the exact text of %s in every base result section (PT-11g)',
        async (_, thrown, shown) => {
            vi.mocked(simulate).mockImplementation(() => {
                throw new Error(thrown);
            });
            visit(routes.propCalculator.analysis);
            render(<AnalysisView />);
            await settle(SIM_DEBOUNCE_MS + 1);
            await settle(SIM_DEBOUNCE_MS + 1);
            expect(simulate).toHaveBeenCalled();
            expect(notices()).toEqual([shown, shown, shown, shown]);
        },
    );

    it('the simulator page shows no failure once the base simulation succeeds (PT-11g)', async () => {
        visit(routes.propCalculator.simulator);
        render(<SimulatorView />);
        await settle(SIM_DEBOUNCE_MS + 1);
        await settle(SIM_DEBOUNCE_MS + 1);
        expect(simulate).toHaveBeenCalled();
        expect(notices()).toEqual([]);
    });

    it('links the tools subnav only to tool pages that exist', async () => {
        const slot = document.createElement('div');
        slot.id = 'navbar-subnav-slot';
        document.body.append(slot);
        visit(routes.propCalculator.simulator);
        render(<PropCalculatorSubnav />);
        await settle();

        const hrefs = [...slot.querySelectorAll(':scope nav a')].map((link) =>
            basePath(link.getAttribute('href') ?? ''),
        );
        expect(hrefs.length).toBeGreaterThan(0);
        expect(hrefs.filter((href) => !hasToolPage(href))).toEqual([]);
        expect(hrefs).toEqual(
            toolsByGroup(LINKED_TOOL_CATALOG).map(
                (group) => group.tools[0].route,
            ),
        );
    });
});
