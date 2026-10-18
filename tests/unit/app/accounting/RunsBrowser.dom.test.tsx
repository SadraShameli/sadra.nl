import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunsBrowser } from '~/app/(app)/accounting/_components/RunsBrowser';
import { formatDisplayDateTime } from '~/lib/format';
import { routes } from '~/lib/site/routes';

import { openRowActions, rowActionItem } from '../../components/rowActionsMenu';

const RUN = vi.hoisted(() => ({
    accountingCredentialId: null,
    createdAt: new Date('2026-10-01T09:30:00Z'),
    id: '00000000-0000-4000-8000-0000000000aa',
    startDate: '2026-09-01',
    status: 'completed',
    summary: { bookingsCount: 3, totalEur: 42, unknownsCount: 0 },
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
            credentials: { list: { useQuery: () => ({ data: [] }) } },
            runs: {
                list: {
                    useQuery: () => ({
                        data: [RUN],
                        error: null,
                        isPending: false,
                    }),
                },
            },
        },
    },
}));

describe('the runs table', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<RunsBrowser />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('opens a run page from the row menu instead of an inline link icon', () => {
        const created = formatDisplayDateTime(RUN.createdAt);
        expect(
            container.querySelector(':scope tbody th[scope="row"]')
                ?.textContent,
        ).toBe(created);
        openRowActions(`run created ${created}`);
        expect(rowActionItem('Open').getAttribute('href')).toBe(
            routes.accounting.run(RUN.id),
        );
    });
});
