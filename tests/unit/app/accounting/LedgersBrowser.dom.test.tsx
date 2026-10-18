import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LedgersBrowser } from '~/app/(app)/accounting/_components/LedgersBrowser';
import { routes } from '~/lib/site/routes';

const harness = vi.hoisted(() => ({
    credentials: [] as {
        id: string;
        isActive: boolean;
        kind: string;
        label: string;
    }[],
}));

vi.mock('next/link', () => ({
    default: ({
        children,
        href,
        prefetch: _prefetch,
        ...rest
    }: {
        children: ReactNode;
        href: string;
        prefetch?: boolean;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        accounting: {
            credentials: {
                list: {
                    useQuery: () => ({
                        data: harness.credentials,
                        isPending: false,
                    }),
                },
            },
            ledgers: {
                list: {
                    useQuery: () => ({
                        data: [
                            {
                                category: 'BAL',
                                code: '1100',
                                description: 'Wise EUR',
                                externalId: '46557223',
                                group: null,
                            },
                            {
                                category: 'VW',
                                code: '4500',
                                description: 'Software',
                                externalId: '46557224',
                                group: null,
                            },
                        ],
                        error: null,
                        isPending: false,
                    }),
                },
            },
        },
    },
}));

describe('the ledgers table', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.credentials = [
            {
                id: '00000000-0000-4000-8000-0000000000b1',
                isActive: true,
                kind: 'eboekhouden',
                label: 'Main',
            },
        ];
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

    function render() {
        act(() => {
            root.render(<LedgersBrowser />);
        });
    }

    it('leaves out the group column when no ledger has a group', () => {
        render();
        const headers = [...container.querySelectorAll(':scope thead th')].map(
            (cell) => cell.textContent,
        );
        expect(headers).toContain('Description');
        expect(headers).not.toContain('Group');
    });

    it('sends you to Connections when no accounting connection exists', () => {
        harness.credentials = [];
        render();
        expect(container.textContent).not.toContain('Pick an accounting');
        expect(
            container.querySelector(
                `a[href="${CSS.escape(routes.accounting.connections)}"]`,
            )?.textContent,
        ).toBe('Open connections');
    });
});
