import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as BrowserStorageModule from '~/app/(app)/prop-calculator/_components/browserStorage';

import { HubToolCards } from '~/app/(app)/prop-calculator/_components/HubToolCards';
import { writeLastToolQuery } from '~/app/(app)/prop-calculator/_components/lastToolQuery';
import {
    LINKED_TOOL_CATALOG,
    type ToolCatalogEntry,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { basePath } from './toolPageFiles';

interface StorageHarness {
    mode: 'missing' | 'real' | 'throwing';
}

const harness = vi.hoisted((): StorageHarness => ({ mode: 'real' }));

vi.mock(
    '~/app/(app)/prop-calculator/_components/browserStorage',
    async (importOriginal) => {
        const actual = await importOriginal<typeof BrowserStorageModule>();
        return {
            ...actual,
            sessionStorageOrNull: () => {
                switch (harness.mode) {
                    case 'missing': {
                        return null;
                    }
                    case 'real': {
                        return actual.sessionStorageOrNull();
                    }
                    case 'throwing': {
                        return {
                            getItem: blockedStorageAccess,
                            setItem: blockedStorageAccess,
                        };
                    }
                }
            },
        };
    },
);

const QUERY = 'firm=apex&wr=0.400';

function blockedStorageAccess(): never {
    throw new Error('blocked');
}

describe('HubToolCards', () => {
    let container: HTMLDivElement;
    let root: Root;

    function hrefOf(entry: ToolCatalogEntry): string {
        const link = [
            ...container.querySelectorAll<HTMLAnchorElement>(
                '.app-prop-calculator__hub-card',
            ),
        ].find(
            (card) => basePath(card.getAttribute('href') ?? '') === entry.route,
        );
        if (link === undefined) throw new Error(`no card for ${entry.route}`);
        return link.getAttribute('href') ?? '';
    }

    function render() {
        act(() => {
            root.render(<HubToolCards />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        window.sessionStorage.clear();
        harness.mode = 'real';
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

    it('renders one card per linked tool', () => {
        render();
        expect(
            container.querySelectorAll('.app-prop-calculator__hub-card'),
        ).toHaveLength(LINKED_TOOL_CATALOG.length);
    });

    it('appends the last query to the cards of tools that use the calculator inputs, once the effect has read storage', () => {
        writeLastToolQuery(QUERY);
        render();
        for (const entry of LINKED_TOOL_CATALOG) {
            expect(hrefOf(entry)).toBe(
                entry.usesCalculatorInputs
                    ? `${entry.route}?${QUERY}`
                    : entry.route,
            );
        }
        expect(
            LINKED_TOOL_CATALOG.some((entry) => entry.usesCalculatorInputs),
        ).toBe(true);
        expect(
            LINKED_TOOL_CATALOG.some((entry) => !entry.usesCalculatorInputs),
        ).toBe(true);
    });

    it('links every bare route when nothing was stored', () => {
        render();
        for (const entry of LINKED_TOOL_CATALOG) {
            expect(hrefOf(entry)).toBe(entry.route);
        }
    });

    it('links every bare route when reading storage throws', () => {
        writeLastToolQuery(QUERY);
        harness.mode = 'throwing';
        render();
        for (const entry of LINKED_TOOL_CATALOG) {
            expect(hrefOf(entry)).toBe(entry.route);
        }
    });

    it('links every bare route when there is no session storage', () => {
        writeLastToolQuery(QUERY);
        harness.mode = 'missing';
        render();
        for (const entry of LINKED_TOOL_CATALOG) {
            expect(hrefOf(entry)).toBe(entry.route);
        }
    });
});
