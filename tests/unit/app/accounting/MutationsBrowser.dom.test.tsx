import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MutationsBrowser } from '~/app/(app)/accounting/_components/MutationsBrowser';
import { DATA_TABLE_PAGE_SIZE } from '~/components/ui/data-table';
import { Eur } from '~/lib/accounting/core/money';
import { MutationType } from '~/lib/accounting/providers/eboekhouden/enums';
import { routes } from '~/lib/site/routes';

import { pickOption } from '../prop-calculator/accounts/pickOption';

interface CountInput {
    credentialId: string;
    dateFrom?: string;
    dateTo?: string;
}

interface Harness {
    countInputs: CountInput[];
    credentials: {
        id: string;
        isActive: boolean;
        kind: string;
        label: string;
    }[];
    ledgersError: null | { message: string };
    listOffsets: number[];
    totalCount: null | number;
}

const harness = vi.hoisted((): Harness => ({
    countInputs: [],
    credentials: [],
    ledgersError: null,
    listOffsets: [],
    totalCount: 137,
}));

const BANK_LEDGER_ID = '46557223';

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
                        data:
                            harness.ledgersError === null
                                ? [
                                      {
                                          category: 'BAL',
                                          code: '1100',
                                          description: 'Wise EUR',
                                          externalId: BANK_LEDGER_ID,
                                          group: null,
                                      },
                                  ]
                                : undefined,
                        error: harness.ledgersError,
                        isPending: false,
                    }),
                },
            },
            mutations: {
                count: {
                    useQuery: (input: CountInput) => {
                        harness.countInputs.push(input);
                        return { data: harness.totalCount };
                    },
                },
                list: {
                    useQuery: ({
                        limit,
                        offset,
                    }: {
                        limit: number;
                        offset: number;
                    }) => {
                        harness.listOffsets.push(offset);
                        return {
                            data: Array.from({ length: limit }, (_, index) => ({
                                amount: index === 0 ? 1906.86 : 12,
                                date: '2026-10-07',
                                description: null,
                                externalId: String(offset + index + 1),
                                ledgerId: BANK_LEDGER_ID,
                                paymentReference: null,
                                rows: [],
                                type:
                                    index === 0
                                        ? MutationType.MoneyReceived
                                        : MutationType.MoneySent,
                            })),
                            error: null,
                            isPending: false,
                        };
                    },
                },
            },
        },
    },
}));

const BOOKS = {
    id: '00000000-0000-4000-8000-0000000000b1',
    isActive: true,
    kind: 'eboekhouden',
    label: 'Main',
};

function headers(container: HTMLElement): string[] {
    return [...container.querySelectorAll(':scope thead th')].map(
        (cell) => cell.textContent,
    );
}

describe('the mutations table', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.countInputs = [];
        harness.credentials = [BOOKS];
        harness.ledgersError = null;
        harness.listOffsets = [];
        harness.totalCount = 137;
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
            root.render(<MutationsBrowser />);
        });
    }

    it('names the ledger by its code and name instead of its raw id', () => {
        render();
        const body = container.querySelector('tbody')?.textContent ?? '';
        expect(body).toContain('1100 Wise EUR');
        expect(body).not.toContain(BANK_LEDGER_ID);
    });

    it('blames the failed ledger list instead of calling the ledger unknown', () => {
        harness.ledgersError = { message: 'Rate limit reached' };
        render();
        const about = container.querySelector<HTMLButtonElement>(
            ':scope tbody button[aria-label="About Not available"]',
        );
        if (about === null) throw new Error('no ledger reason');
        act(() => {
            about.click();
        });
        const popover = document.body.querySelector(
            ':scope [data-slot="popover-content"]',
        );
        expect(popover?.textContent).toContain(BANK_LEDGER_ID);
        expect(popover?.textContent).toContain('Rate limit reached');
        expect(popover?.textContent).not.toContain('is not in the ledger list');
    });

    it('shows each amount in euros and hides the columns no row fills', () => {
        render();
        expect(headers(container)).toContain('Amount');
        expect(headers(container)).not.toContain('Description');
        expect(headers(container)).not.toContain('Reference');
        expect(container.querySelector('tbody')?.textContent).toContain(
            Eur.format(1906.86),
        );
    });

    it('keeps the next page reachable when a type filter hides rows of a full page', async () => {
        render();
        const typeFilter = [
            ...container.querySelectorAll<HTMLElement>('[role="combobox"]'),
        ].find((trigger) => trigger.textContent === 'All types');
        if (typeFilter === undefined) throw new Error('no type filter');
        await pickOption(typeFilter, 'Money received');
        const next = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Next',
        );
        expect(
            container.querySelectorAll(':scope tbody tr:not([aria-hidden])'),
        ).toHaveLength(1);
        expect(next?.disabled).toBe(false);
    });

    it('drops the backend total from the footer while a type filter hides rows', async () => {
        render();
        const typeFilter = [
            ...container.querySelectorAll<HTMLElement>('[role="combobox"]'),
        ].find((trigger) => trigger.textContent === 'All types');
        if (typeFilter === undefined) throw new Error('no type filter');
        await pickOption(typeFilter, 'Money received');
        expect(container.textContent).toContain('1 to 1');
        expect(container.textContent).not.toContain('of 137');
    });

    it('reads the total the backend counts in the page footer', () => {
        render();
        expect(container.textContent).toContain('1 to 25 of 137');
    });

    it('keeps one count for every page of the same date range', () => {
        render();
        const next = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Next',
        );
        if (next === undefined) throw new Error('no next button');
        act(() => {
            next.click();
        });
        expect(harness.listOffsets).toContain(DATA_TABLE_PAGE_SIZE);
        expect(container.textContent).toContain('26 to 50 of 137');
        expect(harness.countInputs.length).toBeGreaterThan(0);
        for (const input of harness.countInputs) {
            expect(input).toEqual({
                credentialId: BOOKS.id,
                dateFrom: undefined,
                dateTo: undefined,
            });
        }
    });

    it('pages on a full page when the backend cannot count its mutations', () => {
        harness.totalCount = null;
        render();
        const next = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Next',
        );
        expect(container.textContent).toContain('1 to 25');
        expect(container.textContent).not.toContain('1 to 25 of');
        expect(next?.disabled).toBe(false);
    });

    it('stops at the last page the backend counts', () => {
        harness.totalCount = 25;
        render();
        const next = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Next',
        );
        expect(container.textContent).toContain('1 to 25 of 25');
        expect(next?.disabled).toBe(true);
    });

    it('sends you to Connections when no accounting connection exists', () => {
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
