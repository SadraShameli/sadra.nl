import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type Mock,
    vi,
} from 'vitest';

import { CalculatorProvider } from '~/app/(app)/prop-calculator/_components/CalculatorProvider';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { PropCalculatorSubnav } from '~/app/(app)/prop-calculator/_components/PropCalculatorSubnav';
import { LINKED_TOOL_CATALOG } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';
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

const TIMEOUT_MS = 5000;
const TARGET = LegacySection.TailRisk;

type ScrollSpy = Mock<(options?: boolean | ScrollIntoViewOptions) => void>;

function mountMain(...children: HTMLElement[]): HTMLElement {
    const main = document.createElement('main');
    main.append(...children);
    document.body.append(main);
    return main;
}

function pendingPanel(): HTMLElement {
    const skeleton = document.createElement('div');
    skeleton.className = 'h-96 animate-pulse';
    return skeleton;
}

async function settle(ms = 0) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

function targetSection(): { scroll: ScrollSpy; section: HTMLElement } {
    const section = document.createElement('section');
    section.id = TARGET;
    const scroll: ScrollSpy = vi.fn();
    section.scrollIntoView = scroll;
    return { scroll, section };
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
    });

    it('sends a legacy section hash to its tool page and scrolls there once the section mounts', async () => {
        const addListener = vi.spyOn(window, 'addEventListener');
        visit(`${routes.propCalculator.simulator}#${TARGET}`);
        render();
        expect(navigation.router.replace).toHaveBeenCalledTimes(1);
        const target = navigation.router.replace.mock.calls[0]?.[0] ?? '';
        const landed = new URL(target, window.location.origin);
        expect(landed.pathname).toBe(routes.propCalculator.analysis);
        expect(landed.hash).toBe(`#${TARGET}`);
        expect(landed.searchParams.get('firm')).toBe(
            defaultCalculatorState().firm.id,
        );

        const listenedEvents: string[] = addListener.mock.calls.map(
            ([event]) => event,
        );
        const watchOrder = listenedEvents.indexOf('wheel');
        expect(watchOrder).toBeGreaterThanOrEqual(0);
        expect(addListener.mock.invocationCallOrder[watchOrder]).toBeLessThan(
            navigation.router.replace.mock.invocationCallOrder[0] ?? 0,
        );

        visit(target);
        const { scroll, section } = targetSection();
        mountMain(section);
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
        expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    });

    it('scrolls to a legacy section already on the current page once the panels before it resolve', async () => {
        visit(`${routes.propCalculator.analysis}#${TARGET}`);
        render();
        expect(navigation.router.replace).not.toHaveBeenCalled();

        const skeleton = pendingPanel();
        const { scroll, section } = targetSection();
        mountMain(skeleton, section);
        await settle();
        expect(scroll).not.toHaveBeenCalled();

        skeleton.remove();
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it.each(['', '#nope', '#Tail-Risk', '#'])(
        'neither redirects nor scrolls for the hash "%s"',
        async (hash) => {
            visit(`${routes.propCalculator.analysis}${hash}`);
            render();
            const { scroll, section } = targetSection();
            mountMain(section);
            await settle(TIMEOUT_MS + 1);
            expect(navigation.router.replace).not.toHaveBeenCalled();
            expect(scroll).not.toHaveBeenCalled();
        },
    );

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
        expect(hrefs).toEqual(LINKED_TOOL_CATALOG.map((entry) => entry.route));
    });
});
