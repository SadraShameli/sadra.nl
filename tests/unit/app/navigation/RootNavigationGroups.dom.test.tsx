import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RootAccountingProduct } from '~/app/(app)/_components/navigation/RootNavigationGroups';
import {
    ACCOUNTING_NAV_PRODUCT,
    NavProductId,
} from '~/app/(app)/_components/navigation/siteNavigation';
import { ROLE } from '~/lib/auth/roles';

interface SessionStub {
    current: null | { readonly user: { readonly role: string } };
}

const session = vi.hoisted((): SessionStub => ({ current: null }));

vi.mock('~/lib/auth/session', () => ({
    readSession: async () => session.current,
}));

describe('RootAccountingProduct', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function render(): Promise<void> {
        const element = await RootAccountingProduct();
        act(() => {
            root.render(element);
        });
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
        session.current = null;
        vi.unstubAllGlobals();
    });

    it('shows the accounting importer card to the root user', async () => {
        session.current = { user: { role: ROLE.ROOT } };
        await render();
        const card = container.querySelector<HTMLElement>('[data-product]');
        expect(card?.dataset.product).toBe(NavProductId.Accounting);
        expect(card?.textContent).toContain(ACCOUNTING_NAV_PRODUCT.label);
        expect(card?.textContent).toContain(ACCOUNTING_NAV_PRODUCT.description);
    });

    it.each([
        null,
        { user: { role: ROLE.ADMIN } },
        { user: { role: ROLE.USER } },
    ])('hides it from everyone else (%o)', async (current) => {
        session.current = current;
        await render();
        expect(container.querySelector('[data-product]')).toBeNull();
    });
});
