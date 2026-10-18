import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Navbar from '~/app/(app)/_components/Navbar';
import { RouteSubnav } from '~/app/(app)/_components/RouteSubnav';

const SECTION_PATH = '/lifting/body';

const SUSPENSE_REVEAL_WAIT_MS = 400;

const pathnameReady = vi.hoisted(() => Promise.withResolvers<undefined>());

vi.mock('next/navigation', async () => {
    const { use } = await import('react');
    return {
        usePathname: () => {
            use(pathnameReady.promise);
            return SECTION_PATH;
        },
    };
});

class SilentObserver {
    disconnect(): void {
        return;
    }

    observe(): void {
        return;
    }

    unobserve(): void {
        return;
    }
}

describe('the section nav under the navbar', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('ResizeObserver', SilentObserver);
        vi.stubGlobal('IntersectionObserver', SilentObserver);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('stays in the live navbar slot after the navbar swaps its path-less fallback for the real bar', async () => {
        await act(async () => {
            root.render(
                <>
                    <Navbar accountLink={null} menuExtras={{}} />
                    <RouteSubnav
                        ariaLabel="Lifting"
                        items={[{ href: SECTION_PATH, label: 'Body' }]}
                    />
                </>,
            );
        });
        await act(async () => {
            pathnameReady.resolve(undefined);
            await new Promise((resolve) => {
                setTimeout(resolve, SUSPENSE_REVEAL_WAIT_MS);
            });
        });

        const slot = document.querySelector('#navbar-subnav-slot');
        expect(
            slot?.querySelector(':scope nav[aria-label="Lifting"]'),
        ).not.toBeNull();
    });
});
