import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportView } from '~/app/(app)/prop-calculator/accounts/import/ImportView';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    function node(path: readonly string[]): unknown {
        return new Proxy(
            {},
            {
                get(_target, key) {
                    if (typeof key !== 'string') return;
                    const name = path.join('.');
                    if (key === 'useQuery') {
                        return () => queries.get(name) ?? pending;
                    }
                    if (key === 'useMutation') {
                        return () => ({
                            error: null,
                            isPending: false,
                            mutate: vi.fn(),
                            reset: vi.fn(),
                        });
                    }
                    return key === 'invalidate'
                        ? () => Promise.resolve()
                        : node([...path, key]);
                },
            },
        );
    }
    return {
        api: {
            propAccounts: node(['propAccounts']),
            useUtils: () => ({ propAccounts: node(['utils']) }),
        },
        queries,
    };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({ api: harness.api }));

const UNAUTHORIZED = 'UNAUTHORIZED';

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function failed(data: unknown): FakeQuery {
    return {
        data,
        error: new Error(UNAUTHORIZED),
        isError: true,
        isPending: false,
    };
}

describe('ImportView error notices', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<ImportView />);
        });
    }

    function alertDescription(): null | string | undefined {
        return container.querySelector(
            ':scope [role="alert"] [data-slot="alert-description"]',
        )?.textContent;
    }

    function openTab(name: string) {
        const tab = [
            ...container.querySelectorAll<HTMLElement>('[role="tab"]'),
        ].find((candidate) => candidate.textContent === name);
        if (tab === undefined) throw new Error(`no tab ${name}`);
        act(() => {
            tab.dispatchEvent(
                new MouseEvent('mousedown', { bubbles: true, button: 0 }),
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.queries.set('propAccounts.externalFirm.list', answer([]));
        harness.queries.set('propAccounts.snapshot.latestForAll', answer([]));
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

    it('ends the accounts failure with a full stop before saying the import is paused', () => {
        harness.queries.set('propAccounts.account.list', failed(undefined));
        render();
        expect(
            container.querySelector('[role="alert"]')?.textContent,
        ).toContain('The accounts could not be loaded');
        expect(alertDescription()).toBe(
            'UNAUTHORIZED. Import needs them to check labels, so it is paused.',
        );
    });

    it('ends the accounts refresh failure with a full stop before saying which list labels are checked against', () => {
        harness.queries.set('propAccounts.account.list', failed([]));
        render();
        const status = [...container.querySelectorAll('[role="status"]')].find(
            (candidate) =>
                candidate.textContent.includes(
                    'The account list could not be refreshed',
                ),
        );
        expect(status?.textContent).toContain(
            'UNAUTHORIZED. Labels are checked against the list loaded earlier',
        );
    });

    it('ends the firm list failure with a full stop before saying the account import is paused', () => {
        harness.queries.set('propAccounts.account.list', answer([]));
        harness.queries.set(
            'propAccounts.externalFirm.list',
            failed(undefined),
        );
        render();
        expect(
            container.querySelector('[role="alert"]')?.textContent,
        ).toContain('Your firms could not be loaded');
        expect(alertDescription()).toBe(
            'UNAUTHORIZED. Account import needs them to check firm names, so it is paused.',
        );
    });

    it('ends the stored snapshots failure with a full stop before saying the snapshot import is paused', () => {
        harness.queries.set('propAccounts.account.list', answer([]));
        harness.queries.set(
            'propAccounts.snapshot.latestForAll',
            failed(undefined),
        );
        render();
        openTab('Snapshots');
        expect(
            container.querySelector('[role="alert"]')?.textContent,
        ).toContain('The stored snapshots could not be loaded');
        expect(alertDescription()).toBe(
            'UNAUTHORIZED. Snapshot import needs them to avoid saving a second snapshot for the same account and date, so it is paused.',
        );
    });
});
