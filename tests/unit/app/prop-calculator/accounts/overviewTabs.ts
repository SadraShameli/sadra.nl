import { act, useSyncExternalStore } from 'react';

import {
    OVERVIEW_TAB_LABEL,
    type OverviewTab,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewSections';

const PAGE_ORIGIN = 'http://localhost';

export class FakeSearchNavigation {
    private readonly listeners = new Set<() => void>();
    private search = new URLSearchParams();
    readonly replacedHrefs: string[] = [];

    replace(href: string): void {
        this.replacedHrefs.push(href);
        this.search = new URLSearchParams(new URL(href, PAGE_ORIGIN).search);
        for (const listener of this.listeners) listener();
    }

    reset(search = ''): void {
        this.replacedHrefs.length = 0;
        this.search = new URLSearchParams(search);
    }

    searchParams(): URLSearchParams {
        return this.search;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}

export const overviewNavigation = new FakeSearchNavigation();

export function openOverviewTab(container: HTMLElement, tab: OverviewTab) {
    const trigger = [
        ...container.querySelectorAll<HTMLElement>('[role="tab"]'),
    ].find((candidate) => candidate.textContent === OVERVIEW_TAB_LABEL[tab]);
    if (trigger === undefined) throw new Error(`no ${tab} tab`);
    act(() => {
        trigger.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, button: 0 }),
        );
    });
}

export function useFakeSearchParams(
    navigation: FakeSearchNavigation,
): URLSearchParams {
    return useSyncExternalStore(
        (listener) => navigation.subscribe(listener),
        () => navigation.searchParams(),
    );
}
