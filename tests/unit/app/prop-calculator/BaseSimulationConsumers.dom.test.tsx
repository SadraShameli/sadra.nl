import path from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import {
    CalculatorProvider,
    useBaseResult,
    useCalculatorInputs,
} from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { simulate } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

import { propCalculatorAppDir } from './appPageFiles';
import {
    preloadSourceTexts,
    sourceFilesUnder,
    sourceText,
} from './toolPageFiles';

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

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            bankroll: {
                summary: { useQuery: () => ({ data: undefined }) },
            },
            rulebook: {
                get: { useQuery: () => ({ data: undefined }) },
            },
        },
    },
}));

const LINK_TRIALS = 100;
const LINK_WINRATE = 0.55;
const SRC_ROOT = path.join(process.cwd(), 'src');
const APP_ROOT = path.join(SRC_ROOT, 'app');
const BASE_RESULT_READERS = [
    path.join(
        'app',
        '(app)',
        'prop-calculator',
        '(tools)',
        'analysis',
        'AnalysisView.tsx',
    ),
    path.join(
        'app',
        '(app)',
        'prop-calculator',
        '(tools)',
        'simulator',
        'SimulatorView.tsx',
    ),
    path.join(
        'app',
        '(app)',
        'prop-calculator',
        '_components',
        'bankroll',
        'SetupCard.tsx',
    ),
];

function InputsOnly() {
    const { state } = useCalculatorInputs();
    return <span>{state.firm.displayName}</span>;
}

function linkQuery(): string {
    return encodeState({
        ...defaultCalculatorState(),
        trials: LINK_TRIALS,
        winrate: LINK_WINRATE,
    }).toString();
}

function ResultReader() {
    const { isPending } = useBaseResult();
    return <span>{isPending ? 'pending' : 'settled'}</span>;
}

async function settle(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

function visit(url: string) {
    window.history.replaceState(null, '', url);
    navigation.pathname = new URL(url, window.location.origin).pathname;
}

describe('the base simulation runs only for a mounted reader of the result', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(children: ReactNode) {
        act(() => {
            root.render(<CalculatorProvider>{children}</CalculatorProvider>);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        navigation.router.replace.mockReset();
        window.sessionStorage.clear();
        vi.mocked(simulate).mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('runs no simulation for a tree that never calls useBaseResult', async () => {
        visit(`${routes.propCalculator.sizing}?${linkQuery()}`);
        render(<InputsOnly />);
        await settle(SIM_DEBOUNCE_MS + 1);
        await settle(SIM_DEBOUNCE_MS + 1);
        expect(container.textContent).not.toBe('');
        expect(simulate).not.toHaveBeenCalled();
    });

    it('runs it once after mount, on the inputs of the shared link, for a tree that calls it', async () => {
        visit(`${routes.propCalculator.simulator}?${linkQuery()}`);
        render(<ResultReader />);
        await settle(SIM_DEBOUNCE_MS + 1);
        await settle(SIM_DEBOUNCE_MS + 1);
        expect(simulate).toHaveBeenCalledTimes(1);
        expect(vi.mocked(simulate).mock.calls[0]?.[0].winrate).toBeCloseTo(
            LINK_WINRATE,
            6,
        );
        expect(vi.mocked(simulate).mock.calls[0]?.[0].trials).toBe(LINK_TRIALS);
        expect(container.textContent).toBe('settled');
    });

    it('stops reading when the last reader unmounts and runs nothing for a changed tree', async () => {
        visit(`${routes.propCalculator.simulator}?${linkQuery()}`);
        render(<ResultReader />);
        await settle(SIM_DEBOUNCE_MS + 1);
        const runs = vi.mocked(simulate).mock.calls.length;
        render(<InputsOnly />);
        await settle(SIM_DEBOUNCE_MS + 1);
        expect(vi.mocked(simulate).mock.calls).toHaveLength(runs);
    });

    it('never runs it in a server render', () => {
        visit(`${routes.propCalculator.simulator}?${linkQuery()}`);
        const html = renderToString(
            <CalculatorProvider>
                <ResultReader />
            </CalculatorProvider>,
        );
        expect(html).toContain('pending');
        expect(simulate).not.toHaveBeenCalled();
    });
});

describe('the readers of the shared base result', () => {
    beforeAll(async () => {
        await preloadSourceTexts(APP_ROOT);
    });

    it('are exactly the simulator, the analysis page and the bankroll setup card', () => {
        const provider = path.join(
            propCalculatorAppDir('_components'),
            'CalculatorProvider.tsx',
        );
        const readers = sourceFilesUnder(APP_ROOT)
            .filter(
                (file) =>
                    file !== provider &&
                    /\buseBaseResult\b/.test(sourceText(file)),
            )
            .map((file) => path.relative(SRC_ROOT, file))
            .toSorted((a, b) => a.localeCompare(b));
        expect(readers).toEqual(
            BASE_RESULT_READERS.toSorted((a, b) => a.localeCompare(b)),
        );
    });
});
