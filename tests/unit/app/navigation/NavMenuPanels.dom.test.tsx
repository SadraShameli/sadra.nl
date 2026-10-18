import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopMenuPanel } from '~/app/(app)/_components/navigation/NavMenuPanels';
import {
    NAV_ITEMS,
    NavItemKind,
    type NavMenu,
} from '~/app/(app)/_components/navigation/siteNavigation';

const MENUS = NAV_ITEMS.filter(
    (item): item is NavMenu => item.kind !== NavItemKind.HomeSection,
);

describe('the desktop navbar menu panels', () => {
    let container: HTMLDivElement;
    let root: Root;

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

    it.each(MENUS.map((menu) => [menu.label, menu] as const))(
        'keeps the %s panel within the viewport and scrolls it when it is taller',
        (_, menu) => {
            act(() => {
                root.render(<DesktopMenuPanel extra={null} menu={menu} />);
            });
            const panel = container.firstElementChild;
            expect(panel?.classList.contains('overflow-y-auto')).toBe(true);
            expect(panel?.classList.contains('max-h-[calc(100svh-7rem)]')).toBe(
                true,
            );
        },
    );

    it('lays the Tools products out in three columns from laptop width', () => {
        const products = MENUS.find(
            (menu) => menu.kind === NavItemKind.Products,
        );
        if (products === undefined) throw new Error('No products menu');
        act(() => {
            root.render(<DesktopMenuPanel extra={null} menu={products} />);
        });
        expect(
            container.firstElementChild?.classList.contains('lg:grid-cols-3'),
        ).toBe(true);
    });
});
