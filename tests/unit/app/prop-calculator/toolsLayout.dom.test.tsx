import { act, type Context, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PropCalculatorToolsLayout from '~/app/(app)/prop-calculator/(tools)/layout';
import { readRecentTools } from '~/app/(app)/prop-calculator/_components/hub/recentTools';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { routes } from '~/lib/site/routes';

const harness = vi.hoisted(() => ({
    pathname: '/',
    pathnameReads: [] as boolean[],
    providerContext: null as Context<boolean> | null,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/CalculatorProvider',
    async () => {
        const { createContext } = await import('react');
        const context = createContext(false);
        harness.providerContext = context;
        return {
            CalculatorProvider: ({ children }: { children: ReactNode }) => (
                <context.Provider value>{children}</context.Provider>
            ),
        };
    },
);

vi.mock('next/navigation', async () => {
    const { createContext, useContext } = await import('react');
    const outsideProvider = createContext(false);
    return {
        usePathname: () => {
            harness.pathnameReads.push(
                useContext(harness.providerContext ?? outsideProvider),
            );
            return harness.pathname;
        },
    };
});

vi.mock('~/app/(app)/prop-calculator/_components/PropCalculatorSubnav', () => ({
    PropCalculatorSubnav: () => null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/LinkParameterNotice', () => ({
    LinkParameterNotice: () => null,
}));

describe('prop calculator tools layout', () => {
    let container: HTMLDivElement;
    let root: Root;

    function visit(pathname: string) {
        harness.pathname = pathname;
        act(() => {
            root.render(
                <PropCalculatorToolsLayout>
                    <p className="tool-page-under-test">tool page</p>
                </PropCalculatorToolsLayout>,
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.pathnameReads = [];
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

    it('mounts the recent tool recorder inside the calculator provider', () => {
        visit(routes.propCalculator.simulator);
        expect(harness.pathnameReads.length).toBeGreaterThan(0);
        expect(harness.pathnameReads.every(Boolean)).toBe(true);
        expect(
            container.querySelector(':scope main .tool-page-under-test')
                ?.textContent,
        ).toBe('tool page');
    });

    it('records every tool page visited through the layout, most recent first', () => {
        visit(routes.propCalculator.simulator);
        expect(readRecentTools()).toEqual([ToolId.Simulator]);
        visit(routes.propCalculator.compare);
        expect(readRecentTools()).toEqual([ToolId.Compare, ToolId.Simulator]);
    });
});
