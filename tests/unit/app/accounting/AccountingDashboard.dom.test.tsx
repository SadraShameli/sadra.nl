import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountingDashboard } from '~/app/(app)/accounting/_components/AccountingDashboard';
import { formatDisplayDate } from '~/lib/format';

const harness = vi.hoisted(() => ({
    credentials: {
        data: [
            {
                id: '00000000-0000-4000-8000-0000000000b1',
                isActive: true,
                kind: 'eboekhouden',
                label: 'Main',
            },
            {
                id: '00000000-0000-4000-8000-0000000000c1',
                isActive: true,
                kind: 'wise',
                label: 'Wise',
            },
        ],
        isPending: false,
    },
    latestDate: { data: undefined as string | undefined, isPending: true },
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
                list: { useQuery: () => harness.credentials },
            },
            mutations: {
                latestDate: { useQuery: () => harness.latestDate },
            },
        },
    },
}));

function runButton(container: HTMLElement): HTMLButtonElement {
    const button = [...container.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Run plan'),
    );
    if (button === undefined) throw new Error('no Run plan button');
    return button;
}

describe('the new run start date', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.latestDate = { data: undefined, isPending: true };
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
            root.render(<AccountingDashboard />);
        });
    }

    it('shows a placeholder, not the first of January, until the latest booking is known', () => {
        render();
        const newYear = formatDisplayDate(
            new Date(new Date().getFullYear(), 0, 1),
        );
        expect(container.textContent).not.toContain(newYear);
        expect(
            container.querySelector('[data-slot="skeleton"][role="status"]'),
        ).not.toBeNull();
        expect(runButton(container).disabled).toBe(true);
    });

    it('starts the day after the latest booking once it is known', () => {
        harness.latestDate = { data: '2026-10-06', isPending: false };
        render();
        expect(container.textContent).toContain(
            formatDisplayDate(new Date(2026, 9, 7)),
        );
        expect(runButton(container).disabled).toBe(false);
    });
});
