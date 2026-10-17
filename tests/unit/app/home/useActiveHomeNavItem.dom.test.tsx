import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type ActiveHomeNav,
    type ActiveHomeNavItem,
    HomeNavTarget,
    useActiveHomeNavItem,
} from '~/app/(app)/_components/useActiveHomeNavItem';
import { HOME_SECTIONS, HomeSectionId } from '~/lib/site/homeSections';

const pathname = vi.hoisted(() => ({ current: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => pathname.current,
}));

const VIEWPORT_HEIGHT = 1000;
const SCROLL_IDLE_WAIT_MS = 220;
const sectionTops = new Map<HomeSectionId, number>();
const probe: { nav: ActiveHomeNav | null; roots: Root[] } = {
    nav: null,
    roots: [],
};

async function nextFrame(): Promise<void> {
    await new Promise((resolve) => requestAnimationFrame(resolve));
}

function placeSections(scrollY: number): void {
    for (const [index, section] of HOME_SECTIONS.entries()) {
        sectionTops.set(section.id, 900 + index * 1000 - scrollY);
    }
}

function Probe() {
    probe.nav = useActiveHomeNavItem();
    return null;
}

async function render(): Promise<void> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    probe.roots.push(root);
    await act(async () => {
        root.render(<Probe />);
        await nextFrame();
    });
}

async function scrollTo(scrollY: number): Promise<void> {
    placeSections(scrollY);
    await act(async () => {
        window.dispatchEvent(new Event('scroll'));
        await nextFrame();
    });
}

function seen(): ActiveHomeNavItem | null | undefined {
    return probe.nav?.activeItem;
}

beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('innerHeight', VIEWPORT_HEIGHT);
    pathname.current = '/';
    for (const section of HOME_SECTIONS) {
        const element = document.createElement('section');
        element.id = section.id;
        element.getBoundingClientRect = () =>
            DOMRect.fromRect({
                height: 1000,
                y: sectionTops.get(section.id) ?? 0,
            });
        document.body.append(element);
    }
    placeSections(0);
});

afterEach(() => {
    act(() => {
        for (const root of probe.roots) root.unmount();
    });
    probe.roots = [];
    probe.nav = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
});

describe('useActiveHomeNavItem', () => {
    it('marks Home while the hero is in view', async () => {
        await render();

        expect(seen()).toBe(HomeNavTarget.Top);
    });

    it('follows the section that crosses the upper third of the screen', async () => {
        await render();

        await scrollTo(700);
        expect(seen()).toBe(HomeSectionId.Tools);

        await scrollTo(2700);
        expect(seen()).toBe(HomeSectionId.Live);

        await scrollTo(0);
        expect(seen()).toBe(HomeNavTarget.Top);
    });

    it('holds a clicked item through the scroll it starts, then follows the page again', async () => {
        await render();

        await act(async () => {
            probe.nav?.pin(HomeSectionId.About);
            await Promise.resolve();
        });
        expect(seen()).toBe(HomeSectionId.About);

        await scrollTo(700);
        await scrollTo(2700);
        expect(seen()).toBe(HomeSectionId.About);

        await act(async () => {
            await new Promise((resolve) =>
                setTimeout(resolve, SCROLL_IDLE_WAIT_MS),
            );
        });
        expect(seen()).toBe(HomeSectionId.Live);
    });

    it('marks nothing away from the homepage', async () => {
        pathname.current = '/portfolio';

        await render();

        expect(seen()).toBeNull();
    });
});
