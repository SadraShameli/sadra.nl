import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
    replace: vi.fn<(href: string, options: { scroll: boolean }) => void>(),
    search: 'tab=money',
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: navigation.replace }),
    useSearchParams: () => new URLSearchParams(navigation.search),
}));

import { UrlPageTabs } from '~/components/PageTabs';

const TABS = [
    { content: <p>Alerts</p>, label: 'Today', value: 'today' },
    { content: <p>Cash by month</p>, label: 'Money', value: 'money' },
] as const;

describe('URL page tabs', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        navigation.replace.mockReset();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <UrlPageTabs
                    defaultValue="today"
                    searchParameter="tab"
                    tabs={TABS}
                />,
            );
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    function tab(label: string): HTMLButtonElement {
        const found = [
            ...container.querySelectorAll<HTMLButtonElement>(
                ':scope [role="tab"]',
            ),
        ].find((candidate) => candidate.textContent === label);
        if (found === undefined) throw new Error(`no ${label} tab`);
        return found;
    }

    it('opens on the tab named in the URL', () => {
        expect(tab('Money').getAttribute('aria-selected')).toBe('true');
        expect(container.textContent).toContain('Cash by month');
    });

    it('drops the parameter when the default tab is chosen', () => {
        act(() => {
            tab('Today').dispatchEvent(
                new MouseEvent('mousedown', { bubbles: true, button: 0 }),
            );
        });
        expect(navigation.replace).toHaveBeenCalledWith('?', {
            scroll: false,
        });
    });
});
