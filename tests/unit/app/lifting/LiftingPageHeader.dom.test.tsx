import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { routes } from '~/lib/site/routes';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
}));

describe('LiftingPageHeader', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(pathname: string, title: string) {
        navigation.pathname = pathname;
        act(() => {
            root.render(
                <LiftingPageHeader
                    description="About this page."
                    title={title}
                />,
            );
        });
    }

    function tabLabels(): (null | string)[] {
        return [
            ...container.querySelectorAll(
                ':scope header nav[aria-label="Lifting pages"] a',
            ),
        ].map((link) => link.textContent);
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

    it('shows the plans tabs on the routines page', () => {
        render(routes.lifting.routines, 'Routines');
        expect(tabLabels()).toEqual(['Programs', 'Routines']);
    });

    it('shows the progress tabs on the body page', () => {
        render(routes.lifting.body, 'Body');
        expect(tabLabels()).toEqual(['Analytics', 'Body', 'Goals']);
    });

    it('shows no tabs on a page outside every group', () => {
        render(routes.lifting.log, 'Log');
        expect(container.querySelector(':scope header nav')).toBeNull();
    });
});
