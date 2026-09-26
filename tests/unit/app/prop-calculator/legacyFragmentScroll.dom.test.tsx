import { act } from 'react';
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

import { HubLegacySectionRedirect } from '~/app/(app)/prop-calculator/_components/HubLegacySectionRedirect';
import { watchLegacyFragmentScroll } from '~/app/(app)/prop-calculator/_components/legacyFragmentScroll';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';
import { routes } from '~/lib/site/routes';

const router = vi.hoisted(() => ({ replace: vi.fn<(href: string) => void>() }));

vi.mock('next/navigation', () => ({
    useRouter: () => router,
}));

const TIMEOUT_MS = 5000;
const ROUTE = routes.propCalculator.analysis;
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
    await vi.advanceTimersByTimeAsync(ms);
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
}

describe('watchLegacyFragmentScroll', () => {
    const stops: (() => void)[] = [];

    function watch(route = ROUTE) {
        const stop = watchLegacyFragmentScroll(TARGET, route);
        stops.push(stop);
        return stop;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        visit(ROUTE);
    });

    afterEach(() => {
        for (const stop of stops.splice(0)) stop();
        document.body.replaceChildren();
        vi.useRealTimers();
    });

    it('scrolls right away when the section is already mounted and settled on its route', async () => {
        const { scroll, section } = targetSection();
        mountMain(section);
        watch();
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
        expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    });

    it('waits for the section to mount, then scrolls to it', async () => {
        const main = mountMain();
        watch();
        await settle();
        const { scroll, section } = targetSection();
        main.append(section);
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('waits while a pending panel sits before the section, then scrolls once it resolves', async () => {
        const skeleton = pendingPanel();
        const { scroll, section } = targetSection();
        const main = mountMain(skeleton, section);
        watch();
        await settle();
        expect(scroll).not.toHaveBeenCalled();
        const panel = document.createElement('div');
        skeleton.replaceWith(panel);
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
        main.append(document.createElement('div'));
        await settle(TIMEOUT_MS);
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('waits while a pending panel sits inside the section', async () => {
        const { scroll, section } = targetSection();
        const skeleton = pendingPanel();
        section.append(skeleton);
        mountMain(section);
        watch();
        await settle();
        expect(scroll).not.toHaveBeenCalled();
        skeleton.remove();
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('waits while a pending panel wraps the section', async () => {
        const { scroll, section } = targetSection();
        const wrapper = pendingPanel();
        wrapper.append(section);
        const main = mountMain(wrapper);
        watch();
        await settle();
        expect(scroll).not.toHaveBeenCalled();
        wrapper.classList.remove('animate-pulse');
        main.append(document.createElement('div'));
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('ignores a pending panel after the section', async () => {
        const { scroll, section } = targetSection();
        mountMain(section, pendingPanel());
        watch();
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('ignores a pending panel outside the main landmark of the section', async () => {
        const outside = pendingPanel();
        document.body.append(outside);
        const { scroll, section } = targetSection();
        mountMain(section);
        watch();
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('never scrolls while the pathname is not the target route, even at the timeout', async () => {
        visit(routes.propCalculator.index);
        const { scroll, section } = targetSection();
        const main = mountMain(section);
        watch();
        main.append(document.createElement('div'));
        await settle(TIMEOUT_MS + 1);
        expect(scroll).not.toHaveBeenCalled();
    });

    it('scrolls once the navigation reaches the target route', async () => {
        visit(routes.propCalculator.index);
        const main = mountMain();
        watch();
        await settle();
        visit(`${ROUTE}#${TARGET}`);
        const { scroll, section } = targetSection();
        main.append(section);
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('scrolls at the timeout even while a panel before the section is still pending', async () => {
        const { scroll, section } = targetSection();
        mountMain(pendingPanel(), section);
        watch();
        await settle(TIMEOUT_MS - 1);
        expect(scroll).not.toHaveBeenCalled();
        await settle(1);
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it.each(['keydown', 'pointerdown', 'touchmove', 'wheel'])(
        'gives up after a %s from the user',
        async (event) => {
            const skeleton = pendingPanel();
            const { scroll, section } = targetSection();
            mountMain(skeleton, section);
            watch();
            await settle();
            window.dispatchEvent(new Event(event));
            skeleton.remove();
            await settle(TIMEOUT_MS + 1);
            expect(scroll).not.toHaveBeenCalled();
        },
    );

    it('stops watching and releases its listeners when stopped', async () => {
        const removed = vi.spyOn(window, 'removeEventListener');
        const skeleton = pendingPanel();
        const { scroll, section } = targetSection();
        mountMain(skeleton, section);
        const stop = watch();
        await settle();
        stop();
        skeleton.remove();
        await settle(TIMEOUT_MS + 1);
        expect(scroll).not.toHaveBeenCalled();
        expect(
            removed.mock.calls
                .map(([event]) => event)
                .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(['keydown', 'pointerdown', 'touchmove', 'wheel']);
        removed.mockRestore();
    });
});

describe('HubLegacySectionRedirect', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<HubLegacySectionRedirect />);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        router.replace.mockClear();
        window.sessionStorage.clear();
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

    it('sends a legacy section hash to its tool page and scrolls there once the section mounts', async () => {
        visit(`${routes.propCalculator.index}#${TARGET}`);
        render();
        expect(router.replace).toHaveBeenCalledTimes(1);
        expect(router.replace).toHaveBeenCalledWith(`${ROUTE}#${TARGET}`);
        visit(`${ROUTE}#${TARGET}`);
        const { scroll, section } = targetSection();
        mountMain(section);
        await settle();
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('carries the query of the link to the tool page', () => {
        visit(`${routes.propCalculator.index}?wr=0.5#${TARGET}`);
        render();
        expect(router.replace).toHaveBeenCalledWith(
            `${ROUTE}?wr=0.5#${TARGET}`,
        );
    });

    it.each(['#nope', '#Tail-Risk', '#', ''])(
        'does nothing for the hash "%s"',
        (hash) => {
            visit(`${routes.propCalculator.index}?firm=apex${hash}`);
            render();
            expect(router.replace).not.toHaveBeenCalled();
        },
    );
});
