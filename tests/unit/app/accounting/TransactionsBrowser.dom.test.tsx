import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionsBrowser } from '~/app/(app)/accounting/_components/TransactionsBrowser';
import { routes } from '~/lib/site/routes';

const harness = vi.hoisted(() => ({
    credentials: [] as {
        id: string;
        isActive: boolean;
        kind: string;
        label: string;
    }[],
    hasTransactions: true,
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
            transactions: {
                list: {
                    useQuery: () => ({
                        data: harness.hasTransactions
                            ? [
                                  {
                                      date: '2026-10-07',
                                      direction: 'OUT',
                                      match: null,
                                      merchant: 'Anthropic',
                                      sourceAmount: 1175,
                                      sourceCurrency: 'USD',
                                      sourceFee: 0.5,
                                      sourceFeeCurrency: 'USD',
                                      sourceId: 'wise',
                                      txnId: 'card-1',
                                  },
                              ]
                            : [],
                        error: null,
                        isPending: false,
                    }),
                },
            },
        },
    },
}));

const WISE = {
    id: '00000000-0000-4000-8000-0000000000c1',
    isActive: true,
    kind: 'wise',
    label: 'Wise',
};

describe('the transactions table', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.credentials = [WISE];
        harness.hasTransactions = true;
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
            root.render(<TransactionsBrowser />);
        });
    }

    it('writes amounts and fees with the currency symbol and separators', () => {
        render();
        const body = container.querySelector('tbody')?.textContent ?? '';
        expect(body).toContain('$1,175.00');
        expect(body).toContain('$0.50');
        expect(body).not.toContain('USD');
    });

    it('says the source has no recent transactions when no filter is set', () => {
        harness.hasTransactions = false;
        render();
        expect(container.textContent).toContain('No transactions yet');
        expect(container.textContent).not.toContain('No matches');
        expect(
            container.querySelector(':scope [aria-label="Transaction date"]'),
        ).not.toBeNull();
    });

    it('sends you to Connections when no transaction source exists', () => {
        harness.credentials = [];
        render();
        expect(container.textContent).not.toContain('above');
        expect(
            container.querySelector(
                `a[href="${CSS.escape(routes.accounting.connections)}"]`,
            )?.textContent,
        ).toBe('Open connections');
    });
});
