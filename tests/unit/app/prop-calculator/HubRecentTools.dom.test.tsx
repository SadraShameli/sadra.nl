import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    HubRecentTools,
    RecentToolRecorder,
} from '~/app/(app)/prop-calculator/_components/hub/HubRecentTools';
import { readRecentTools } from '~/app/(app)/prop-calculator/_components/hub/recentTools';
import { writeLastToolQuery } from '~/app/(app)/prop-calculator/_components/lastToolQuery';
import {
    toolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { routes } from '~/lib/site/routes';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
}));

describe('recently used tools on the hub', () => {
    let container: HTMLDivElement;
    let root: Root;

    function visit(pathname: string) {
        navigation.pathname = pathname;
        act(() => {
            root.render(<RecentToolRecorder />);
        });
    }

    function renderHub() {
        act(() => {
            root.render(<HubRecentTools />);
        });
    }

    function recentLinks(): { href: string; label: string }[] {
        return [
            ...container.querySelectorAll<HTMLAnchorElement>(
                '.app-prop-calculator__recent-tool',
            ),
        ].map((link) => ({
            href: link.getAttribute('href') ?? '',
            label: link.textContent,
        }));
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        window.localStorage.clear();
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
        vi.unstubAllGlobals();
    });

    it('renders nothing before any tool visit', () => {
        renderHub();
        expect(container.getHTML()).toBe('');
    });

    it('records each tool route the recorder sees, most recent first', () => {
        visit(routes.propCalculator.simulator);
        visit(routes.propCalculator.compare);
        expect(readRecentTools()).toEqual([ToolId.Compare, ToolId.Simulator]);
    });

    it('records nothing for the hub or a page outside the tools', () => {
        visit(routes.propCalculator.index);
        visit(routes.propCalculator.accounts.index);
        expect(readRecentTools()).toEqual([]);
    });

    it('lists the visited tools on the hub with the last tool query', () => {
        visit(routes.propCalculator.simulator);
        visit(routes.propCalculator.compare);
        writeLastToolQuery('firm=alphafutures');
        renderHub();
        const compare = toolCatalogEntry(ToolId.Compare);
        const simulator = toolCatalogEntry(ToolId.Simulator);
        expect(recentLinks()).toEqual([
            {
                href: `${compare.route}?firm=alphafutures`,
                label: compare.label,
            },
            {
                href: `${simulator.route}?firm=alphafutures`,
                label: simulator.label,
            },
        ]);
        expect(container.querySelector('#hub-recent-tools')?.textContent).toBe(
            'Recently used',
        );
    });
});
